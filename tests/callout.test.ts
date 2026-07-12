import { describe, it, expect } from "vitest";
import { wrapCallout } from "../src/core/llm/callout";

describe("wrapCallout", () => {
  it("baut geschlossenen Callout mit zeilen-geprefixtem Body", () => {
    expect(wrapCallout("Denkprozess", "Zeile 1\nZeile 2", "note", false))
      .toBe("> [!note]- Denkprozess\n> Zeile 1\n> Zeile 2");
  });
  it("offener Callout mit +", () => {
    expect(wrapCallout("T", "x", "quote", true)).toBe("> [!quote]+ T\n> x");
  });
  it("erhält Leerzeilen als '>'-Zeilen (Callout-Kontinuität)", () => {
    expect(wrapCallout("T", "a\n\nb", "note", false)).toBe("> [!note]- T\n> a\n>\n> b");
  });
});
