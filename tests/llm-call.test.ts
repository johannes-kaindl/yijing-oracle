import { describe, it, expect } from "vitest";
import { ChatClient } from "../src/obsidian/chat-client";

describe("ChatClient.listModels", () => {
  it("parst /v1/models .data[].id sortiert", async () => {
    const httpGet = async (url: string): Promise<{ status: number; json: unknown }> => {
      expect(url).toBe("http://h:1234/v1/models");
      return { status: 200, json: { data: [{ id: "qwen" }, { id: "gemma" }] } };
    };
    const c = new ChatClient("http://h:1234/v1/", "qwen", httpGet, "");
    expect(await c.listModels()).toEqual(["gemma", "qwen"]);
  });
  it("liefert [] bei nicht-200", async () => {
    const c = new ChatClient("http://h:1234", "m", async () => ({ status: 500, json: null }), "");
    expect(await c.listModels()).toEqual([]);
  });
});

// --- Authorization-Header (2026-09-02) -------------------------------------------------
// Das Feld "API-Key" in den Einstellungen wurde bis dahin gespeichert und NIE gesendet:
// grep nach Authorization/Bearer fand in src/ nur das Eingabefeld. Wer einen externen,
// OpenAI-kompatiblen Anbieter eintrug, bekam 401 — ohne verwertbaren Hinweis, weil das
// Feld ja sichtbar gefuellt war.

/** Zeichnet die gesetzten Header auf, statt sie zu verwerfen (anders als der FakeXHR in
 *  streamSSE.test.ts, den nur der Datenstrom interessiert). */
class HeaderRecordingXHR {
  static letzte: Record<string, string> = {};
  static letzterBody = "";
  status = 200;
  responseText = "";
  onprogress: (() => void) | undefined;
  onload: (() => void) | undefined;
  onerror: (() => void) | undefined;
  onabort: (() => void) | undefined;
  open(): void { HeaderRecordingXHR.letzte = {}; }
  setRequestHeader(k: string, v: string): void { HeaderRecordingXHR.letzte[k] = v; }
  send(body?: string): void {
    HeaderRecordingXHR.letzterBody = body ?? "";
    this.responseText = 'data: {"choices":[{"delta":{"content":"x"}}]}\ndata: [DONE]\n';
    this.onprogress?.();
    this.onload?.();
  }
  abort(): void { this.onabort?.(); }
}

describe("ChatClient — Authentifizierung", () => {
  it("sendet den Schluessel als Bearer an /v1/models", async () => {
    let gesehen: Record<string, string> | undefined;
    const httpGet = async (_url: string, headers?: Record<string, string>) => {
      gesehen = headers;
      return { status: 200, json: { data: [{ id: "m" }] } };
    };
    const c = new ChatClient("http://h:1234", "m", httpGet, "sk-geheim");
    await c.listModels();
    expect(gesehen).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });

  it("sendet ohne Schluessel keinen Authorization-Header an /v1/models", async () => {
    let gesehen: Record<string, string> | undefined;
    const httpGet = async (_url: string, headers?: Record<string, string>) => {
      gesehen = headers;
      return { status: 200, json: { data: [] } };
    };
    const c = new ChatClient("http://h:1234", "m", httpGet, "");
    await c.listModels();
    expect(gesehen ?? {}).not.toHaveProperty("Authorization");
  });

  it("sendet den Schluessel als Bearer am Chat-Stream", async () => {
    const g = globalThis as unknown as { XMLHttpRequest?: unknown };
    const vorher = g.XMLHttpRequest;
    g.XMLHttpRequest = HeaderRecordingXHR;
    try {
      const c = new ChatClient("http://h:1234", "m", async () => ({ status: 200, json: null }), "sk-geheim");
      await c.stream([{ role: "user", content: "hi" }], () => {}, () => {});
      expect(HeaderRecordingXHR.letzte).toMatchObject({
        "Content-Type": "application/json",
        Authorization: "Bearer sk-geheim",
      });
    } finally {
      if (vorher === undefined) delete g.XMLHttpRequest; else g.XMLHttpRequest = vorher;
    }
  });
});

describe("ChatClient — Thinking-Suppression", () => {
  const mitFakeXHR = async (fn: () => Promise<void>): Promise<void> => {
    const g = globalThis as unknown as { XMLHttpRequest?: unknown };
    const vorher = g.XMLHttpRequest;
    g.XMLHttpRequest = HeaderRecordingXHR;
    try { await fn(); } finally {
      if (vorher === undefined) delete g.XMLHttpRequest; else g.XMLHttpRequest = vorher;
    }
  };

  it("unterdrückt Thinking bei suppressThinking NICHT für gpt-oss (always-on, lehnt reasoning_effort ab)", async () => {
    await mitFakeXHR(async () => {
      const c = new ChatClient("http://h:1234", "m", async () => ({ status: 200, json: null }), "");
      await c.stream([{ role: "user", content: "hi" }], () => {}, () => {}, undefined, { model: "openai/gpt-oss-20b", suppressThinking: true });
      const body = JSON.parse(HeaderRecordingXHR.letzterBody) as Record<string, unknown>;
      expect("reasoning_effort" in body).toBe(false);
      expect("chat_template_kwargs" in body).toBe(false);
      expect("reasoning_budget" in body).toBe(false);
    });
  });

  it("unterdrückt Thinking bei suppressThinking weiterhin für ein Qwen-Modell", async () => {
    await mitFakeXHR(async () => {
      const c = new ChatClient("http://h:1234", "m", async () => ({ status: 200, json: null }), "");
      await c.stream([{ role: "user", content: "hi" }], () => {}, () => {}, undefined, { model: "qwen/qwen3.6-35b-a3b", suppressThinking: true });
      const body = JSON.parse(HeaderRecordingXHR.letzterBody) as { reasoning_effort: string; chat_template_kwargs: unknown; reasoning_budget: number };
      expect(body.reasoning_effort).toBe("none");
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
      expect(body.reasoning_budget).toBe(0);
    });
  });
});
