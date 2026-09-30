import { describe, it, expect } from "vitest";
import { MODE, loadRequestSettings } from "../src/core/llm/request-settings";
import { DEFAULT_LLM_SETTINGS } from "../src/core/llm/settings-defaults";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { stripLegacyLlmFields } from "../src/core/settings/migrate";

describe("loadRequestSettings — Legacy-Migration llm.requestThinking (Modus creative)", () => {
  it("Modus ist creative", () => { expect(MODE).toBe("creative"); });

  it("true (alter Default) → Einschalt-Stufe medium, false → off", () => {
    expect(loadRequestSettings({ llm: { requestThinking: true } }).request.thinking.creative).toBe("medium");
    expect(loadRequestSettings({ llm: { requestThinking: false } }).request.thinking.creative).toBe("off");
  });

  it("ohne Altfeld und ohne request bleibt die Stufe ungesetzt (Modus-Default medium greift)", () => {
    expect(loadRequestSettings({}).request.thinking.creative).toBeUndefined();
    expect(loadRequestSettings(null).request).toEqual({ overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false });
  });

  it("eine schon gesetzte Stufe gewinnt gegen das Altfeld", () => {
    const r = loadRequestSettings({ llm: { requestThinking: false }, request: { thinking: { creative: "high" } } });
    expect(r.request.thinking.creative).toBe("high");
  });

  it("meldet verworfene Pfade statt sie still zu schlucken", () => {
    const r = loadRequestSettings({ request: { overrides: { creative: { unknown: { temperature: 99 } } } } });
    expect(r.dropped.length).toBeGreaterThan(0);
  });
});

describe("Legacy-Feld requestThinking ist aus dem Modell", () => {
  it("steht nicht mehr in den LLM-Defaults", () => {
    expect(DEFAULT_LLM_SETTINGS).not.toHaveProperty("requestThinking");
  });
  it("stripLegacyLlmFields entfernt es aus einem geladenen Bestand", () => {
    const llm = { ...DEFAULT_LLM_SETTINGS, requestThinking: true } as Record<string, unknown>;
    stripLegacyLlmFields(llm as never);
    expect(llm).not.toHaveProperty("requestThinking");
  });
  it("DEFAULT_SETTINGS traegt einen leeren request-Block", () => {
    expect(DEFAULT_SETTINGS.request).toEqual({ overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false });
  });
});
