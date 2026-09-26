import { describe, it, expect } from "vitest";
import { createChatClient, type SseTransport } from "../src/vendor/kit-obsidian/chat-client";
import type { ClockPort } from "../src/vendor/kit-obsidian/clock";
import { interpretationParams, listModels, streamInterpretation } from "../src/obsidian/llm-call";

/* Was der Kit-Client selbst kann (Abbruch, Fristen, Fehlerkoerper, Fallback ohne Stream) ist im
   Kit abgedeckt (MIGRATION 0.42.0, Punkt 5). Hier steht, was DIESES Plugin daraus macht: die
   Modell-Liste, die Parameter der Deutung und die Auth-Header. */

const nodeClock: ClockPort = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id as unknown as NodeJS.Timeout),
};

const sse = (t: string): string => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
const sseReasoning = (t: string): string => `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: t } }] })}\n\n`;

const recording = (chunks: string[] = [sse("x")], status = 200) => {
  const seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> } = { url: "", body: {}, headers: {} };
  const transport: SseTransport = {
    async postStream(url, body, headers, onChunk) {
      seen.url = url; seen.body = body as Record<string, unknown>; seen.headers = headers;
      for (const c of chunks) onChunk(c);
      return status;
    },
  };
  return { seen, client: createChatClient({ transport, clock: nodeClock }) };
};

describe("listModels", () => {
  it("parst /v1/models .data[].id sortiert", async () => {
    const httpGet = async (url: string): Promise<{ status: number; json: unknown }> => {
      expect(url).toBe("http://h:1234/v1/models");
      return { status: 200, json: { data: [{ id: "qwen" }, { id: "gemma" }] } };
    };
    expect(await listModels("http://h:1234/v1/", httpGet, "")).toEqual(["gemma", "qwen"]);
  });
  it("liefert [] bei nicht-200", async () => {
    expect(await listModels("http://h:1234", async () => ({ status: 500, json: null }), "")).toEqual([]);
  });
  it("sendet den Schluessel als Bearer an /v1/models", async () => {
    let gesehen: Record<string, string> | undefined;
    await listModels("http://h:1234", async (_u, headers) => { gesehen = headers; return { status: 200, json: { data: [] } }; }, "sk-geheim");
    expect(gesehen).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });
  it("sendet ohne Schluessel keinen Authorization-Header an /v1/models", async () => {
    let gesehen: Record<string, string> | undefined;
    await listModels("http://h:1234", async (_u, headers) => { gesehen = headers; return { status: 200, json: { data: [] } }; }, "");
    expect(gesehen ?? {}).not.toHaveProperty("Authorization");
  });
});

// Das Feld "API-Key" wurde bis 2026-09-02 gespeichert und NIE gesendet (401 ohne Hinweis) —
// deshalb gehoert der Bearer am Chat-Stream in die Regressionsliste.
describe("streamInterpretation — Anfrage", () => {
  const base = { messages: [{ role: "user" as const, content: "hi" }], suppressThinking: false, onContent: () => {}, onReasoning: () => {} };

  it("sendet den Schluessel als Bearer am Chat-Stream", async () => {
    const { seen, client } = recording();
    await streamInterpretation(client, { ...base, endpoint: { url: "http://h:1234", apiKey: "sk-geheim" }, model: "m" });
    expect(seen.url).toBe("http://h:1234/v1/chat/completions");
    expect(seen.headers).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });

  it("sendet ohne Schluessel keinen Authorization-Header", async () => {
    const { seen, client } = recording();
    await streamInterpretation(client, { ...base, endpoint: { url: "http://h:1234", apiKey: "" }, model: "m" });
    expect(seen.headers).not.toHaveProperty("Authorization");
  });

  it("liefert Antwort und Denktext getrennt an die Callbacks", async () => {
    const { client } = recording([sseReasoning("grübel"), sse("Antwort")]);
    let ans = ""; let rsn = "";
    const res = await streamInterpretation(client, {
      ...base, endpoint: { url: "http://h", apiKey: "" }, model: "m",
      onContent: (t) => { ans += t; }, onReasoning: (t) => { rsn += t; },
    });
    expect(res).toMatchObject({ ok: true, content: "Antwort", reasoning: "grübel" });
    expect(ans).toBe("Antwort");
    expect(rsn).toBe("grübel");
  });

  it("schickt keine eigenen Sampling-Werte (Alt-Verhalten: nur Suppress-Felder)", async () => {
    const { seen, client } = recording();
    await streamInterpretation(client, { ...base, endpoint: { url: "http://h", apiKey: "" }, model: "m" });
    expect(seen.body).not.toHaveProperty("temperature");
    expect(seen.body).not.toHaveProperty("max_tokens");
    expect(seen.body).toMatchObject({ model: "m", stream: true });
  });

  it("meldet den Servergrund bei einem HTTP-Fehler", async () => {
    const { client } = recording(['{"error":{"message":"model not loaded"}}'], 400);
    const res = await streamInterpretation(client, { ...base, endpoint: { url: "http://h", apiKey: "" }, model: "m" });
    expect(res).toMatchObject({ ok: false, kind: "http" });
    if (!res.ok) expect(res.detail).toContain("model not loaded");
  });
});

describe("interpretationParams — Thinking-Suppression", () => {
  it("unterdrückt Thinking bei suppressThinking NICHT für gpt-oss (always-on, lehnt reasoning_effort ab)", () => {
    const p = interpretationParams("openai/gpt-oss-20b", true);
    expect("reasoning_effort" in p).toBe(false);
    expect("chat_template_kwargs" in p).toBe(false);
    expect("reasoning_budget" in p).toBe(false);
  });
  it("unterdrückt Thinking bei suppressThinking weiterhin für ein Qwen-Modell", () => {
    const p = interpretationParams("qwen/qwen3.6-35b-a3b", true);
    expect(p.reasoning_effort).toBe("none");
    expect(p.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(p.reasoning_budget).toBe(0);
  });
  it("sendet ohne suppressThinking keine Suppress-Felder", () => {
    expect(interpretationParams("qwen/qwen3.6-35b-a3b", false)).toEqual({});
  });
});
