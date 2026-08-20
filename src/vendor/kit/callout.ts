// uebernommen aus obsidian-kit/src/pure/callout.ts, 2026-08-20
// Verbatim (Kit 0.27.0). Nie von Hand editieren — bei Bedarf neu aus dem Kit ziehen.
/** Obsidian-Callout aus Titel + Body bauen (`> [!type]<marker> Titel` plus zeilen-geprefixter
 *  Rumpf) — obsidian-frei, in Node testbar (PROF-OBS-03/04).
 *
 *  Kanonische Quelle: `yijing-oracle/src/core/llm/callout.ts` (a56bd17, 2026-07-12).
 *  Zusammengeführt wurden drei Fassungen:
 *   · **yijing-oracle** (a56bd17, 2026-07-12) — `wrapCallout(title, body, type, open: boolean)`,
 *     7 Produktions-Aufrufe in `core/render.ts`, `core/artwork.ts`, `core/llm/interpretation.ts`,
 *     3 Tests. Die Fassung mit dem vollständigsten Verhalten, deshalb kanonisch.
 *   · **finance-ledger-plugin/26-011-finanzplan-plugin/src/core/notes/callout.ts** (4f46dd5,
 *     2026-08-14) — mit Herkunftsstempel aus yijing übernommen. Nach Kommentar- und
 *     Whitespace-Abzug token-identisch; die zwei Unterschiede (trailing comma in der
 *     Parameterliste, `(l) =>` statt `l =>`) sind Prettier-Artefakte, kein Drift.
 *   · **vault-rag/src/reformat_mechanical.ts** `wrapInCallout(md, type)` (6f56ad7, 2026-07-19) —
 *     unabhängig entstandene echte Teilmenge: gleicher `> [!type]`-Kopf, gleiches Zeilen-
 *     Prefixing per `split("\n").map(...)`, aber ohne Titel und ohne Falt-Marker.
 *
 *  ## Beim Übernehmen zu beachten
 *
 *  1. **`fold` hat drei Zustände, nicht zwei.** yijing und finance-ledger kannten nur
 *     `open: boolean` → `+`/`-`; einen markerlosen `> [!note]` konnten sie gar nicht
 *     erzeugen. Genau den braucht vault-rags Transform — und genau den bauen finance-ledgers
 *     vier handgebaute Produktions-Callouts (`kontoNotes.ts:156,159`, `vertragNotes.ts:245,249`).
 *     Deshalb `CalloutFold = boolean | "static"`. Der boolesche Teil bleibt absichtlich
 *     erhalten: alle 15 heutigen Aufruf- und Teststellen der beiden boolean-Fassungen
 *     kompilieren unverändert weiter, nur vault-rags eine Stelle zieht um.
 *
 *  2. **Default ist `"static"`** — die schlichte, nicht faltbare Obsidian-Form und damit die
 *     harmloseste Voreinstellung. Wer faltbar will, sagt es. Alle bisherigen Aufrufer
 *     übergeben den Wert ohnehin explizit, der Default trifft nur neue Stellen.
 *
 *  3. **Leerzeilen im Body werden `>` (ohne nachlaufenden Space), nicht `> `.** Vereinheitlicht
 *     auf yijings Form; beide rendern in Obsidian identisch, weil der `>`-Marker das Blockquote
 *     trägt. ⚠️ vault-rag verliert dadurch ein trailing space pro Leerzeile — von keinem seiner
 *     Tests abgedeckt, aber eine Verhaltensänderung an einem sichtbaren Nutzer-Befehl
 *     (`transform.wrapCallout`), die im Vendoring-Commit zu benennen ist.
 *
 *  4. **NEU gegenüber allen drei Quellen: Kopf-Zeilenumbrüche werden entschärft.** Ein `\n` in
 *     `title` ODER `type` sprengte bisher den Callout — alles hinter dem Umbruch landete als
 *     nackter Text NEBEN dem Callout, ohne Typ- oder Testfehler. Hier wird jede Umbruch-Folge
 *     in Kopf-Bestandteilen zu EINEM Space. Für jede Eingabe, die heute einen gültigen Callout
 *     ergibt, ist die Ausgabe byte-identisch; es ändert sich ausschliesslich, was vorher kaputt
 *     war. Kein hypothetischer Fall: yijings `type` kommt aus einem freien Textfeld
 *     (`src/obsidian/settings/note-section.ts:139`, `addText`), ist also nutzerbestimmt.
 *
 *  5. **Ein trailing `\n` im Body erzeugt bewusst eine `>`-Schlusszeile.** `"a\n"` hat zwei
 *     Zeilen, die zweite ist leer — das faithful abzubilden ist richtig, nicht defekt. Nicht
 *     wegtrimmen: das wäre stilles Verschlucken von Inhalt. Von einem Test festgenagelt, damit
 *     es eine Entscheidung bleibt und nicht als Versehen „repariert" wird.
 *
 *  6. **Weder `title` noch `type` werden validiert.** Obsidian rendert unbekannte Typen als
 *     `note`; ein `]` im Typ erzeugt einen sichtbar kaputten, aber strukturell intakten Kopf.
 *     Garantiert wird nur die eine Invariante, an der das Dokument sonst zerbricht: der Kopf
 *     bleibt EINE Zeile.
 *
 *  7. **NICHT mitgewandert:** `yijing-oracle/src/core/note-callouts.ts` (`CalloutSection`,
 *     `CalloutOption`, `CalloutConfig`, `CALLOUT_SECTIONS`, `DEFAULT_CALLOUTS`, `mergeCallouts`).
 *     Per Repo-Sweep n=1, und die Sektionsliste („judgment", „lines", „hexInfo") ist
 *     Wilhelm-Domäne, keine Bibliothek. Bleibt in yijing. */

