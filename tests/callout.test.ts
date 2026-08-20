import { describe, it, expect } from "vitest";
import { wrapCallout } from "../src/vendor/kit/callout";
import { CALLOUT_SECTIONS, DEFAULT_CALLOUTS, mergeCallouts } from "../src/core/note-callouts";

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

  // Regression: bis 0.5.1 sprengte ein \n in Titel ODER Typ den Kopf — alles hinter dem Umbruch
  // landete als nackter Text NEBEN dem Callout. Der Typ kommt je Sektion aus einem freien
  // Textfeld (src/obsidian/settings/note-section.ts), dessen trim() nur die Ränder putzt.
  it("Umbruch in Titel oder Typ sprengt den Kopf nicht — er bleibt EINE Zeile", () => {
    expect(wrapCallout("A\nB", "x", "note", false)).toBe("> [!note]- A B\n> x");
    expect(wrapCallout("T", "x", "no\nte", false)).toBe("> [!no te]- T\n> x");
  });
});

describe("note-callouts config", () => {
  it("kennt overview + question mit sinnvollen Defaults", () => {
    expect(CALLOUT_SECTIONS).toContain("overview");
    expect(CALLOUT_SECTIONS).toContain("question");
    expect(DEFAULT_CALLOUTS.overview).toEqual({ enabled: true, type: "note" });
    expect(DEFAULT_CALLOUTS.question).toEqual({ enabled: true, type: "question" });
  });

  it("mergeCallouts füllt neue Sektionen aus Defaults auf", () => {
    const merged = mergeCallouts({ judgment: { enabled: false } });
    expect(merged.overview).toEqual({ enabled: true, type: "note" });
    expect(merged.question).toEqual({ enabled: true, type: "question" });
    expect(merged.judgment).toEqual({ enabled: false, type: "quote" });
  });
});
