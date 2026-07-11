import { describe, it, expect } from "vitest";
import { buildReading } from "../src/core/reading";
import { renderReading } from "../src/core/render";
import { type Line } from "../src/core/casting";

const L = (...values: number[]): Line[] => values.map((value) => ({ value }));

describe("renderReading", () => {
  it("no changing lines: no Wandlungen/Wird-zu sections", () => {
    const r = buildReading(L(7, 8, 7, 8, 7, 8)); // hex 63, stable
    const out = renderReading(r, { lang: "de", register: "classic", date: "2026-07-12T14:23" });
    expect(out.body).toContain("## Das Urteil");
    expect(out.body).toContain("## Das Bild");
    expect(out.body).not.toContain("## Die Wandlungen");
    expect(out.body).not.toContain("Wird zu");
    expect(out.frontmatter).toContain("changing_lines: []");
    expect(out.frontmatter).not.toContain("resulting:");
    expect(out.frontmatter).toContain("hexagram: 63");
  });

  it("changing lines: renders Wandlungen + Wird-zu with resulting hexagram", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7)); // changing at 1 and 4
    const out = renderReading(r, {
      lang: "de",
      register: "classic",
      date: "2026-07-12T14:23",
      question: "Nach dem Umzug?",
    });
    expect(out.frontmatter).toContain("changing_lines: [1, 4]");
    expect(out.frontmatter).toMatch(/resulting: \d+/);
    expect(out.frontmatter).toContain('question: "Nach dem Umzug?"');
    expect(out.body).toContain("## Die Wandlungen (1, 4)");
    expect(out.body).toContain("Wird zu →");
    expect(out.body).toContain("**Frage:** Nach dem Umzug?");
  });

  it("english + neutral register produces english labels", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    const out = renderReading(r, { lang: "en", register: "neutral", date: "2026-07-12T14:23" });
    expect(out.body).toContain("## The Judgment");
    expect(out.body).toContain("## The Changing Lines (1, 4)");
    expect(out.body).toContain("Becomes →");
    expect(out.frontmatter).toContain("language: en");
    expect(out.frontmatter).toContain("register: neutral");
  });

  it("all-changing hex 1 uses the Yong text, not six line entries", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9)); // hex 1 → hex 2, all changing
    const out = renderReading(r, { lang: "de", register: "classic", date: "2026-07-12T14:23" });
    expect(out.body).toContain("## Die Wandlungen");
    // Yong-Position von Hex 1: "Wenn lauter Neunen erscheinen, bedeutet das:"
    expect(out.body).toContain("lauter Neunen");
  });

  it("previewBody omits H1 + subtitle but keeps sections (no duplicate title in panel)", () => {
    const r = buildReading(L(9, 7, 8, 6, 8, 7)); // changing → has resulting
    const out = renderReading(r, { lang: "de", register: "classic", date: "2026-07-12T14:23" });
    expect(out.body.startsWith("# ")).toBe(true); // Note behält Titel
    expect(out.previewBody.startsWith("# ")).toBe(false); // Vorschau nicht
    expect(out.previewBody).not.toContain("# ䷀");
    expect(out.previewBody).toContain("## Das Urteil");
    expect(out.previewBody).toContain("Wird zu →");
  });

  it("title carries glyph, number and name", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9));
    const out = renderReading(r, { lang: "de", register: "classic", date: "2026-07-12T14:23" });
    expect(out.title).toContain("䷀");
    expect(out.title).toContain("1 ·");
    expect(out.body.startsWith("# ䷀ 1 ·")).toBe(true);
  });
});
