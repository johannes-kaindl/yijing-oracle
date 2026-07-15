import { describe, expect, it } from "vitest";
import { buildSdPrompt, composeImageRequest, hashString, moodFor } from "../src/core/image-scene";

describe("composeImageRequest (Parity zur Web-App)", () => {
  it("ohne Wandlung: nur Motiv + Atmosphäre, keine Relation", () => {
    const r = composeImageRequest({ primaryMotif: "a soaring eagle", resultingMotif: "", question: "" });
    expect(r.motif2).toBe("");
    expect(r.scene).toBe("a soaring eagle, in soft daylight");
  });

  it("mit Wandlung: beide Motive in EINEM Szenen-Satz", () => {
    const r = composeImageRequest({
      primaryMotif: "a soaring eagle",
      resultingMotif: "a wide field of golden grain",
      question: "Where should I put my energy?",
    });
    expect(r.scene).toContain("a soaring eagle");
    expect(r.scene).toContain("a wide field of golden grain");
    expect(r.motif2).not.toBe("");
  });

  it("deterministisch pro Frage", () => {
    const a = composeImageRequest({ primaryMotif: "x", resultingMotif: "y", question: "Q" });
    const b = composeImageRequest({ primaryMotif: "x", resultingMotif: "y", question: "Q" });
    expect(a.scene).toBe(b.scene);
  });

  it("leeres Motiv → sicherer Default", () => {
    const r = composeImageRequest({ primaryMotif: "", resultingMotif: "", question: "" });
    expect(r.motif).toBe("a still mountain lake");
  });

  it("Zielmotiv als Hintergrund formuliert, nicht als Übergang", () => {
    const r = composeImageRequest({
      primaryMotif: "a soaring eagle",
      resultingMotif: "a wide field of golden grain",
      question: "Where to?",
    });
    expect(r.scene).toMatch(/in the background|small in the distance|on the horizon beyond/);
    expect(r.scene).not.toMatch(/giving way to|and beyond it|rising in the distance/);
  });

  it("dunkles Hexagramm → nie warmer Modifier", () => {
    const WARM = ["in warm golden light", "in spring bloom", "in lush summer green", "under a clear blue sky", "at dawn"];
    for (let i = 0; i < 30; i++) {
      const r = composeImageRequest({
        primaryMotif: "a dark river between steep cliffs", resultingMotif: "",
        question: "Q" + i, primaryNumber: 29,
      });
      expect(WARM.includes(r.modifier)).toBe(false);
      expect(r.mood).toBe("dark");
    }
  });

  it("helles Hexagramm → nie düsterer Modifier", () => {
    const SOMBER = ["under falling snow", "under a starry night sky", "in deep shadow", "under a grey overcast sky", "at dusk"];
    for (let i = 0; i < 30; i++) {
      const r = composeImageRequest({
        primaryMotif: "a wide field of golden grain", resultingMotif: "",
        question: "Q" + i, primaryNumber: 14,
      });
      expect(SOMBER.includes(r.modifier)).toBe(false);
      expect(r.mood).toBe("bright");
    }
  });
});

describe("hashString / moodFor", () => {
  it("djb2 ist stabil", () => {
    expect(hashString("")).toBe(5381);
    expect(hashString("Q")).toBe(hashString("Q"));
    expect(hashString("Q")).not.toBe(hashString("R"));
  });
  it("moodFor kennt die kuratierten Klassen", () => {
    expect(moodFor(29)).toBe("dark");
    expect(moodFor(14)).toBe("bright");
    expect(moodFor(1)).toBe("neutral");
    expect(moodFor(undefined)).toBe("neutral");
  });
});

describe("buildSdPrompt", () => {
  it("hängt das Stil-Suffix an", () => {
    expect(buildSdPrompt("a lake, at dusk", "ink wash painting")).toBe("a lake, at dusk, ink wash painting");
  });
  it("leeres Suffix → nur die Szene", () => {
    expect(buildSdPrompt("a lake", "")).toBe("a lake");
    expect(buildSdPrompt("a lake", "  ")).toBe("a lake");
  });
});
