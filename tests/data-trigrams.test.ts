import { describe, it, expect } from "vitest";
import { getHexagram } from "../src/core/data";

describe("getHexagram — Trigramme + Bedeutung", () => {
  it("liefert oberes/unteres Trigramm (Hex 3)", () => {
    const h = getHexagram(3, "de", "classic");
    expect(h.trigrams.above.symbol).toBe("☵");
    expect(h.trigrams.above.name).toBe("坎");
    expect(h.trigrams.above.family).toBe("mittlerer Sohn");
    expect(h.trigrams.above.nature).toBe("Wasser");
    expect(h.trigrams.below.nature).toBe("Donner");
  });
  it("liefert die Bedeutung (DE nicht leer)", () => {
    const h = getHexagram(3, "de", "classic");
    expect(h.meaning.length).toBeGreaterThan(20);
  });
  it("nutzt meaning_en für EN-Readings", () => {
    const de = getHexagram(3, "de", "classic");
    const en = getHexagram(3, "en", "classic");
    expect(en.meaning.length).toBeGreaterThan(20);
    expect(en.meaning).not.toBe(de.meaning); // englische Variante
  });
});
