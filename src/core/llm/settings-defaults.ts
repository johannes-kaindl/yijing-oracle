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

/** Effektives Modell: das aktuell gewählte, falls gesetzt; sonst das erste verfügbare
 *  (leer, wenn keine Modelle bekannt). Pure — löst den „Dropdown-Default nicht gespeichert"-
 *  Fall: ein leeres `model` bei vorhandener Modell-Liste muss zum ersten Modell aufgelöst
 *  und persistiert werden, sonst zeigt das Dropdown ein Modell an, das nie gespeichert wurde. */
export function effectiveModel(current: string, available: string[]): string {
  if (current.trim()) return current;
  return available[0] ?? "";
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
