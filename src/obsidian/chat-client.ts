import { streamSSE } from "./sse";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { suppressParams } from "../vendor/kit/reasoning";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; reasoning?: string }
export type HttpGet = (url: string) => Promise<{ status: number; json: unknown }>;

export class ChatClient {
  private endpoint: string;
  constructor(endpoint: string, private model: string, private httpGet: HttpGet) {
    this.endpoint = normalizeEndpoint(endpoint);
  }

  /** Verfügbare Modelle vom OpenAI-kompatiblen Endpoint (GET /v1/models). [] bei Fehler/Offline. */
  async listModels(): Promise<string[]> {
    try {
      const { status, json } = await this.httpGet(`${this.endpoint}/v1/models`);
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
    const body = JSON.stringify({
      model: opts?.model ?? this.model,
      messages,
      stream: true,
      ...suppressParams(opts?.suppressThinking ?? false),
    });
    const { content, reasoning } = await streamSSE(
      `${this.endpoint}/v1/chat/completions`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      onContent, onReasoning, signal,
    );
    return { content, reasoning };
  }
}
