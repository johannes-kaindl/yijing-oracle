// Sichert den Vertrag des vendored Kit-Moduls gegen Drift beim naechsten Kit-Update ab
// (Repo-Konvention, vgl. tests/think.test.ts).
import { describe, expect, it } from "vitest";
import { parseLmStudioContext, parseOllamaContext } from "../src/vendor/kit/model-context";

describe("parseLmStudioContext", () => {
  it("liest max_context_length + loaded_context_length des passenden Modells", () => {
    const json = {
      data: [
        { id: "other", max_context_length: 1 },
        { id: "qwen3", max_context_length: 32768, loaded_context_length: 8192 },
      ],
    };
    expect(parseLmStudioContext(json, "qwen3")).toEqual({
      maxContextLength: 32768,
      loadedContextLength: 8192,
    });
  });

  it("liefert null, wenn das Modell nicht in der Liste steht", () => {
    expect(parseLmStudioContext({ data: [{ id: "other" }] }, "qwen3")).toBeNull();
  });

  it("liefert null bei kaputtem data-Feld", () => {
    expect(parseLmStudioContext({ data: "nope" }, "qwen3")).toBeNull();
  });
});

describe("parseOllamaContext", () => {
  it("findet <arch>.context_length in model_info", () => {
    expect(parseOllamaContext({ model_info: { "llama.context_length": 4096 } })).toEqual({
      maxContextLength: 4096,
    });
  });

  it("liefert null ohne model_info", () => {
    expect(parseOllamaContext({})).toBeNull();
  });
});
