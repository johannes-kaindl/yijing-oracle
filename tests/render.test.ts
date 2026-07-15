import { describe, it, expect } from "vitest";
import { buildReading } from "../src/core/reading";
import { renderReading, type RenderOptions } from "../src/core/render";
import { rulingSentence } from "../src/core/ruling";
import { DEFAULT_FRONTMATTER_FIELDS } from "../src/core/frontmatter";
import { type Line } from "../src/core/casting";
import { MARKER_START, MARKER_END } from "../src/core/llm/insert";
import { type CalloutConfig } from "../src/core/note-callouts";

const L = (...values: number[]): Line[] => values.map((value) => ({ value }));

const opts = (over: Partial<RenderOptions> = {}): RenderOptions => ({
  lang: "de",
  register: "classic",
  date: "2026-07-12T14:23",
  includeFrontmatter: true,
  frontmatterFields: DEFAULT_FRONTMATTER_FIELDS,
  ...over,
});

const allOff: CalloutConfig = {
  overview: { enabled: false, type: "note" },
  question: { enabled: false, type: "question" },
  hexInfo: { enabled: false, type: "quote" },
  judgment: { enabled: false, type: "quote" },
  image: { enabled: false, type: "quote" },
  artwork: { enabled: false, type: "quote" },
  meaning: { enabled: false, type: "quote" },
  lines: { enabled: false, type: "quote" },
  notes: { enabled: false, type: "quote" },
};

