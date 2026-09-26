import { normalizeEndpoint } from "../vendor/kit/endpoint";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import { isAlwaysOnThinker, suppressParams } from "../vendor/kit/reasoning";
import type { ChatClient, ChatResult } from "../vendor/kit-obsidian/chat-client";
import { authHeaders } from "../core/llm/auth";
import type { ChatMessage } from "../core/llm/prompt";

/** Zweiter Parameter sind Request-Header. Optional, damit ein Aufrufer ohne Auth
 *  (Bild-Backends, Tests) die Signatur unveraendert erfuellt. */
export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<{ status: number; json: unknown }>;

/** Verfügbare Modelle vom OpenAI-kompatiblen Endpoint (GET /v1/models). [] bei Fehler/Offline.
 *  `apiKey` ist bewusst PFLICHT: ein vergessener Aufrufer soll am Compiler auffallen — genau so
 *  blieb das Feld ueber vier Releases wirkungslos. Leer = lokaler Server, kein Authorization-Header. */
export async function listModels(endpoint: string, httpGet: HttpGet, apiKey: string): Promise<string[]> {
  try {
    const { status, json } = await httpGet(`${normalizeEndpoint(endpoint)}/v1/models`, authHeaders(apiKey));
    if (status !== 200) return [];
    const j = json as { data?: { id?: string }[] };
    return (j.data ?? []).map(m => m.id).filter((x): x is string => typeof x === "string").sort();
  } catch { return []; }
}

/** Felder der Deutungs-Anfrage neben Modell und Nachrichten. Bewusst KEINE eigenen
 *  Sampling-Werte: der Client hat nie welche gesendet, das Modell nutzt seine Server-Defaults.
 *  Thinking unterdruecken nur, wo das Modell es kann — gpt-oss/harmony lehnt die Felder mit
 *  HTTP 400 ab (0.6.1), deshalb der Guard gegen den tatsaechlich gesendeten Modellnamen. */
export function interpretationParams(model: string, suppressThinking: boolean): Record<string, unknown> {
  return suppressParams(suppressThinking && !isAlwaysOnThinker(model));
}

export function streamInterpretation(
  client: ChatClient,
  req: {
    endpoint: EndpointConfig;
    model: string;
    messages: readonly ChatMessage[];
    suppressThinking: boolean;
    onContent: (t: string) => void;
    onReasoning: (t: string) => void;
    signal?: AbortSignal;
  },
): Promise<ChatResult> {
  return client.complete({
    endpoint: req.endpoint,
    model: req.model,
    messages: req.messages,
    params: interpretationParams(req.model, req.suppressThinking),
    onToken: req.onContent,
    onReasoning: req.onReasoning,
    ...(req.signal ? { signal: req.signal } : {}),
  });
}
