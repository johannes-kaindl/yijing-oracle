import { describe, expect, it } from "vitest";
import { getHexagram } from "../src/core/data";

describe("imageAssociation", () => {
  it("ist für alle 64 Hexagramme in beiden Sprachen nicht-leer", () => {
    for (let n = 1; n <= 64; n++) {
      expect(getHexagram(n, "de", "classic").imageAssociation.trim()).not.toBe("");
      expect(getHexagram(n, "en", "classic").imageAssociation.trim()).not.toBe("");
    }
  });

  it("ist sprachunabhängig (DE == EN)", () => {
    for (let n = 1; n <= 64; n++) {
      expect(getHexagram(n, "de", "neutral").imageAssociation).toBe(getHexagram(n, "en", "neutral").imageAssociation);
    }
  });
});
