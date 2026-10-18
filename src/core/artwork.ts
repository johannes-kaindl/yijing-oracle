// Bildmeditations-Block für die Reading-Note: Attachment-Embed + Szenen-Zeile,
// idempotent zwischen eigenen Markern eingesetzt (Muster von llm/insert.ts).
// Pure — die Attachment-I/O macht reading-writer.ts.
import { type Lang } from "./data";
import { type CalloutOption } from "./note-callouts";
import { wrapCallout } from "../vendor/kit/callout";
import { splitZone, wrapZone, type ZoneMarkers } from "../vendor/kit/marker-zone";
import { BrokenZoneError, MARKER_END as DEUTUNG_END } from "./llm/insert";

export const ARTWORK_MARKER_START = "<!-- yijing:bild:start -->";
export const ARTWORK_MARKER_END = "<!-- yijing:bild:end -->";
const ARTWORK_MARKERS: ZoneMarkers = { begin: ARTWORK_MARKER_START, end: ARTWORK_MARKER_END };

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
  // Ausgeklappt ("+"), aber einklappbar — das Bild soll beim Öffnen der Note sichtbar sein.
  return i.callout.enabled ? wrapCallout(label, body, i.callout.type, true) : `### ${label}\n\n${body}`;
}

/** Setzt/ersetzt den Bild-Block (Kit `marker-zone`). Wirft `BrokenZoneError` bei einem Start-Marker ohne Ende. Reihenfolge:
 *  1) eigene Marker vorhanden → Inhalt ersetzen.
 *  2) sonst hinter dem Deutungs-End-Marker (Bild unter der Deutung).
 *  3) sonst vor der ersten "## "-Überschrift.
 *  4) sonst ans Ende. Pure. */
export function insertArtwork(body: string, block: string): string {
  const wrapped = wrapZone(block, ARTWORK_MARKERS);
  const z = splitZone(body, ARTWORK_MARKERS);
  if (z.kind === "broken") throw new BrokenZoneError("bild");
  if (z.kind === "zone") return z.before + wrapped + z.after;
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
