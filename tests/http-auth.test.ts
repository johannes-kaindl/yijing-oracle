import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { requestUrl } from "obsidian";
import { httpGet } from "../src/obsidian/http";

// Die Erreichbarkeits-Probe der LLM-Endpunkte liegt seit der Verbindung im Kit (llm-connection).
// Hier bleiben die zwei Netzwege des Plugins, die einen Schluessel mitschicken muessen: der
// gemeinsame httpGet.

const mock = requestUrl as unknown as {
  mock: { calls: unknown[][] };
  mockImplementation(impl: (...args: never[]) => unknown): unknown;
  mockClear(): unknown;
};

/** http.ts nimmt window.setTimeout (requestUrl kennt keinen Timeout). Im Node-Env
 *  gibt es kein window — hier das Noetigste stellen. */
function stubWindow(): () => void {
  const g = globalThis as unknown as { window?: unknown };
  const vorher = g.window;
  g.window = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
  return () => { if (vorher === undefined) delete g.window; else g.window = vorher; };
}

let restore: () => void;
beforeEach(() => {
  restore = stubWindow();
  mock.mockClear();
  mock.mockImplementation((() => Promise.resolve({ status: 200, json: { data: [] }, headers: {}, text: "" })) as never);
});
afterEach(() => { restore(); });

/** Erstes Argument des letzten requestUrl-Aufrufs. */
function letzterAufruf(): { url: string; headers?: Record<string, string> } {
  const calls = mock.mock.calls;
  return calls[calls.length - 1]?.[0] as { url: string; headers?: Record<string, string> };
}

describe("http.ts — Authorization-Header", () => {
  it("reicht Header durch httpGet durch", async () => {
    await httpGet("http://h:1234/v1/models", { Authorization: "Bearer sk-geheim" });
    expect(letzterAufruf().headers).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });
});
