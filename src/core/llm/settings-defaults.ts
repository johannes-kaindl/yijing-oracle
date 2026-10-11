import { type ThinkingInNote } from "./interpretation";
import { type EndpointChoice } from "../../vendor/kit/endpoint-source";
import { type EndpointConfig } from "../../vendor/kit/endpoint_config";

/** LLM-Deutungs-Konfiguration. Pure (kein obsidian) — von settings.ts re-exportiert. */
export interface LlmSettings {
  /** Geordnete Endpunkt-Liste (lokaler Pfad). Die Reihenfolge IST die Priorität: der erste
   *  erreichbare gewinnt. Der API-Schlüssel steht je Zeile im Obsidian-Schlüsselbund
   *  (`secretId`), nicht in dieser Datei — das Kit überführt Klartext beim ersten Auflösen.
   *  Gilt nur ohne LLM Endpoint Manager (oder wenn der Manager keinen Endpunkt liefert). */
  endpoints: EndpointConfig[];
  /** Abgeschafft (Welle 17): das Modell steht je Endpunkt-Zeile. Nur noch, bis die Zeile „Modell“ und die
   *  Panel-Wahl auf die Zeilen umgestellt sind; geladen wird es nie (`migrateLlmSettings` entfernt es). */
  model?: string;
  /** Wahl gegenueber dem LLM Endpoint Manager (Endpunkt + Modell) — wirkt nur, wenn der
   *  Manager installiert ist. Leer/fehlend = "automatisch" (Manager entscheidet). */
  choice?: EndpointChoice;
  /** Leer → DEFAULT_SYSTEM_PROMPT.de. */
  systemPromptDe: string;
  /** Leer → DEFAULT_SYSTEM_PROMPT.en. */
  systemPromptEn: string;
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
  endpoints: [{ url: "http://localhost:1234" }],
  systemPromptDe: "",
  systemPromptEn: "",
  thinkingInNote: "closed-callout",
};
