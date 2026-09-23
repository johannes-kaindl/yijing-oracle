import { streamSSE } from "./sse";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { isAlwaysOnThinker, suppressParams } from "../vendor/kit/reasoning";
import { authHeaders } from "../core/llm/auth";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; reasoning?: string }
/** Zweiter Parameter sind Request-Header. Optional, damit ein Aufrufer ohne Auth
 *  (Bild-Backends, Tests) die Signatur unveraendert erfuellt. */
export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<{ status: number; json: unknown }>;

export class ChatClient {
  private endpoint: string;
  constructor(
    endpoint: string,
    private model: string,
    private httpGet: HttpGet,
    /** Leer = lokaler Server ohne Auth; dann wird KEIN Authorization-Header gesendet.
     *  Bewusst PFLICHT und nicht optional: ein vergessener Aufrufer soll am Compiler
     *  auffallen. Genau so blieb das Feld ueber vier Releases wirkungslos. */
    private apiKey: string,
  ) {
    this.endpoint = normalizeEndpoint(endpoint);
  }

  /** Verfügbare Modelle vom OpenAI-kompatiblen Endpoint (GET /v1/models). [] bei Fehler/Offline. */
  async listModels(): Promise<string[]> {
    try {
      const { status, json } = await this.httpGet(`${this.endpoint}/v1/models`, authHeaders(this.apiKey));
      if (status !== 200) return [];
      const j = json as { data?: { id?: string }[] };
      return (j.data ?? []).map(m => m.id).filter((x): x is string => typeof x === "string").sort();
    } catch { return []; }
  }

  async stream(
    messages: ChatMessage[],
    onContent: (t: string) => void,
    onReasoning: (t: string) => void,
    signal?: AbortSignal,
    opts?: { model?: string; suppressThinking?: boolean },
  ): Promise<{ content: string; reasoning: string }> {
    const effectiveModel = opts?.model ?? this.model;
    const body = JSON.stringify({
      model: effectiveModel,
      messages,
      stream: true,
      ...suppressParams((opts?.suppressThinking ?? false) && !isAlwaysOnThinker(effectiveModel)),
    });
    const { content, reasoning } = await streamSSE(
      `${this.endpoint}/v1/chat/completions`,
      { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(this.apiKey) }, body },
      onContent, onReasoning, signal,
    );
    return { content, reasoning };
  }
}
