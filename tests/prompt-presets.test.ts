import { describe, it, expect } from "vitest";
import { PROMPT_PRESETS, getPresetBody } from "../src/core/llm/prompt-presets";

describe("PROMPT_PRESETS", () => {
  it("enthält die erwarteten Vorlagen mit nicht-leeren de/en-Bodies", () => {
    const ids = PROMPT_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["default", "literary", "psychological", "concise"]);
    for (const p of PROMPT_PRESETS) {
      expect(p.body.de.length).toBeGreaterThan(50);
      expect(p.body.en.length).toBeGreaterThan(50);
      expect(p.label.de).toBeTruthy();
    }
  });
  it("psychological nennt C. G. Jung / Individuation", () => {
    expect(getPresetBody("psychological", "de")).toMatch(/Jung/);
    expect(getPresetBody("psychological", "en")).toMatch(/individuation/i);
  });
  it("getPresetBody liefert null bei unbekannter id", () => {
    expect(getPresetBody("nope", "de")).toBeNull();
  });
});
