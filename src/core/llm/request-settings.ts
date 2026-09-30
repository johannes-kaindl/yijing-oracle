// Sampling-Profile (Modus creative): Laden und Migrieren des `request`-Blocks. Pure — kein
// obsidian-Import, `check:pure`-gated. Form nach lingotuner/src/core/settings.ts (Rezept 3).
import { onLevelFor, sanitizeRequestSettings, type RequestSettings } from "../../vendor/kit/sampling-profiles";

/** Modus dieses Plugins in der Sampling-Profile-Tabelle — die Deutung ist freie, deutende
 *  Rede, kein Formatieren (Spec § 4.1: "creative"). Nur EIN Modus, deshalb fest verdrahtet. */
export const MODE = "creative";

export interface RequestLoadResult { request: RequestSettings; dropped: string[] }

/** Saeubert den persistierten `request`-Block und migriert das alte `llm.requestThinking`
 *  einmalig nach `request.thinking.creative` — nur wenn dort noch nichts explizit gesetzt ist.
 *  `requestThinking: true` (der alte Default) wird zur Einschalt-Stufe des Modus, `false` zu
 *  "off". `dropped` meldet der Aufrufer (Notice + console.warn), es wird nicht verworfen
 *  (CORE-DATA-01). `raw` ist das komplette geladene Datenobjekt. */
export function loadRequestSettings(raw: unknown): RequestLoadResult {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { settings, dropped } = sanitizeRequestSettings(r.request);
  const llm = r.llm !== null && typeof r.llm === "object" ? (r.llm as Record<string, unknown>) : {};
  if (typeof llm.requestThinking === "boolean" && settings.thinking[MODE] === undefined) {
    settings.thinking[MODE] = llm.requestThinking ? onLevelFor(settings, MODE) : "off";
  }
  return { request: settings, dropped };
}
