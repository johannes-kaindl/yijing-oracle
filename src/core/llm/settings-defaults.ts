import { type ThinkingInNote } from "./interpretation";
import { type EndpointChoice } from "../../vendor/kit/endpoint-source";

/** LLM-Deutungs-Konfiguration. Pure (kein obsidian) — von settings.ts re-exportiert. */
export interface LlmSettings {
  /** Geordnete Endpunkt-Liste. Die Reihenfolge IST die Priorität: der erste erreichbare
   *  gewinnt (resolveActiveEndpoint). Ein separates activeEndpoint-Feld gibt es bewusst
   *  nicht mehr — der Nutzer sortiert um, statt auszuwählen.
   *  Gilt nur fuer den LOKALEN Fallback-Pfad (kein LLM Endpoint Manager installiert oder vom
   *  Manager kein Endpunkt geliefert) — seit der Endpunkt-Manager-Migration (2026-09-16). */
  endpoints: string[];
  /** Optionaler API-Key (leer für lokale Server). Gilt fuer jede Zeile aus `endpoints`
   *  (lokaler Pfad); der Manager verwaltet seine eigenen Tokens selbst. */
  apiKey: string;
  /** Zuletzt gewähltes Modell (lokaler Pfad, wenn `choice.model` leer ist). */
  model: string;
  /** Wahl gegenueber dem LLM Endpoint Manager (Endpunkt + Modell) — wirkt nur, wenn der
   *  Manager installiert ist. Leer/fehlend = "automatisch" (Manager entscheidet). */
  choice?: EndpointChoice;
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
  endpoints: ["http://localhost:1234"],
  apiKey: "",
  model: "",
  systemPromptDe: "",
  systemPromptEn: "",
  requestThinking: true,
  thinkingInNote: "closed-callout",
};
