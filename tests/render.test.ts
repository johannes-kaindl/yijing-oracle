import { describe, it, expect } from "vitest";
import { buildReading } from "../src/core/reading";
import { renderReading, type RenderOptions } from "../src/core/render";
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
  hexInfo: { enabled: false, type: "quote" },
  judgment: { enabled: false, type: "quote" },
  image: { enabled: false, type: "quote" },
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
    expect(out.body).not.toContain("## Wandelnde Linien");
    expect(out.body).not.toContain("## Zielbild");
    expect(out.body).toContain("*Text: Richard Wilhelm");
    expect(out.frontmatter).toContain("changing_lines: []");
    expect(out.frontmatter).toContain("hexagram: 63");
  });

  it("Trigramm-Block: Kopf + oberes/unteres Trigramm im Callout", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8));
    const out = renderReading(r, opts());
    expect(out.body).toMatch(/> \[!quote\]- \*\*.*Nr\. 63/);
    expect(out.body).toContain("> - Oberes Trigramm:");
    expect(out.body).toContain("> - Unteres Trigramm:");
  });

  it("wandelnde Linien: Wandelnde-Linien + Zielbild mit resultierendem Hexagramm", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7)); // changing at 1 and 4
    const out = renderReading(r, opts({ question: "Nach dem Umzug?" }));
    expect(out.frontmatter).toContain("changing_lines: [1, 4]");
    expect(out.frontmatter).toMatch(/resulting: \d+/);
    expect(out.body).toContain("## Wandelnde Linien (1, 4)");
    expect(out.body).toContain("## Zielbild");
    expect(out.body).toContain("**Frage:** Nach dem Umzug?");
    // Zielbild trägt jetzt auch Urteil UND Bild (nicht nur Urteil).
    const targetIdx = out.body.indexOf("## Zielbild");
    expect(out.body.indexOf("> [!quote]- Das Bild", targetIdx)).toBeGreaterThan(targetIdx);
  });

  it("englische Labels", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, opts({ lang: "en", register: "neutral" }));
    expect(out.body).toContain("## Primary Hexagram");
    expect(out.body).toContain("> [!quote]- The Judgment");
    expect(out.body).toContain("## Changing Lines (1, 4)");
    expect(out.body).toContain("## Resulting Hexagram");
    expect(out.body).toContain("*Text: Richard Wilhelm — I Ching");
  });

  it("callouts aus → schlichte ### -Überschriften, keine [!quote]", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, opts({ callouts: allOff }));
    expect(out.body).not.toContain("[!quote]");
    expect(out.body).toContain("### Das Urteil");
    expect(out.body).toContain("### Das Bild");
    expect(out.body).toContain("- Oberes Trigramm:");
  });

  it("includeNotes: hängt einen Anmerkungen-Abschnitt an (Hex 1 hat Fußnoten)", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9)); // hex 1
    const withNotes = renderReading(r, opts({ includeNotes: true }));
    const without = renderReading(r, opts({ includeNotes: false }));
    expect(withNotes.body).toContain("## Anmerkungen");
    expect(without.body).not.toContain("## Anmerkungen");
    // Anmerkungen stehen vor der Quellenangabe.
    expect(withNotes.body.indexOf("## Anmerkungen")).toBeLessThan(withNotes.body.indexOf("*Text: Richard Wilhelm"));
  });

  it("Yong: all-changing Hex 1 nutzt den Yong-Text", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9)); // hex 1 → hex 2
    const out = renderReading(r, opts());
    expect(out.body).toContain("## Wandelnde Linien");
    expect(out.body).toContain("lauter Neunen");
  });

  it("previewBody ohne H1/Untertitel, aber mit Abschnitten", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, opts());
    expect(out.body.startsWith("# ")).toBe(true);
    expect(out.previewBody.startsWith("# ")).toBe(false);
    expect(out.previewBody).toContain("## Ursprungsbild");
    expect(out.previewBody).toContain("## Zielbild");
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

  it("Marker (und damit die Deutung) steht UNTER der Frage-Zeile", () => {
    const r = buildReading(L(6, 8, 7, 8, 9, 8));
    const out = renderReading(r, opts({ includeFrontmatter: false, question: "Wohin?" }));
    const qi = out.body.indexOf("Wohin?");
    const mi = out.body.indexOf(MARKER_START);
    const hi = out.body.indexOf("## ");
    expect(qi).toBeGreaterThan(-1);
    expect(qi).toBeLessThan(mi);
    expect(mi).toBeLessThan(hi);
  });
});
