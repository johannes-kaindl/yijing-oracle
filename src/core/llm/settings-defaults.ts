import { type ThinkingInNote } from "./interpretation";

/** LLM-Deutungs-Konfiguration. Pure (kein obsidian) — von settings.ts re-exportiert. */
export interface LlmSettings {
  /** Textarea, eine Endpunkt-URL pro Zeile. */
  endpoints: string;
  /** Aktive Endpunkt-URL (eine der Zeilen; wird beim Aufruf normalisiert). */
  activeEndpoint: string;
  /** Optionaler API-Key (leer für lokale Server). */
  apiKey: string;
  /** Zuletzt gewähltes Modell. */
  model: string;
  /** Leer → DEFAULT_SYSTEM_PROMPT.de. */
  systemPromptDe: string;
  /** Leer → DEFAULT_SYSTEM_PROMPT.en. */
  systemPromptEn: string;
  /** Thinking beim Modell anfordern (steuert suppressParams). */
  requestThinking: boolean;
  /** Wie Reasoning in die gespeicherte Note wandert. */
  thinkingInNote: ThinkingInNote;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  endpoints: "http://localhost:1234",
  activeEndpoint: "http://localhost:1234",
  apiKey: "",
  model: "",
  systemPromptDe: "",
  systemPromptEn: "",
  requestThinking: true,
  thinkingInNote: "closed-callout",
};
