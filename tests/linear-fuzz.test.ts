/**
 * Linearität der Funktionen, die Notizinhalt oder Modelltext zerlegen (ReDoS-Konvention, CORE-TEST-26 (b)): der erschöpfende Fuzz `pruefeLinearFuzz`
 * aus dem Kit-Testmodul, dazu feste Eingaben. Gemessen wird ein Quotient t(50 000)/t(10 000), keine Millisekunden.
 *
 * Geprüft sind die Wege, auf denen Text von außen ankommt: der Notiztext, in den die Deutung und das Bild eingefügt werden (`insertInterpretation`,
 * `insertArtwork`), die Antwort des Modells (`renderInterpretationBlock`) und die Frage des Nutzers (`buildFilename`, `buildFrontmatter`,
 * `composeImageRequest`, `buildSdPrompt`).
 *
 * Nicht Gegenstand: `splitZone`, `wrapZone`, `neutralizeRemoteResources`, `wrapCallout`, `buildFromTemplate` und `sanitizeFilename` (Kit, dort mit
 * eigenem Linearitätstest). Die Gegenprobe (eine absichtlich quadratische Fassung wird rot) steht am Ende dieser Datei.
 */
import { describe, expect, it } from "vitest";
import { pruefeLinear, pruefeLinearFuzz } from "./vendor/kit/linear-probe";
import { DEUTUNG_MARKERS, insertInterpretation } from "../src/core/llm/insert";
import { wrapZone } from "../src/vendor/kit/marker-zone";
import { ARTWORK_MARKER_END, ARTWORK_MARKER_START, insertArtwork } from "../src/core/artwork";
import { renderInterpretationBlock } from "../src/core/llm/interpretation";
import { buildFilename } from "../src/core/filename";
import { buildFrontmatter, DEFAULT_FRONTMATTER_FIELDS } from "../src/core/frontmatter";
import { buildSdPrompt, composeImageRequest } from "../src/core/image-scene";

const FUZZ_MS = 180_000;

/** Befund als lesbarer Text, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). */
const befund = (r: { verdaechtig: ReadonlyArray<{ message: string }> }): string => r.verdaechtig.map((v) => v.message).join("\n");
const fuzz = (fn: (s: string) => unknown, alphabet: readonly string[], maxLaenge = 3): void => {
  const f = pruefeLinearFuzz(fn, { alphabet, maxLaenge });
  expect(f.linear, befund(f)).toBe(true);
  // Eine Bilanz ohne Messung ist kein Erfolg (CORE-TEST-19).
  expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
};

const START = "<!-- yijing:deutung:start -->";
const END = "<!-- yijing:deutung:end -->";
const BILD_START = "<!-- yijing:bild:start -->";
const BILD_END = "<!-- yijing:bild:end -->";

describe("Notiztext, in den eingefügt wird", () => {
  it("insertInterpretation und insertArtwork: Fuzz über Marker, Überschriften, Zeilenumbruch", () => {
    // Der Lauf steht mitten im Text (ein Rumpf davor und danach), sonst trifft ein Anker am Textende sofort.
    const alphabet = [START, END, BILD_START, BILD_END, "\n", "## ", "x"];
    fuzz((s) => insertInterpretation(`Rumpf\n${s}\nSchluss`, "Deutung"), alphabet);
    fuzz((s) => insertArtwork(`Rumpf\n${s}\nSchluss`, "Bild"), alphabet);
  }, FUZZ_MS);

  it("insertInterpretation und insertArtwork: lange Zeilenumbruch-Läufe vor einer Überschrift und mitten im Text", () => {
    for (const [name, fn] of [["insertInterpretation", insertInterpretation], ["insertArtwork", insertArtwork]] as const) {
      const vorUeberschrift = pruefeLinear((s: string) => fn(s, "Block"), (n) => `Rumpf${"\n".repeat(n)}x\n## Titel\ntext`);
      expect(vorUeberschrift.linear, `${name}: ${vorUeberschrift.message}`).toBe(true);
      const ohneUeberschrift = pruefeLinear((s: string) => fn(s, "Block"), (n) => `Rumpf${"\n".repeat(n)}x`);
      expect(ohneUeberschrift.linear, `${name}: ${ohneUeberschrift.message}`).toBe(true);
    }
  });
});

