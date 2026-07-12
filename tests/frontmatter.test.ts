import { describe, it, expect } from "vitest";
import {
  DEFAULT_FRONTMATTER_FIELDS,
  MARKER_KEY,
  buildFrontmatter,
  type FrontmatterField,
  type FrontmatterValues,
} from "../src/core/frontmatter";

const VALUES: FrontmatterValues = {
  date: "2026-07-12T14:23",
  question: "Was jetzt?",
  hexagram: 11,
  changingLines: [2, 5],
  resulting: 34,
  language: "de",
  register: "neutral",
};

const clone = (): FrontmatterField[] => DEFAULT_FRONTMATTER_FIELDS.map((f) => ({ ...f }));

describe("buildFrontmatter", () => {
  it("always emits the marker first", () => {
    const fm = buildFrontmatter(clone(), VALUES);
    expect(fm.split("\n")[0]).toBe(`${MARKER_KEY}: true`);
  });

  it("emits all default fields with default keys", () => {
    const fm = buildFrontmatter(clone(), VALUES);
    expect(fm).toContain("date: 2026-07-12T14:23");
    expect(fm).toContain('question: "Was jetzt?"');
    expect(fm).toContain("hexagram: 11");
    expect(fm).toContain("changing_lines: [2, 5]");
    expect(fm).toContain("resulting: 34");
    expect(fm).toContain("language: de");
    expect(fm).toContain("register: neutral");
  });

  it("omits disabled fields", () => {
    const fields = clone().map((f) => (f.id === "question" || f.id === "register" ? { ...f, enabled: false } : f));
    const fm = buildFrontmatter(fields, VALUES);
    expect(fm).not.toContain("question:");
    expect(fm).not.toContain("register:");
    expect(fm).toContain("hexagram: 11"); // andere bleiben
  });

  it("honours renamed keys", () => {
    const fields = clone().map((f) => (f.id === "hexagram" ? { ...f, key: "hexagramm" } : f));
    const fm = buildFrontmatter(fields, VALUES);
    expect(fm).toContain("hexagramm: 11");
    expect(fm).not.toMatch(/^hexagram: /m);
  });

  it("skips resulting when there are no changing lines (value null)", () => {
    const fm = buildFrontmatter(clone(), { ...VALUES, changingLines: [], resulting: null });
    expect(fm).toContain("changing_lines: []");
    expect(fm).not.toContain("resulting:");
  });

  it("falls back to the field id when the key is blank", () => {
    const fields = clone().map((f) => (f.id === "date" ? { ...f, key: "  " } : f));
    const fm = buildFrontmatter(fields, VALUES);
    expect(fm).toContain("date: 2026-07-12T14:23");
  });
});