describe("renderReading", () => {
  it("stabiler Wurf: Ursprungsbild-Abschnitte, keine Wandlung/Zielbild", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8)); // hex 63, stable
    const out = renderReading(r, opts());
    expect(out.body).toContain("## Ursprungsbild");
    expect(out.body).toContain("> [!quote]- Das Urteil");
    expect(out.body).toContain("> [!quote]- Das Bild");
    expect(out.body).toContain("> [!quote]- Bedeutung");
    expect(out.body).not.toContain("### Wandelnde Linien");
    expect(out.body).not.toContain("## Zielbild");
    expect(out.body).toContain("*Text: Richard Wilhelm");
    expect(out.frontmatter).toContain("changing_lines: []");
    expect(out.frontmatter).toContain("hexagram: 63");
  });

  it("Überblick: bei stabilem Wurf kein Pfeil, Ruling = Urteil maßgeblich", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8));
    const out = renderReading(r, opts());
    expect(out.body).toContain("Maßgeblich nach Tradition");
    expect(out.body).toContain("Keine wandelnde Linie");
    expect(out.body).not.toContain("→");
  });

  it("neue Struktur-Reihenfolge: Frage → Überblick → Anker → Ursprungsbild", () => {
    const r = buildReading(L(6, 8, 7, 8, 7, 8)); // 1 wandelnde Linie (Pos 1)
    const out = renderReading(r, opts({ question: "Soll ich starten?" }));
    const iQ = out.body.indexOf("[!question]");
    const iOv = out.body.indexOf("Maßgeblich nach Tradition");
    const iAnchor = out.body.indexOf(MARKER_START);
    const iOrigin = out.body.indexOf("## Ursprungsbild");
    expect(iQ).toBeGreaterThan(-1);
    expect(iOv).toBeGreaterThan(iQ);
    expect(iAnchor).toBeGreaterThan(iOv);
    expect(iOrigin).toBeGreaterThan(iAnchor);
  });

  it("Überblick enthält den maßgeblich-Satz aus rulingSentence", () => {
    const r = buildReading(L(6, 8, 7, 8, 7, 8));
    const out = renderReading(r, opts());
    expect(out.body).toContain(rulingSentence(r, "de").text);
  });

  it("Trigramm-Block: H2 trägt den Hexagramm-Namen, Callout nur Trigramme", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8));
    const out = renderReading(r, opts());
    expect(out.body).toMatch(/## Ursprungsbild — .*Nr\. 63/);
    expect(out.body).toContain("> - Oberes Trigramm:");
    expect(out.body).toContain("> - Unteres Trigramm:");
  });

  it("wandelnde Linien: ### Unterabschnitt + Zielbild; maßgebliche Linie markiert", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7)); // changing at 1 und 4
    const out = renderReading(r, opts({ question: "Nach dem Umzug?" }));
    expect(out.frontmatter).toContain("changing_lines: [1, 4]");
    expect(out.frontmatter).toMatch(/resulting: \d+/);
    expect(out.body).toContain("### Wandelnde Linien");
    expect(out.body).not.toMatch(/^## Wandelnde Linien/m);
    expect(out.body).toContain("## Zielbild");
    expect(out.body).toContain("· maßgeblich"); // 2 Linien → obere (Pos 4) entscheidet
    // Zielbild trägt Urteil UND Bild.
    const targetIdx = out.body.indexOf("## Zielbild");
    expect(out.body.indexOf("> [!quote]- Das Bild", targetIdx)).toBeGreaterThan(targetIdx);
  });

  it("englische Labels", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, opts({ lang: "en", register: "neutral" }));
    expect(out.body).toContain("## Primary Hexagram");
    expect(out.body).toContain("> [!quote]- The Judgment");
    expect(out.body).toContain("### Changing Lines");
    expect(out.body).toContain("## Resulting Hexagram");
    expect(out.body).toContain("Decisive by tradition");
    expect(out.body).toContain("*Text: Richard Wilhelm — I Ching");
  });

  it("callouts aus → schlichte Überschriften, keine Callouts", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, opts({ callouts: allOff, question: "X?" }));
    expect(out.body).not.toContain("[!quote]");
    expect(out.body).not.toContain("[!note]");
    expect(out.body).not.toContain("[!question]");
    expect(out.body).toContain("### Überblick");
    expect(out.body).toContain("**Frage:** X?");
    expect(out.body).toContain("### Das Urteil");
    expect(out.body).toContain("- Oberes Trigramm:");
  });

  it("includeNotes: hängt einen Anmerkungen-Abschnitt an (Hex 1 hat Fußnoten)", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9)); // hex 1
    const withNotes = renderReading(r, opts({ includeNotes: true }));
    const without = renderReading(r, opts({ includeNotes: false }));
    expect(withNotes.body).toContain("## Anmerkungen");
    expect(without.body).not.toContain("## Anmerkungen");
    expect(withNotes.body.indexOf("## Anmerkungen")).toBeLessThan(withNotes.body.indexOf("*Text: Richard Wilhelm"));
  });

  it("Yong: all-changing Hex 1 nutzt den Yong-Text und markiert ihn maßgeblich", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9)); // hex 1 → hex 2
    const out = renderReading(r, opts());
    expect(out.body).toContain("### Wandelnde Linien");
    expect(out.body).toContain("lauter Neunen");
    expect(out.body).toContain("· maßgeblich");
  });

  it("previewBody ohne H1/Untertitel, mit Abschnitten, ohne Marker", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, opts());
    expect(out.body.startsWith("# ")).toBe(true);
    expect(out.previewBody.startsWith("# ")).toBe(false);
    expect(out.previewBody).toContain("## Ursprungsbild");
    expect(out.previewBody).toContain("## Zielbild");
    expect(out.previewBody).not.toContain(MARKER_START);
  });

  it("Titel trägt Glyph, Nummer, Name", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9));
    const out = renderReading(r, opts());
    expect(out.title).toContain("䷀");
    expect(out.body.startsWith("# ䷀ 1 ·")).toBe(true);
  });

  it("includeFrontmatter:false → leerer Frontmatter-String", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8));
    const out = renderReading(r, opts({ includeFrontmatter: false }));
    expect(out.frontmatter).toBe("");
    expect(out.body).toContain("## Ursprungsbild");
  });

  it("bettet ein leeres Deutungs-Marker-Paar vor dem ersten ## ein (nur body)", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8));
    const out = renderReading(r, opts({ includeFrontmatter: false }));
    const mi = out.body.indexOf(MARKER_START);
    const hi = out.body.indexOf("## ");
    expect(mi).toBeGreaterThan(-1);
    expect(out.body.indexOf(MARKER_END)).toBeGreaterThan(mi);
    expect(mi).toBeLessThan(hi); // Marker vor erstem ##
    expect(out.previewBody).not.toContain(MARKER_START);
  });

  it("Marker (und damit die Deutung) steht UNTER Frage + Überblick", () => {
    const r = buildReading(L(6, 8, 7, 8, 9, 8));
    const out = renderReading(r, opts({ includeFrontmatter: false, question: "Wohin?" }));
    const qi = out.body.indexOf("Wohin?");
    const oi = out.body.indexOf("Maßgeblich nach Tradition");
    const mi = out.body.indexOf(MARKER_START);
    const hi = out.body.indexOf("## ");
    expect(qi).toBeGreaterThan(-1);
    expect(qi).toBeLessThan(oi);
    expect(oi).toBeLessThan(mi);
    expect(mi).toBeLessThan(hi);
  });
});
