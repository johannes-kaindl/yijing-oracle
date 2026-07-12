import { describe, it, expect } from "vitest";
import { rulingText, rulingSentence } from "../src/core/ruling";
import { buildReading } from "../src/core/reading";
import { type Line } from "../src/core/casting";

const L = (...values: number[]): Line[] => values.map((value) => ({ value }));

describe("rulingText", () => {
  it("0 wandelnde Linien → Ursprungs-Urteil", () => {
    expect(rulingText({ primaryNumber: 63, changingIndices: [] }))
      .toEqual({ rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" });
  });
  it("1 wandelnde Linie → deren Text, sie entscheidet", () => {
    expect(rulingText({ primaryNumber: 10, changingIndices: [2] }))
      .toEqual({ rule: "line-primary", lineIndices: [2], decisiveIndex: 2, source: "primary" });
  });
  it("2 wandelnde Linien → beide, obere (höherer Index) entscheidet", () => {
    expect(rulingText({ primaryNumber: 10, changingIndices: [1, 4] }))
      .toEqual({ rule: "lines-primary", lineIndices: [1, 4], decisiveIndex: 4, source: "primary" });
  });
  it("3 wandelnde Linien → beide Urteile, Ursprung führt", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 2, 4] });
    expect(r.rule).toBe("judgments-both");
    expect(r.source).toBe("both");
    expect(r.decisiveIndex).toBeNull();
  });
  it("4 wandelnde Linien → ruhende Zielbild-Linien, untere entscheidet", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 1, 2, 3] });
    expect(r).toEqual({ rule: "lines-resulting", lineIndices: [4, 5], decisiveIndex: 4, source: "resulting" });
  });
  it("5 wandelnde Linien → eine ruhende Zielbild-Linie", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 1, 2, 3, 4] });
    expect(r).toEqual({ rule: "line-resulting", lineIndices: [5], decisiveIndex: 5, source: "resulting" });
  });
  it("6 wandelnde Linien, normal → Zielbild-Urteil", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 1, 2, 3, 4, 5] });
    expect(r).toEqual({ rule: "judgment-resulting", lineIndices: [], decisiveIndex: null, source: "resulting" });
  });
  it("6 wandelnde Linien bei Qian (1) → Sonderspruch, Yong-Index 6", () => {
    const r = rulingText({ primaryNumber: 1, changingIndices: [0, 1, 2, 3, 4, 5] });
    expect(r).toEqual({ rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" });
  });
  it("6 wandelnde Linien bei Kun (2) → Sonderspruch", () => {
    expect(rulingText({ primaryNumber: 2, changingIndices: [0, 1, 2, 3, 4, 5] }).rule).toBe("special-qian-kun");
  });
});

describe("rulingSentence", () => {
  it("liefert Label + Satz in der Reading-Sprache (DE)", () => {
    const r = buildReading(L(6, 7, 7, 7, 7, 7)); // 1 wandelnde Linie (Position 1)
    const s = rulingSentence(r, "de");
    expect(s.label).toBe("Maßgeblich nach Tradition");
    expect(s.text).toBe("Eine wandelnde Linie — ihr Text ist maßgeblich.");
    expect(s.result.decisiveIndex).toBe(0);
  });
  it("liefert englischen Satz", () => {
    const r = buildReading(L(6, 7, 7, 7, 7, 7));
    expect(rulingSentence(r, "en").text).toBe("One moving line — its text is decisive.");
  });
});
