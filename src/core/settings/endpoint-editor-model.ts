// Pure Logik der Endpunkt-Status-Anzeige der Bild-Sektion (obsidian-/DOM-frei, node-testbar, von
// check:pure erfasst). Der Zeilen-Editor der LLM-Endpunkte kommt seit der Verbindung aus dem Kit.
import type { EndpointStatusKind } from "../../vendor/kit/endpoint_diagnostics";

/** i18n-Key für einen Endpunkt-Status (Render-Schicht ruft `t(key)`). Eigene Keys statt
 *  `EndpointStatus.klartext` — das Kit-Feld ist hart deutsch, yijing ist zweisprachig.
 *  @example statusKindKey("refused") // → "set.ep.status.refused" */
export function statusKindKey(kind: EndpointStatusKind): string {
  return `set.ep.status.${kind}`;
}