/** Faltzustand des Callout-Kopfes.
 *  · `true` → `+` (faltbar, aufgeklappt)
 *  · `false` → `-` (faltbar, zugeklappt)
 *  · `"static"` → gar kein Marker (nicht faltbarer Callout, die schlichte Obsidian-Form) */
export type CalloutFold = boolean | "static";

/** Erzwingt die einzige harte Kopf-Invariante: der Callout-Kopf ist EINE Zeile.
 *  Jede Umbruch-Folge wird zu einem Space. Ohne das landet alles hinter einem `\n`
 *  als nackter Text neben dem Callout — still, ohne Typ- oder Testfehler. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ");
}

/** Wickelt `body` in einen Obsidian-Callout.
 *
 *  Vertrag: Ergebnis ist `> [!<type>]<marker> <title>` als erste Zeile, gefolgt von je einer
 *  Zeile pro Body-Zeile. Nicht-leere Body-Zeilen bekommen das Präfix `"> "`, **leere** werden
 *  zu `">"` (ohne Space) — damit bricht der Callout an Absatzgrenzen nicht ab. Ein leerer
 *  `title` hinterlässt kein Leerzeichen am Kopfende (`trimEnd`). Es wird nie ein abschliessender
 *  Zeilenumbruch angehängt. Pure: kein DOM, kein `obsidian`, kein Node-Builtin.
 *
 *  @param title Kopf-Titel; `""` für einen Callout ohne Titel. Zeilenumbrüche → Space (s. Kopf-Doku 4).
 *  @param body  Rumpf. `""` ergibt eine einzelne `>`-Zeile; ein trailing `\n` eine `>`-Schlusszeile.
 *  @param type  Callout-Typ ohne Klammern, z.B. `"note"`, `"warning"`, `"quote"`, `"info"`.
 *               Unvalidiert; Zeilenumbrüche → Space.
 *  @param fold  s. {@link CalloutFold}. Default `"static"` = kein Marker.
 *
 *  @example wrapCallout("Titel", "a\nb", "quote", false) // → "> [!quote]- Titel\n> a\n> b"
 *  @example wrapCallout("T", "x", "note", true)          // → "> [!note]+ T\n> x"
 *  @example wrapCallout("", "x", "note")                 // → "> [!note]\n> x" */
export function wrapCallout(
  title: string,
  body: string,
  type: string,
  fold: CalloutFold = "static",
): string {
  const marker = fold === "static" ? "" : (fold ? "+" : "-");
  const head = `> [!${oneLine(type)}]${marker} ${oneLine(title)}`.trimEnd();
  const lines = body.split("\n").map(l => (l.length === 0 ? ">" : `> ${l}`));
  return [head, ...lines].join("\n");
}
