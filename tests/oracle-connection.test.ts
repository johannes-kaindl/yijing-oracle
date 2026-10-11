import { describe, expect, it, vi } from "vitest";
import { makeFakeApp } from "./vendor/kit/obsidian-mock";
import { applyConnectionPatch, connectionSettings, createOracleConnection } from "../src/obsidian/connection";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/core/settings";
import { type SseTransport } from "../src/vendor/kit-obsidian/chat-client";
import { type BackendId, type FamilyId, type ThinkingLevel } from "../src/vendor/kit/sampling-profiles";

/* Die Verdrahtung des Plugins an die Kit-Verbindung: fester Modus creative, Settings lesen und
   schreiben, Schluessel je Zeile. Die goldenen Requests laufen durch createOracleConnection mit
   einem aufzeichnenden Transport — NICHT durch resolveRequestParams direkt, sonst pruefte der Test
   das Kit statt das Plugin (Rezept 8). Die Werte stehen als Tabelle (abgelesen aus der code-kit-
   Tabelle sampling-profiles): eine Aenderung dort bricht diesen Test sichtbar.
   Modus creative = Temperatur 0.7, Thinking-Default medium. */

interface Seen { url: string; body: Record<string, unknown>; headers: Record<string, string> }

function recordingTransport(seen: Seen[]): SseTransport {
  const answer = `data: ${JSON.stringify({ model: "srv", choices: [{ delta: { content: "Antwort" }, finish_reason: "stop" }] })}\n`;
  return {
    async postStream(url, body, headers, onChunk) {
      seen.push({ url, body: body as Record<string, unknown>, headers });
      onChunk(answer);
      return 200;
    },
  };
}

function fresh(): PluginSettings { return structuredClone(DEFAULT_SETTINGS); }

function setup(opts: { settings?: PluginSettings; backend?: BackendId } = {}) {
  const settings = opts.settings ?? fresh();
  const seen: Seen[] = [];
  const save = vi.fn(async () => {});
  const app = makeFakeApp();
  const conn = createOracleConnection({
    app, pluginId: "yijing-oracle", settings: () => settings, save,
    options: {
      probe: async () => true,
      listModels: async () => ["qwen/qwen3.6-35b-a3b", "google/gemma-4-26b"],
      backendOf: async () => opts.backend ?? "unknown",
      transports: { http: recordingTransport(seen), fallback: "none" },
      // Node kennt kein `window`; die Kit-Uhr nimmt sonst `window.setTimeout`.
      clock: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number, clearTimeout: (id) => clearTimeout(id) },
    },
  });
  return { conn, settings, seen, save, app };
}

/** Ein Modellname je Familie, den die Namens-Erkennung der Kit-Tabelle der Familie zuordnet. */
const MODEL_OF: Record<string, string> = {
  "qwen3.8": "qwen/qwen3.8-27b", "qwen3.6": "qwen/qwen3.6-35b-a3b", "gemma4": "google/gemma-4-26b",
  "gpt-oss": "openai/gpt-oss-20b", "null": "meine-eigene-schnitte",
};

type Row = [FamilyId | null, BackendId, ThinkingLevel, Record<string, number | string>];
const EXPECTED: Row[] = [
  ["qwen3.8", "lmstudio", "medium", {"temperature":0.7,"top_p":0.95,"top_k":20,"min_p":0,"reasoning_effort":"medium"}],
  ["qwen3.8", "lmstudio", "off", {"temperature":0.7,"top_p":0.8,"top_k":20,"min_p":0,"reasoning_effort":"none"}],
  ["qwen3.8", "openwebui", "off", {"temperature":0.7,"top_p":0.8,"top_k":20,"min_p":0,"presence_penalty":1.5,"reasoning_effort":"none"}],
  ["qwen3.8", "unknown", "medium", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"medium"}],
  ["qwen3.6", "lmstudio", "medium", {"temperature":0.7,"top_p":0.95,"top_k":20,"reasoning_effort":"medium"}],
  ["qwen3.6", "unknown", "off", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"none"}],
  ["gemma4", "lmstudio", "medium", {"temperature":0.7,"top_p":0.95,"top_k":64,"reasoning_effort":"medium"}],
  ["gemma4", "unknown", "off", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"none"}],
  ["gpt-oss", "lmstudio", "medium", {"temperature":0.7,"top_p":1,"reasoning_effort":"medium"}],
  ["gpt-oss", "lmstudio", "off", {"temperature":0.7,"top_p":1,"reasoning_effort":"minimal"}],
  [null, "lmstudio", "medium", {"temperature":0.7,"reasoning_effort":"medium"}],
  [null, "unknown", "off", {"temperature":0.7}],
];

/** Die Sampling-Felder des gesendeten Bodys (ohne Modell, Nachrichten, Stream-Schalter). */
function sampling(body: Record<string, unknown>): Record<string, unknown> {
  const { model: _m, messages: _msg, stream: _s, stream_options: _so, ...rest } = body;
  return rest;
}

