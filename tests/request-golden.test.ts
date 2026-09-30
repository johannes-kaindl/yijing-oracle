import { describe, it, expect } from "vitest";
import { buildInterpretationParams } from "../src/obsidian/llm-call";
import type { BackendId, FamilyId, ThinkingLevel } from "../src/vendor/kit/sampling-profiles";

/* Goldene Requests des Plugins (Rezept 8): erzeugt ueber den Wrapper buildInterpretationParams
   (fester Modus creative), nicht ueber resolveRequestParams direkt — sonst pruefte der Test das
   Kit statt das Plugin. Die Werte stehen hier als Tabelle (abgelesen aus der code-kit-Tabelle
   sampling-profiles, Stand Kit 0.7.0): eine Aenderung dort bricht diesen Test sichtbar.
   Modus creative = Temperatur 0.7, Thinking-Default medium. */

type Row = [FamilyId | null, BackendId, ThinkingLevel, Record<string, number | string>];

const EXPECTED: Row[] = [
  ["qwen3.8", "lmstudio", "medium", {"temperature":0.7,"top_p":0.95,"top_k":20,"min_p":0,"reasoning_effort":"medium"}],
  ["qwen3.8", "lmstudio", "off", {"temperature":0.7,"top_p":0.8,"top_k":20,"min_p":0,"reasoning_effort":"none"}],
  ["qwen3.8", "openwebui", "medium", {"temperature":0.7,"top_p":0.95,"top_k":20,"min_p":0,"reasoning_effort":"medium"}],
  ["qwen3.8", "openwebui", "off", {"temperature":0.7,"top_p":0.8,"top_k":20,"min_p":0,"presence_penalty":1.5,"reasoning_effort":"none"}],
  ["qwen3.8", "unknown", "medium", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"medium"}],
  ["qwen3.8", "unknown", "off", {"temperature":0.7,"top_p":0.8,"reasoning_effort":"none"}],
  ["qwen3.6", "lmstudio", "medium", {"temperature":0.7,"top_p":0.95,"top_k":20,"reasoning_effort":"medium"}],
  ["qwen3.6", "lmstudio", "off", {"temperature":0.7,"top_p":0.95,"top_k":20,"reasoning_effort":"none"}],
  ["qwen3.6", "openwebui", "medium", {"temperature":0.7,"top_p":0.95,"top_k":20,"reasoning_effort":"medium"}],
  ["qwen3.6", "openwebui", "off", {"temperature":0.7,"top_p":0.95,"top_k":20,"reasoning_effort":"none"}],
  ["qwen3.6", "unknown", "medium", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"medium"}],
  ["qwen3.6", "unknown", "off", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"none"}],
  ["gemma4", "lmstudio", "medium", {"temperature":0.7,"top_p":0.95,"top_k":64,"reasoning_effort":"medium"}],
  ["gemma4", "lmstudio", "off", {"temperature":0.7,"top_p":0.95,"top_k":64,"reasoning_effort":"none"}],
  ["gemma4", "openwebui", "medium", {"temperature":0.7,"top_p":0.95,"top_k":64,"reasoning_effort":"medium"}],
  ["gemma4", "openwebui", "off", {"temperature":0.7,"top_p":0.95,"top_k":64,"reasoning_effort":"none"}],
  ["gemma4", "unknown", "medium", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"medium"}],
  ["gemma4", "unknown", "off", {"temperature":0.7,"top_p":0.95,"reasoning_effort":"none"}],
  ["gpt-oss", "lmstudio", "medium", {"temperature":0.7,"top_p":1,"reasoning_effort":"medium"}],
  ["gpt-oss", "lmstudio", "off", {"temperature":0.7,"top_p":1,"reasoning_effort":"minimal"}],
  ["gpt-oss", "openwebui", "medium", {"temperature":0.7,"top_p":1,"reasoning_effort":"medium"}],
  ["gpt-oss", "openwebui", "off", {"temperature":0.7,"top_p":1,"reasoning_effort":"minimal"}],
  ["gpt-oss", "unknown", "medium", {"temperature":0.7,"top_p":1,"reasoning_effort":"medium"}],
  ["gpt-oss", "unknown", "off", {"temperature":0.7,"top_p":1,"reasoning_effort":"minimal"}],
  [null, "lmstudio", "medium", {"temperature":0.7,"reasoning_effort":"medium"}],
  [null, "lmstudio", "off", {"temperature":0.7,"reasoning_effort":"none"}],
  [null, "openwebui", "medium", {"temperature":0.7,"reasoning_effort":"medium"}],
  [null, "openwebui", "off", {"temperature":0.7,"reasoning_effort":"none"}],
  [null, "unknown", "medium", {"temperature":0.7}],
  [null, "unknown", "off", {"temperature":0.7}],
];

describe("buildInterpretationParams — goldene Requests (Modus creative)", () => {
  it.each(EXPECTED)("Familie %s × Backend %s × Denken %s", (family, backend, thinking, params) => {
    expect(buildInterpretationParams({ family, backend, thinking }).params).toEqual(params);
  });

  it("Ueberschreibung gewinnt vor Modus- und Familien-Wert", () => {
    const { params } = buildInterpretationParams({ family: "qwen3.6", backend: "lmstudio", thinking: "medium", overrides: { temperature: 1.1 } });
    expect(params.temperature).toBe(1.1);
  });

  // Uebertragen aus llm-call.test.ts (26f2b7e): gpt-oss/harmony lehnt Thinking-Suppress-Felder mit
  // HTTP 400 ab — auch mit Denken "aus" duerfen sie nicht im Body stehen.
  it("gpt-oss: Denken aus sendet keine Suppress-Felder (lehnt chat_template_kwargs/reasoning_budget ab)", () => {
    const { params } = buildInterpretationParams({ family: "gpt-oss", backend: "lmstudio", thinking: "off" });
    expect(params).not.toHaveProperty("chat_template_kwargs");
    expect(params).not.toHaveProperty("reasoning_budget");
    expect(params.reasoning_effort).not.toBe("none");
  });
});
