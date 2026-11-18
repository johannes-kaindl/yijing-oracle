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

/** Endet der Text auf genau eine Leerzeile (zwei Zeilenumbrüche)? Gemeint ist `replace(/\n*$/, "\n\n")`; diese Fassung war auf einem langen Lauf von Zeilenumbrüchen
 *  mitten im Text quadratisch (jede Startposition las den Lauf bis zu seinem Ende, 50 000 Zeichen rund 1 s; Fuzz in `tests/linear-fuzz.test.ts`). */
function endWithBlankLine(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 10) end--;
  return `${text.slice(0, end)}\n\n`;
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
    const before = endWithBlankLine(lines.slice(0, idx).join("\n"));
    const after = lines.slice(idx).join("\n");
    return `${before}${wrapped}\n\n${after}`;
  }
  return endWithBlankLine(body) + wrapped;
}