describe("createOracleConnection — goldene Requests (Modus creative)", () => {
  it.each(EXPECTED)("Familie %s × Backend %s × Denken %s", async (family, backend, thinking, expected) => {
    const s = fresh();
    s.llm.endpoints = [{ url: "http://127.0.0.1:1234", model: MODEL_OF[String(family)] ?? "" }];
    s.request.thinking.creative = thinking;
    const t = setup({ settings: s, backend });
    const r = await t.conn.complete({ messages: [{ role: "user", content: "Frage" }] });
    expect(r.ok).toBe(true);
    expect(r.source.family).toBe(family);
    expect(sampling(t.seen[0]!.body)).toEqual(expected);
  });

  it("eine Ueberschreibung aus den Settings gewinnt vor Modus- und Familien-Wert", async () => {
    const s = fresh();
    s.llm.endpoints = [{ url: "http://127.0.0.1:1234", model: "qwen/qwen3.6-35b-a3b" }];
    s.request.overrides.creative = { "qwen3.6": { temperature: 1.1 } };
    const t = setup({ settings: s, backend: "lmstudio" });
    await t.conn.complete({ messages: [{ role: "user", content: "Frage" }] });
    expect(t.seen[0]!.body.temperature).toBe(1.1);
  });

  // Uebertragen aus llm-call.test.ts (26f2b7e): gpt-oss/harmony lehnt Thinking-Suppress-Felder mit
  // HTTP 400 ab — auch mit Denken "aus" duerfen sie nicht im Body stehen.
  it("gpt-oss: Denken aus sendet keine Suppress-Felder (lehnt chat_template_kwargs/reasoning_budget ab)", async () => {
    const s = fresh();
    s.llm.endpoints = [{ url: "http://127.0.0.1:1234", model: "openai/gpt-oss-20b" }];
    s.request.thinking.creative = "off";
    const t = setup({ settings: s, backend: "lmstudio" });
    await t.conn.complete({ messages: [{ role: "user", content: "Frage" }] });
    expect(t.seen[0]!.body).not.toHaveProperty("chat_template_kwargs");
    expect(t.seen[0]!.body).not.toHaveProperty("reasoning_budget");
  });
});

describe("createOracleConnection — Schluessel je Zeile", () => {
  it("sendet den Schluessel der aufgeloesten Zeile als Bearer und legt ihn in den Schluesselbund", async () => {
    const s = fresh();
    s.llm.endpoints = [{ url: "http://127.0.0.1:1234", model: "m", apiKey: "sk-zeile-eins" }];
    const t = setup({ settings: s });
    await t.conn.resolve({ force: true });
    expect(t.settings.llm.endpoints[0]).not.toHaveProperty("apiKey");
    const secretId = t.settings.llm.endpoints[0]?.secretId ?? "";
    expect(secretId).toMatch(/^yijing-oracle-ep-/);
    expect((t.app.secretStorage as { getSecret(id: string): string | null }).getSecret(secretId)).toBe("sk-zeile-eins");
    await t.conn.complete({ messages: [{ role: "user", content: "Frage" }] });
    expect(t.seen[0]!.headers.Authorization).toBe("Bearer sk-zeile-eins");
    expect(t.save).toHaveBeenCalled();
  });

  it("zwei Zeilen, zwei Schluessel: der erste erreichbare gewinnt", async () => {
    const s = fresh();
    s.llm.endpoints = [{ url: "http://a:1", model: "m", apiKey: "sk-a" }, { url: "http://b:2", model: "m", apiKey: "sk-b" }];
    const t = setup({ settings: s });
    const src = await t.conn.resolve({ force: true });
    expect(src.config?.url).toBe("http://a:1");
    expect(src.config?.apiKey).toBe("sk-a");
  });
});

describe("Settings <-> Verbindung", () => {
  it("connectionSettings laesst choice weg statt undefined zu liefern", () => {
    const s = fresh();
    expect(connectionSettings(s)).not.toHaveProperty("choice");
    s.llm.choice = { endpointId: "x" };
    expect(connectionSettings(s).choice).toEqual({ endpointId: "x" });
  });

  it("applyConnectionPatch schreibt synchron und fasst Unbenanntes nicht an", () => {
    const s = fresh();
    s.llm.choice = { endpointId: "x" };
    applyConnectionPatch(s, { endpoints: [{ url: "http://z:9" }] });
    expect(s.llm.endpoints).toEqual([{ url: "http://z:9" }]);
    expect(s.llm.choice).toEqual({ endpointId: "x" });
  });

  it("die Verbindung bekommt kein globales Modell mehr und schreibt keins", () => {
    const s = fresh();
    expect(connectionSettings(s)).not.toHaveProperty("model");
    applyConnectionPatch(s, { model: "x" } as never);
    expect(s.llm).not.toHaveProperty("model");
  });

  it("choice: undefined im Patch loescht die Wahl", () => {
    const s = fresh();
    s.llm.choice = { endpointId: "x" };
    applyConnectionPatch(s, { choice: undefined });
    expect(s.llm).not.toHaveProperty("choice");
  });

  it("der Anfrage-Abschnitt schreibt nach settings.request", () => {
    const s = fresh();
    const next = { ...s.request, thinking: { creative: "high" as const } };
    applyConnectionPatch(s, { request: next });
    expect(s.request.thinking.creative).toBe("high");
  });
});
