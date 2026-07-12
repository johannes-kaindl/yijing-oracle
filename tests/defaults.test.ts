import { describe, it, expect } from "vitest";
import { DEFAULT_SYSTEM_PROMPT } from "../src/core/llm/defaults";

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("hat nicht-leere de/en Prompts", () => {
    expect(DEFAULT_SYSTEM_PROMPT.de.length).toBeGreaterThan(50);
    expect(DEFAULT_SYSTEM_PROMPT.en.length).toBeGreaterThan(50);
  });
  it("weist auf die Yijing-/I-Ging-Deutung hin", () => {
    expect(DEFAULT_SYSTEM_PROMPT.de.toLowerCase()).toMatch(/i ging|yijing|hexagramm/);
    expect(DEFAULT_SYSTEM_PROMPT.en.toLowerCase()).toMatch(/i ching|yijing|hexagram/);
  });
});
