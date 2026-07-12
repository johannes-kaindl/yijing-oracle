// Konfigurierbares Dateinamen-Schema für Reading-Notes. Rein und testbar.
// Platzhalter: {date} {time} {hex} {resulting} {hexpair} {question}
//   {hexpair} = "H3-H54" (mit wandelnden Linien) bzw. "H3" (ohne)
//   {resulting} = "" ohne wandelnde Linien; {question} = bereinigte Frage (max. 48 Z.)

const INVALID = /[\\/:*?"<>|#^[\]]/g;

/** Ungültige Datei-Zeichen entfernen, Whitespace normalisieren, trimmen. */
export function sanitizeFilename(s: string): string {
  return s.replace(INVALID, "").replace(/\s+/g, " ").trim();
}

function slugQuestion(q: string): string {
  const c = sanitizeFilename(q);
  return c.length > 48 ? c.slice(0, 48).trim() : c;
}

export const DEFAULT_FILENAME_TEMPLATE = "{date} {time} Yijing {hexpair}";

export interface FilenameValues {
  /** "2026-07-12" */
  date: string;
  /** "1034" (HHMM) */
  time: string;
  hexagram: number;
  resulting: number | null;
  question: string;
}

export function buildFilename(template: string, v: FilenameValues): string {
  const hexpair = v.resulting !== null ? `H${v.hexagram}-H${v.resulting}` : `H${v.hexagram}`;
  const subs: Record<string, string> = {
    date: v.date,
    time: v.time,
    hex: String(v.hexagram),
    resulting: v.resulting !== null ? String(v.resulting) : "",
    hexpair,
    question: slugQuestion(v.question),
  };
  const filled = template.replace(/\{(\w+)\}/g, (_m, key: string) => subs[key] ?? `{${key}}`);
  const clean = sanitizeFilename(filled);
  // Leeres/kaputtes Schema → sicherer Fallback, damit nie ein leerer Dateiname entsteht.
  return clean || `${v.date} ${v.time} ${hexpair}`;
}
