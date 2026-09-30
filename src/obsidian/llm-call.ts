import { normalizeEndpoint } from "../vendor/kit/endpoint";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import {
  resolveRequestParams,
  type BackendId, type FamilyId, type FieldId, type ResolvedRequest, type ThinkingLevel,
} from "../vendor/kit/sampling-profiles";
import type { ChatClient, ChatResult } from "../vendor/kit-obsidian/chat-client";
import { authHeaders } from "../core/llm/auth";
import type { ChatMessage } from "../core/llm/prompt";
import { MODE } from "../core/llm/request-settings";

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

/** Die Request-Bau-Funktion DES PLUGINS (Rezept 8): nur sie kennt yijings festen Modus. Die
 *  goldenen Requests laufen dagegen, nicht gegen resolveRequestParams direkt — sonst pruefte
 *  der Test das Kit statt das Plugin. gpt-oss/harmony lehnt Thinking-Felder mit HTTP 400 ab
 *  (0.6.1); das entscheidet die Familien-Tabelle (`canTurnOff`), nicht mehr ein Namens-Guard. */
export function buildInterpretationParams(input: {
  family: FamilyId | null;
  backend: BackendId;
  thinking: ThinkingLevel;
  overrides?: Partial<Record<FieldId, number | string>>;
}): ResolvedRequest {
  return resolveRequestParams({
    family: input.family, mode: MODE, backend: input.backend, thinking: input.thinking,
    ...(input.overrides ? { overrides: input.overrides } : {}),
  });
}

export function streamInterpretation(
  client: ChatClient,
  req: {
    endpoint: EndpointConfig;
    /** Modell, wie es tatsaechlich gesendet wird (nach `aliasOf`-Aufloesung). */
    model: string;
    messages: readonly ChatMessage[];
    params: Record<string, number | string>;
    onContent: (t: string) => void;
    onReasoning: (t: string) => void;
    signal?: AbortSignal;
  },
): Promise<ChatResult> {
  return client.complete({
    endpoint: req.endpoint,
    model: req.model,
    messages: req.messages,
    params: req.params,
    onToken: req.onContent,
    onReasoning: req.onReasoning,
    ...(req.signal ? { signal: req.signal } : {}),
  });
}
