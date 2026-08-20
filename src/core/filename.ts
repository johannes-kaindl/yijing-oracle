// Konfigurierbares Dateinamen-Schema für Reading-Notes. Rein und testbar.
// Platzhalter: {date} {time} {hex} {resulting} {hexpair} {question}
//   {hexpair} = "H3-H54" (mit wandelnden Linien) bzw. "H3" (ohne)
//   {resulting} = "" ohne wandelnde Linien; {question} = bereinigte Frage (max. 48 Z.)
//
// Der Algorithmus (Platzhalter-Auflösung, Sanitizing, Fallback-Kette) liegt seit Kit 0.27.0
// in src/vendor/kit/filename-template.ts — diese Datei ist der Yijing-Shim darüber und hält
// nur, was Domäne ist: den Bau der subs-Map (hexpair, auf 48 gekappte Frage), das
// Default-Template und FilenameValues. Der Kit-Modulkopf begründet diesen Schnitt.

import {
  buildFilename as buildFromTemplate,
  sanitizeFilename as kitSanitizeFilename,
} from "../vendor/kit/filename-template";

/** Ungültige Datei-Zeichen entfernen, Whitespace normalisieren, trimmen.
 *
 *  `onInvalid: "strip"` ist load-bearing und muss gesetzt bleiben: der Kit-Default ist
 *  `"replace"` (ungültiges Zeichen → `_`, so machen es paperize und letterhead), dieses
 *  Repo löscht sie ersatzlos. Ohne die Option würde aus `Re: A/B` still `Re_ A_B` statt
 *  `Re AB` — kein Typfehler, keine Warnung. Festgenagelt in tests/filename.test.ts. */
export function sanitizeFilename(s: string): string {
  return kitSanitizeFilename(s, { onInvalid: "strip" });
}

/** Feld-Kappung auf 48 Zeichen. Wirkt bewusst **vor** der Substitution (also beim Bau der
 *  subs-Map) und bleibt deshalb lokal — das Kit kappt nicht. */
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
  // Kein lastResort: das Fallback-Template besteht aus immer gefüllten Feldern, es kann
  // nie leer rendern. So hält es der Kit-Modulkopf für dieses Repo ausdrücklich fest.
  return buildFromTemplate(template, subs, {
    onInvalid: "strip",
    fallbacks: ["{date} {time} {hexpair}"],
  });
}
