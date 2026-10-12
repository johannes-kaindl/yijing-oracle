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
  clipText,
  sanitizeFilename as kitSanitizeFilename,
} from "../vendor/kit/filename-template";

/** Ungültige Datei-Zeichen durch `_` ersetzen (Kit-Default), Whitespace normalisieren, trimmen.
 *  Bis 0.13.0 löschte dieses Repo sie ersatzlos (`Re: A/B` → `Re AB`); für neue Notizen heißt es
 *  jetzt `Re_ A_B`, bestehende Dateien bleiben unberührt. */
export function sanitizeFilename(s: string): string {
  return kitSanitizeFilename(s);
}

/** Feld-Kappung auf 48 Zeichen. Wirkt bewusst **vor** der Substitution (also beim Bau der
 *  subs-Map): die Kappung des fertigen Namens (`maxLength`) würde auch Datum und Trefferpaar treffen. */
function slugQuestion(q: string): string {
  return clipText(sanitizeFilename(q), 48);
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
    fallbacks: ["{date} {time} {hexpair}"],
  });
}
