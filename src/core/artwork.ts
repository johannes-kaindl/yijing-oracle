// Bildmeditations-Block für die Reading-Note: Attachment-Embed + Szenen-Zeile,
// idempotent zwischen eigenen Markern eingesetzt (Muster von llm/insert.ts).
// Pure — die Attachment-I/O macht reading-writer.ts.
import { type Lang } from "./data";
import { type CalloutOption } from "./note-callouts";
import { wrapCallout } from "./llm/callout";
import { MARKER_END as DEUTUNG_END } from "./llm/insert";

export const ARTWORK_MARKER_START = "<!-- yijing:bild:start -->";
export const ARTWORK_MARKER_END = "<!-- yijing:bild:end -->";

// Label hängt an der READING-Sprache (wie die Sektions-Labels in render.ts).
const ARTWORK_LABELS: Record<Lang, string> = { de: "Bildmeditation", en: "Meditation Image" };

export interface ArtworkBlockInput {
  /** Fertiger Embed-Link, z.B. "![[reading.png]]". */
  embed: string;
  /** Szenen-Satz als Bildunterschrift. */
  scene: string;
  lang: Lang;
  callout: CalloutOption;
}

export function renderArtworkBlock(i: ArtworkBlockInput): string {
  const label = ARTWORK_LABELS[i.lang];
  const body = `${i.embed}\n\n*${i.scene}*`;
  return i.callout.enabled ? wrapCallout(label, body, i.callout.type, false) : `### ${label}\n\n${body}`;
}

/** Setzt/ersetzt den Bild-Block. Reihenfolge:
 *  1) eigene Marker vorhanden → Inhalt ersetzen.
 *  2) sonst hinter dem Deutungs-End-Marker (Bild unter der Deutung).
 *  3) sonst vor der ersten "## "-Überschrift.
 *  4) sonst ans Ende. Pure. */
export function insertArtwork(body: string, block: string): string {
  const wrapped = `${ARTWORK_MARKER_START}\n${block}\n${ARTWORK_MARKER_END}`;
  const s = body.indexOf(ARTWORK_MARKER_START);
  const e = body.indexOf(ARTWORK_MARKER_END);
  if (s !== -1 && e !== -1 && e > s) {
    return body.slice(0, s) + wrapped + body.slice(e + ARTWORK_MARKER_END.length);
  }
  const anchor = body.indexOf(DEUTUNG_END);
  if (anchor !== -1) {
    const at = anchor + DEUTUNG_END.length;
    return `${body.slice(0, at)}\n\n${wrapped}${body.slice(at)}`;
  }
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("## "));
  if (idx !== -1) {
    const before = lines.slice(0, idx).join("\n").replace(/\n*$/, "\n\n");
    const after = lines.slice(idx).join("\n");
    return `${before}${wrapped}\n\n${after}`;
  }
  return body.replace(/\n*$/, "\n\n") + wrapped;
}
