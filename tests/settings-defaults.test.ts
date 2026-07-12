import { describe, it, expect } from "vitest";
import { DEFAULT_LLM_SETTINGS } from "../src/core/llm/settings-defaults";

describe("DEFAULT_LLM_SETTINGS", () => {
  it("hat sinnvolle Defaults", () => {
    expect(DEFAULT_LLM_SETTINGS.requestThinking).toBe(true);
    expect(DEFAULT_LLM_SETTINGS.thinkingInNote).toBe("closed-callout");
    expect(DEFAULT_LLM_SETTINGS.model).toBe("");
    expect(DEFAULT_LLM_SETTINGS.systemPromptDe).toBe("");
  });
});
