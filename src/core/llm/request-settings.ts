// Sampling-Profile (Modus creative): Laden und Migrieren des `request`-Blocks. Pure — kein
// obsidian-Import, `check:pure`-gated. Der Lader selbst liegt im Kit (code-kit sampling-profiles);
// hier bleibt nur die Form des alten Schalters als Migration.
import {
  foldLegacyThinking,
  type LegacyRequestMigration,
  type RequestLoadResult,
} from "../../vendor/kit/sampling-profiles";

export type { RequestLoadResult };

/** Modus dieses Plugins in der Sampling-Profile-Tabelle — die Deutung ist freie, deutende
 *  Rede, kein Formatieren (Spec § 4.1: "creative"). Nur EIN Modus, deshalb fest verdrahtet. */
export const MODE = "creative";

/** `llm.requestThinking` war ein EINSCHALTER (true = Denken an), das Kit faltet einen
 *  Unterdrückungs-Schalter (true = aus): deshalb die Negation. `true` (der alte Default) wird zur
 *  Einschalt-Stufe des Modus, `false` zu "off". Nur wenn dort noch nichts explizit gesetzt ist.
 *  Der Aufrufer reicht die Liste an `loadRequestSettings` (Kit) durch und meldet `dropped` selbst
 *  (Notice + console.warn, CORE-DATA-01). */
export const REQUEST_MIGRATIONS: readonly LegacyRequestMigration[] = [(raw, request) => {
  const llm = raw.llm !== null && typeof raw.llm === "object" ? (raw.llm as Record<string, unknown>) : {};
  const on = llm.requestThinking;
  foldLegacyThinking(request, MODE, typeof on === "boolean" ? !on : on);
}];
