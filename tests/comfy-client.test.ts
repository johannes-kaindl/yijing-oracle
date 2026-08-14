import { describe, expect, it } from "vitest";
import { ComfyClient, type ComfyTransport } from "../src/core/comfy/client";
import { type ImageRequest } from "../src/core/image-backend";
import sdxl from "./fixtures/comfy-sdxl.json";

const WORKFLOW = JSON.stringify(sdxl);
const REQ: ImageRequest = {
  prompt: "a lake", negativePrompt: "text", width: 768, height: 768, steps: null, seed: 42,
};

/** Baut einen Transport-Stub. `historySteps` wird pro Poll-Aufruf der Reihe nach geliefert. */
function stub(opts: {
  promptResponse?: { status: number; json: unknown };
  historySteps?: unknown[];
  base64?: string;
}) {
  const calls: { url: string; body?: unknown }[] = [];
  let poll = 0;
  const history = opts.historySteps ?? [];
  const transport: ComfyTransport = {
    postJson: async (url, body) => {
      calls.push({ url, body });
      return opts.promptResponse ?? { status: 200, json: { prompt_id: "PID", node_errors: {} } };
    },
    getJson: async (url) => {
      calls.push({ url });
      const step = history[Math.min(poll, history.length - 1)];
      poll++;
      return { status: 200, json: step };
    },
    getBase64: async (url) => {
      calls.push({ url });
      return { status: 200, base64: opts.base64 ?? "QkFTRTY0" };
    },
    sleep: async () => {},
    now: (() => { let t = 0; return () => (t += 1000); })(),
  };
  return { transport, calls };
}

const DONE = {
  PID: {
    status: { status_str: "success", completed: true, messages: [] },
    outputs: { "9": { images: [{ filename: "x.png", subfolder: "", type: "output" }] } },
  },
};

describe("ComfyClient", () => {
  it("sendet den gepatchten Workflow und liefert das Bild als Base64", async () => {
    const { transport, calls } = stub({ historySteps: [DONE] });
    const client = new ComfyClient("http://127.0.0.1:8000/", WORKFLOW, transport, { clientId: "CID" });
    const png = await client.generate(REQ);

    expect(png).toBe("QkFTRTY0");
    expect(calls[0].url).toBe("http://127.0.0.1:8000/prompt");
    const body = calls[0].body as { prompt: Record<string, { inputs: Record<string, unknown> }>; client_id: string };
    expect(body.client_id).toBe("CID");
    expect(body.prompt["6"].inputs.text).toBe("a lake");
    expect(body.prompt["3"].inputs.seed).toBe(42);
    expect(body.prompt["3"].inputs.steps).toBe(6); // steps: null → Workflow gewinnt
  });

  it("pollt, bis outputs da sind", async () => {
    const pending = { PID: { status: { status_str: "running", completed: false, messages: [] }, outputs: {} } };
    const { transport, calls } = stub({ historySteps: [pending, pending, DONE] });
    await new ComfyClient("http://x", WORKFLOW, transport).generate(REQ);
    expect(calls.filter((c) => c.url.includes("/history/")).length).toBe(3);
  });

  it("reicht subfolder und type aus der Antwort an /view durch", async () => {
    const preview = {
      PID: {
        status: { status_str: "success", completed: true, messages: [] },
        outputs: { "9": { images: [{ filename: "y.png", subfolder: "sub", type: "temp" }] } },
      },
    };
    const { transport, calls } = stub({ historySteps: [preview] });
    await new ComfyClient("http://x", WORKFLOW, transport).generate(REQ);
    const view = calls.find((c) => c.url.includes("/view"))!;
    expect(view.url).toContain("filename=y.png");
    expect(view.url).toContain("subfolder=sub");
    expect(view.url).toContain("type=temp");
  });

  it("wirft mit Server-Klartext, wenn ComfyUI den Workflow ablehnt", async () => {
    const { transport } = stub({
      promptResponse: { status: 400, json: { error: { message: "model not found" } } },
    });
    await expect(new ComfyClient("http://x", WORKFLOW, transport).generate(REQ))
      .rejects.toThrow(/model not found/);
  });

  it("wirft bei node_errors trotz HTTP 200", async () => {
    const { transport } = stub({
      promptResponse: { status: 200, json: { prompt_id: "PID", node_errors: { "3": ["bad input"] } } },
    });
    await expect(new ComfyClient("http://x", WORKFLOW, transport).generate(REQ)).rejects.toThrow();
  });

  it("wirft bei einem Ausführungsfehler aus der History", async () => {
    const failed = {
      PID: {
        status: { status_str: "error", completed: false,
                  messages: [["execution_error", { exception_message: "OOM on device" }]] },
        outputs: {},
      },
    };
    const { transport } = stub({ historySteps: [failed] });
    await expect(new ComfyClient("http://x", WORKFLOW, transport).generate(REQ))
      .rejects.toThrow(/OOM on device/);
  });

  it("wirft nach Ablauf des Timeouts", async () => {
    const pending = { PID: { status: { status_str: "running", completed: false, messages: [] }, outputs: {} } };
    const { transport } = stub({ historySteps: [pending] });
    const client = new ComfyClient("http://x", WORKFLOW, transport, { timeoutMs: 3000 });
    await expect(client.generate(REQ)).rejects.toThrow(/timeout/i);
  });

  it("wirft mit klarer Meldung, wenn kein Workflow hinterlegt ist", async () => {
    const { transport } = stub({ historySteps: [DONE] });
    await expect(new ComfyClient("http://x", "", transport).generate(REQ)).rejects.toThrow(/workflow/i);
  });

  it("wirft, wenn der Graph mehrdeutig ist", async () => {
    const two = JSON.parse(WORKFLOW);
    two["11"] = { class_type: "KSampler", inputs: {
      seed: 1, steps: 5, positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } };
    const { transport } = stub({ historySteps: [DONE] });
    await expect(new ComfyClient("http://x", JSON.stringify(two), transport).generate(REQ))
      .rejects.toThrow();
  });

  it("meldet Fortschritt, wenn ein Progress-Kanal übergeben wurde", async () => {
    const seen: { value: number; max: number }[] = [];
    const { transport } = stub({ historySteps: [DONE] });
    const client = new ComfyClient("http://x", WORKFLOW, transport, {
      onProgress: (p) => seen.push(p),
    });
    client.reportProgress({ value: 3, max: 8 });
    await client.generate(REQ);
    expect(seen).toEqual([{ value: 3, max: 8 }]);
  });
});
