import { describe, expect, it } from "vitest";
import { inspectWorkflow, type ComfyGraph } from "../src/core/comfy/workflow";
import sdxl from "./fixtures/comfy-sdxl.json";

const SDXL = sdxl as unknown as ComfyGraph;

/** Tiefe Kopie des Fixtures — die Tests hängen sonst voneinander ab. */
function clone(): ComfyGraph {
  return JSON.parse(JSON.stringify(SDXL)) as ComfyGraph;
}

describe("inspectWorkflow", () => {
  it("findet die Slots im echten SDXL-Graphen", () => {
    const r = inspectWorkflow(SDXL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slots).toEqual({
      sampler: "3", positive: "6", negative: "7", latent: "5",
      seedField: "seed", stepsField: "steps",
    });
  });

  it("liest noise_seed bei KSamplerAdvanced statt seed anzunehmen", () => {
    const g = clone();
    g["3"] = { class_type: "KSamplerAdvanced", inputs: {
      noise_seed: 1, steps: 20, positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } };
    const r = inspectWorkflow(g);
    expect(r.ok && r.slots.seedField).toBe("noise_seed");
  });

  it("meldet stepsField null, wenn der Sampler keine Steps kennt", () => {
    const g = clone();
    g["3"] = { class_type: "SamplerCustom", inputs: {
      noise_seed: 1, sigmas: ["10", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } };
    const r = inspectWorkflow(g);
    expect(r.ok && r.slots.stepsField).toBe(null);
  });

  it("scheitert bei zwei Samplern statt zu raten", () => {
    const g = clone();
    g["11"] = { class_type: "KSampler", inputs: {
      seed: 1, steps: 5, positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } };
    const r = inspectWorkflow(g);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("ambiguous-sampler");
  });

  it("scheitert ohne Sampler", () => {
    const r = inspectWorkflow({ "1": { class_type: "SaveImage", inputs: {} } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("no-sampler");
  });

  it("scheitert bei einem Verweis ins Leere", () => {
    const g = clone();
    g["3"].inputs.positive = ["99", 0];
    const r = inspectWorkflow(g);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("dangling-ref");
  });

  it("scheitert bei Nicht-Objekten", () => {
    for (const bad of [null, 42, "x", []]) {
      expect(inspectWorkflow(bad).ok).toBe(false);
    }
  });
});
