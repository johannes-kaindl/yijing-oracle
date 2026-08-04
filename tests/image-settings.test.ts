import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-settings";

describe("DEFAULT_IMAGE_SETTINGS", () => {
  it("Feature ist per Default aus (leerer Endpoint), sinnvolle Prompt-Defaults", () => {
    expect(DEFAULT_IMAGE_SETTINGS.endpoint).toBe("");
    expect(DEFAULT_IMAGE_SETTINGS.styleSuffix).toBe("ink wash painting, soft light, muted colors");
    expect(DEFAULT_IMAGE_SETTINGS.negativePrompt).toBe("text, watermark, signature, frame, border, lowres, blurry");
    expect(DEFAULT_IMAGE_SETTINGS.size).toBe(768);
  });

  it("Alt-Settings ohne image-Block füllen sich per Spread auf", () => {
    const legacy = { endpoint: "http://mac-mini:7860" };
    const merged = { ...DEFAULT_IMAGE_SETTINGS, ...legacy };
    expect(merged.endpoint).toBe("http://mac-mini:7860");
    expect(merged.size).toBe(768);
  });
});

describe("ImageSettings — Backend-Erweiterung", () => {
  it("ist per Default A1111, damit Bestandskonfigurationen unverändert laufen", () => {
    expect(DEFAULT_IMAGE_SETTINGS.backend).toBe("a1111");
    expect(DEFAULT_IMAGE_SETTINGS.steps).toBe(28);
    expect(DEFAULT_IMAGE_SETTINGS.comfyWorkflow).toBe("");
    expect(DEFAULT_IMAGE_SETTINGS.comfyStepsOverride).toBe(null);
  });

  it("eine data.json ohne die neuen Felder bekommt sie aus den Defaults", () => {
    const alt = { endpoint: "http://127.0.0.1:7860", styleSuffix: "s", negativePrompt: "n", size: 768 };
    const merged = { ...DEFAULT_IMAGE_SETTINGS, ...alt };
    expect(merged.backend).toBe("a1111");
    expect(merged.endpoint).toBe("http://127.0.0.1:7860");
  });
});
