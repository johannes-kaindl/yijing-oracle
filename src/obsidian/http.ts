// Einziger Netz-Helfer über Obsidians `requestUrl` (CORS-frei, mobil-tauglich) — kapselt den
// obsidian-Import, damit ChatClient obsidian-frei + in Node testbar bleibt. Streaming (SSE) geht
// bewusst über XHR (streamSSE); requestUrl kann nicht streamen.
import { requestUrl } from "obsidian";
import { classifyEndpointStatus, type EndpointStatus } from "../vendor/kit/endpoint_diagnostics";

/** Passt zu `HttpGet` in chat-client.ts. */
export async function httpGet(url: string): Promise<{ status: number; json: unknown }> {
  const r = await requestUrl({ url, throw: false });
  let json: unknown = undefined;
  try { json = r.json; } catch { /* nicht-JSON-Body → json bleibt undefined */ }
  return { status: r.status, json };
}

/** Passt zu `HttpPostJson` in image-client.ts. Eigener Timeout via Promise.race,
 *  weil requestUrl weder timeout noch Abort kennt (Bildgenerierung dauert Minuten). */
export async function httpPostJson(url: string, body: unknown, timeoutMs = 180000): Promise<{ status: number; json: unknown }> {
  let timer: number | undefined;
  const timeout = new Promise<"__timeout__">((resolve) => {
    timer = window.setTimeout(() => resolve("__timeout__"), timeoutMs);
  });
  try {
    const raced = await Promise.race([
      requestUrl({ url, method: "POST", contentType: "application/json", body: JSON.stringify(body), throw: false }).then((r) => {
        let json: unknown = undefined;
        try { json = r.json; } catch { /* nicht-JSON-Body → json bleibt undefined */ }
        return { status: r.status, json } as const;
      }),
      timeout,
    ]);
    if (raced === "__timeout__") throw new Error(`timeout after ${timeoutMs} ms`);
    return raced;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

/** Erreichbarkeits-Probe (GET <baseUrl>/v1/models) mit Klartext-Diagnose. baseUrl normalisiert.
 *  Eigener Timeout via Promise.race, weil requestUrl weder timeout noch Abort kennt. */
export async function probeEndpoint(baseUrl: string, timeoutMs = 5000): Promise<EndpointStatus> {
  const url = `${baseUrl}/v1/models`;
  let timer: number | undefined;
  const timeout = new Promise<"__timeout__">(resolve => {
    timer = window.setTimeout(() => resolve("__timeout__"), timeoutMs);
  });
  try {
    const raced = await Promise.race([
      requestUrl({ url, throw: false }).then(r => {
        let body: unknown = undefined;
        try { body = r.json; } catch { /* nicht-JSON → body bleibt undefined */ }
        return { status: r.status, body } as const;
      }),
      timeout,
    ]);
    if (raced === "__timeout__") return classifyEndpointStatus({ kind: "timeout" });
    return classifyEndpointStatus({ kind: "response", status: raced.status, body: raced.body });
  } catch (e) {
    const message = String((e as { message?: string })?.message ?? e);
    return classifyEndpointStatus({ kind: "error", message });
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
