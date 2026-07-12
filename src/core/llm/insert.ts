export const MARKER_START = "<!-- yijing:deutung:start -->";
export const MARKER_END = "<!-- yijing:deutung:end -->";

/** Setzt/ersetzt den Deutungs-Block zwischen den Markern. Reihenfolge:
 *  1) Marker vorhanden → Inhalt dazwischen ersetzen.
 *  2) sonst vor der ersten "## "-Überschrift Marker+Block einsetzen.
 *  3) sonst ans Ende anhängen. Pure. */
export function insertInterpretation(body: string, block: string): string {
  const wrapped = `${MARKER_START}\n${block}\n${MARKER_END}`;
  const s = body.indexOf(MARKER_START);
  const e = body.indexOf(MARKER_END);
  if (s !== -1 && e !== -1 && e > s) {
    return body.slice(0, s) + wrapped + body.slice(e + MARKER_END.length);
  }
  const lines = body.split("\n");
  const idx = lines.findIndex(l => l.startsWith("## "));
  if (idx !== -1) {
    const before = lines.slice(0, idx).join("\n").replace(/\n*$/, "\n\n");
    const after = lines.slice(idx).join("\n");
    return `${before}${wrapped}\n\n${after}`;
  }
  return body.replace(/\n*$/, "\n\n") + wrapped;
}
