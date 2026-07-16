// Pure Logik des Endpunkt-Zeilen-Editors (UI-STANDARD §6): obsidian-/DOM-frei, node-testbar,
// von check:pure erfasst (liegt unter src/core). Die Render-Schicht (obsidian/settings/) ruft
// diese Funktionen und bleibt dünn. Schnitt übernommen von vault-crews/src/obsidian/
// endpoint-editor-model.ts — dort liegt sie unter obsidian/ und muss einzeln ins Gate-Script.
import type { EndpointStatusKind } from "../../vendor/kit/endpoint_diagnostics";

/** Wendet eine Zeilen-Editor-Änderung auf die Endpunkt-Liste an.
 *  - trimmt den Wert;
 *  - `isAdder` (letzte Leerzeile) hängt einen nicht-leeren Wert an, ein leerer Wert ist No-Op;
 *  - eine bestehende Zeile mit geleertem Wert wird entfernt, sonst an ihrer Stelle ersetzt;
 *  - am Ende werden Leereinträge herausgefiltert (nie leere Zeilen persistieren).
 *  Mutiert `list` nie.
 *  @example applyEndpointEdit(["http://a:1"], 1, "http://b:2", true) // → ["http://a:1", "http://b:2"]
 *  @example applyEndpointEdit(["http://a:1", "http://b:2"], 0, "", false) // → ["http://b:2"] */
export function applyEndpointEdit(
  list: string[],
  index: number,
  value: string,
  isAdder: boolean,
): string[] {
  const v = value.trim();
  let next: string[];
  if (isAdder) {
    next = v ? [...list, v] : [...list];
  } else {
    next = [...list];
    if (v) next[index] = v;
    else next.splice(index, 1);
  }
  return next.filter((e) => e.trim().length > 0);
}

/** Index der ersten erreichbaren Zeile (= aktiver Endpunkt, exakt die
 *  `resolveActiveEndpoint`-Semantik: erster erreichbarer gewinnt), sonst -1.
 *  `null` in der Liste = diese Zeile wurde noch nicht geprobt.
 *  @example activeIndexFromStatuses(["refused", "ok"]) // → 1
 *  @example activeIndexFromStatuses([null, null]) // → -1 */
export function activeIndexFromStatuses(statuses: (EndpointStatusKind | null)[]): number {
  return statuses.findIndex((s) => s === "ok");
}

/** i18n-Key für einen Endpunkt-Status (Render-Schicht ruft `t(key)`). Eigene Keys statt
 *  `EndpointStatus.klartext` — das Kit-Feld ist hart deutsch, yijing ist zweisprachig.
 *  @example statusKindKey("refused") // → "set.ep.status.refused" */
export function statusKindKey(kind: EndpointStatusKind): string {
  return `set.ep.status.${kind}`;
}

/** i18n-Key für eine Eingabe-Warn-Regel von `validateEndpointInput`
 *  (scheme · malformed · port · placeholder-ip).
 *  @example warnRuleKey("port") // → "set.ep.warn.port" */
export function warnRuleKey(rule: string): string {
  return `set.ep.warn.${rule}`;
}
