import { splitZone, wrapZone, type ZoneMarkers } from "../../vendor/kit/marker-zone";

/** Gemeinsamer Anfang beider Marker; `renderInterpretationBlock` entschärft ihn im Modelltext. */
export const MARKER_START_PREFIX = "<!-- yijing:";
export const MARKER_START = "<!-- yijing:deutung:start -->";
export const MARKER_END = "<!-- yijing:deutung:end -->";
export const DEUTUNG_MARKERS: ZoneMarkers = { begin: MARKER_START, end: MARKER_END };

/** Ein Start-Marker ohne Ende-Marker: die Note wird nicht beschrieben (ein zweiter Block würde beim nächsten Mal Text des Nutzers überschreiben). */
export class BrokenZoneError extends Error {
  constructor(readonly zone: "deutung" | "bild") {
    super(`start marker without end marker (${zone})`);
    this.name = "BrokenZoneError";
  }
}

/** Setzt/ersetzt den Deutungs-Block zwischen den Markern (Kit `marker-zone`). Wirft `BrokenZoneError` bei einem Start-Marker ohne Ende.
 *  Reihenfolge:
 *  1) Marker vorhanden → Inhalt dazwischen ersetzen.
 *  2) sonst vor der ersten "## "-Überschrift Marker+Block einsetzen.
 *  3) sonst ans Ende anhängen. Pure. */
export function insertInterpretation(body: string, block: string): string {
  const wrapped = wrapZone(block, DEUTUNG_MARKERS);
  const z = splitZone(body, DEUTUNG_MARKERS);
  if (z.kind === "broken") throw new BrokenZoneError("deutung");
  if (z.kind === "zone") return z.before + wrapped + z.after;
  const lines = body.split("\n");
  const idx = lines.findIndex(l => l.startsWith("## "));
  if (idx !== -1) {
    const before = lines.slice(0, idx).join("\n").replace(/\n*$/, "\n\n");
    const after = lines.slice(idx).join("\n");
    return `${before}${wrapped}\n\n${after}`;
  }
  return body.replace(/\n*$/, "\n\n") + wrapped;
}
