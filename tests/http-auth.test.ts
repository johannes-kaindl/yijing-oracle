import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { requestUrl } from "obsidian";
import { fetchModelContext, httpGet, probeEndpoint } from "../src/obsidian/http";

// Die Erreichbarkeits-Probe ist der Netzweg, der beim Nachruesten einer Authentifizierung
// am leichtesten vergessen wird — und ihr Vergessen ist das teuerste: ohne Schluessel
// antwortet ein externer Anbieter mit 401, der Endpunkt gilt damit nie als erreichbar und
// wird von resolveActiveEndpoint still uebersprungen. Das Feature wirkt tot, ohne Meldung.
// (Derselbe Punkt ist in vault-rags Spec als der uebersehene markiert.)

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
  it("sendet den Schluessel an der Erreichbarkeits-Probe", async () => {
    await probeEndpoint("http://h:1234", { Authorization: "Bearer sk-geheim" });
    expect(letzterAufruf().url).toBe("http://h:1234/v1/models");
    expect(letzterAufruf().headers).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });

  it("sendet ohne Schluessel keinen Authorization-Header an der Probe", async () => {
    await probeEndpoint("http://h:1234", {});
    expect(letzterAufruf().headers ?? {}).not.toHaveProperty("Authorization");
  });

  it("reicht Header durch httpGet durch", async () => {
    await httpGet("http://h:1234/v1/models", { Authorization: "Bearer sk-geheim" });
    expect(letzterAufruf().headers).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });

  it("sendet den Schluessel auch an die LM-Studio-Kontextabfrage", async () => {
    mock.mockImplementation((() => Promise.resolve({ status: 200, json: { data: [] }, headers: {}, text: "" })) as never);
    await fetchModelContext("http://h:1234", "m", { Authorization: "Bearer sk-geheim" });
    expect(letzterAufruf().url).toBe("http://h:1234/api/v0/models");
    expect(letzterAufruf().headers).toMatchObject({ Authorization: "Bearer sk-geheim" });
  });
});