describe("Antwort des Modells und Frage des Nutzers", () => {
  it("renderInterpretationBlock: Fuzz über Marker-Anfang, Zäune, Tags und Leerraum in Antwort und Denkprozess", () => {
    const alphabet = ["<!-- yijing:", "<img src=", ">", "```dataviewjs\n", "\n", "x"];
    fuzz((s) => renderInterpretationBlock({ answer: s, reasoning: "" }, { lang: "de", thinkingInNote: "none" }), alphabet);
    fuzz((s) => renderInterpretationBlock({ answer: "a", reasoning: s }, { lang: "en", thinkingInNote: "closed-callout" }), alphabet, 2);
  }, FUZZ_MS);

  it("buildFilename: Fuzz über Ersatzzeichen und Platzhalter in Frage und Vorlage", () => {
    const werte = { date: "2026-11-18", time: "1034", hexagram: 1, resulting: null };
    fuzz((s) => buildFilename("{date} {question}", { ...werte, question: s }), ["/", "\\", ":", " ", "?", "x", "{", "}"]);
    fuzz((s) => buildFilename(s, { ...werte, question: "Frage" }), ["{date}", "{question}", "{", "}", " ", "x", "/"]);
  }, FUZZ_MS);

  it("buildFrontmatter, composeImageRequest und buildSdPrompt: Fuzz über Anführungszeichen, Zeilenumbruch und Leerraum in der Frage", () => {
    const werte = { date: "2026-11-18", hexagram: 1, changingLines: [1, 2], resulting: 2, language: "de", register: "plain" };
    fuzz((s) => buildFrontmatter(DEFAULT_FRONTMATTER_FIELDS, { ...werte, question: s }), ['"', "\\", "\n", " ", "x"]);
    fuzz((s) => composeImageRequest({ primaryMotif: s, resultingMotif: s, question: s, primaryNumber: 1 }), [" ", "\n", ",", "x"]);
    fuzz((s) => buildSdPrompt(s, s), [" ", ",", "x"]);
  }, FUZZ_MS);
});

describe("Verhalten unverändert: die lineare Fassung liefert, was `replace(/\\n*$/, \"\\n\\n\")` lieferte", () => {
  // Das Orakel ist die frühere Fassung des Schwanzes. Jede Zeichenfolge bis Länge 6 aus Zeilenumbruch, Leerzeichen und Text; ohne Marker, ohne Überschrift,
  // dann mit einer Überschrift dahinter (der Zweig `lines.slice(0, idx)`).
  const alle = (alphabet: readonly string[], maxLaenge: number): string[] => {
    let stufe: string[] = [""];
    const out: string[] = [""];
    for (let i = 0; i < maxLaenge; i++) {
      stufe = stufe.flatMap((v) => alphabet.map((z) => v + z));
      out.push(...stufe);
    }
    return out;
  };
  const faelle = [
    { name: "insertInterpretation", fn: insertInterpretation, block: "Deutung", markers: DEUTUNG_MARKERS },
    { name: "insertArtwork", fn: insertArtwork, block: "Bild", markers: { begin: ARTWORK_MARKER_START, end: ARTWORK_MARKER_END } },
  ] as const;

  for (const { name, fn, block, markers } of faelle) {
    it(`${name}: am Ende des Texts und vor der ersten Überschrift`, () => {
      const wrapped = wrapZone(block, markers);
      for (const body of alle(["\n", " ", "a"], 6)) {
        expect(fn(body, block), JSON.stringify(body)).toBe(`${body.replace(/\n*$/, "\n\n")}${wrapped}`);
        const mitUeberschrift = `${body}\n## H\nx`;
        const lines = mitUeberschrift.split("\n");
        const idx = lines.findIndex((l) => l.startsWith("## "));
        const erwartet = `${lines.slice(0, idx).join("\n").replace(/\n*$/, "\n\n")}${wrapped}\n\n${lines.slice(idx).join("\n")}`;
        expect(fn(mitUeberschrift, block), JSON.stringify(mitUeberschrift)).toBe(erwartet);
      }
    });
  }
});

describe("Gegenprobe: der Fuzz kann rot werden (CORE-TEST-01)", () => {
  /** Absichtlich quadratisch: dieselbe Form wie `body.replace(/\n*$/, "\n\n")` in der Fassung vor dem Fix. */
  const quadratisch = (s: string): string => s.replace(/\n*$/, "\n\n");

  it("pruefeLinearFuzz meldet die quadratische Form als Verdacht", () => {
    const f = pruefeLinearFuzz((s) => quadratisch(`Rumpf\n${s}\nSchluss`), { alphabet: ["\n", "x"], maxLaenge: 1, verschachtelt: false });
    expect(f.linear).toBe(false);
    expect(f.verdaechtig.map((v) => v.einheit)).toContain("\n");
  }, FUZZ_MS);
});
