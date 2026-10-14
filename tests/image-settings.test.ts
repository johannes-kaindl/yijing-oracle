import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_SETTINGS, normalizeImageSettings } from "../src/core/image-settings";

describe("DEFAULT_IMAGE_SETTINGS", () => {
  it("trägt nur noch den Stil-Zusatz: Server, Größe und Negativ-Prompt gehören local-image-generator", () => {
    expect(Object.keys(DEFAULT_IMAGE_SETTINGS)).toEqual(["styleSuffix"]);
    expect(DEFAULT_IMAGE_SETTINGS.styleSuffix).toBe("ink wash painting, soft light, muted colors");
  });
});

describe("normalizeImageSettings", () => {
  it("lässt den eigenen Stil-Zusatz stehen, auch den leeren", () => {
    expect(normalizeImageSettings({ styleSuffix: "watercolor" })).toEqual({ styleSuffix: "watercolor" });
    expect(normalizeImageSettings({ styleSuffix: "" })).toEqual({ styleSuffix: "" });
  });

  it("wirft die Schlüssel der Eigenbau-Anbindung (A1111, ComfyUI) beim Laden weg", () => {
    const alt = {
      backend: "comfyui", endpoint: "http://127.0.0.1:8000", styleSuffix: "s", negativePrompt: "n", size: 1024, steps: 12,
      comfyWorkflow: "{}", comfyStepsOverride: 4,
    };
    expect(normalizeImageSettings(alt)).toEqual({ styleSuffix: "s" });
  });

  it("fällt bei fehlendem Block oder Unsinn auf den Default zurück", () => {
    expect(normalizeImageSettings(undefined)).toEqual(DEFAULT_IMAGE_SETTINGS);
    expect(normalizeImageSettings(null)).toEqual(DEFAULT_IMAGE_SETTINGS);
    expect(normalizeImageSettings("x")).toEqual(DEFAULT_IMAGE_SETTINGS);
    expect(normalizeImageSettings({ styleSuffix: 5 })).toEqual(DEFAULT_IMAGE_SETTINGS);
    expect(normalizeImageSettings({})).toEqual(DEFAULT_IMAGE_SETTINGS);
  });
});
