import { describe, it, expect } from "vitest";
import { effectiveModel } from "../src/core/llm/settings-defaults";

describe("effectiveModel", () => {
  it("gibt das gewählte Modell zurück, wenn gesetzt", () => {
    expect(effectiveModel("qwen", ["gemma", "qwen"])).toBe("qwen");
  });
  it("fällt auf das erste verfügbare zurück, wenn leer (Dropdown-Default-Bug)", () => {
    expect(effectiveModel("", ["gemma", "qwen"])).toBe("gemma");
  });
  it("bleibt leer, wenn nichts gewählt und nichts verfügbar", () => {
    expect(effectiveModel("", [])).toBe("");
  });
  it("behandelt Whitespace-only als leer", () => {
    expect(effectiveModel("   ", ["gemma"])).toBe("gemma");
  });
});
