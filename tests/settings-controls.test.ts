// Die Wert-Schicht der deklarativen Settings-API. Getestet wird, was bis 0.4.0 in
// onChange-Callbacks der Render-Schicht stand und deshalb ungetestet war: Trimmen,
// Default-Rückfall und Zahl-Coercion. Der native 1.13-Host prüft nur den Control-Typ —
// alles darüber hinaus muss hier abgefangen werden.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/core/settings";
import { DEFAULT_FILENAME_TEMPLATE } from "../src/core/filename";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-settings";
import { SETTING_CONTROLS, readControl, writeControl } from "../src/core/settings/controls";

/** Frische Kopie — die Specs mutieren das übergebene Objekt. */
function fresh(): PluginSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("readControl", () => {
  it("liest flache und verschachtelte Felder über denselben Schlüsselraum", () => {
    const s = fresh();
    s.readingsFolder = "Orakel";
    s.llm.apiKey = "sk-test";
    s.image.backend = "comfyui";

    expect(readControl(s, "readingsFolder")).toBe("Orakel");
    expect(readControl(s, "llm.apiKey")).toBe("sk-test");
    expect(readControl(s, "image.backend")).toBe("comfyui");
  });

  it("liefert Dropdown-Werte als String, weil Obsidian Dropdowns über String-Schlüssel führt", () => {
    const s = fresh();
    s.image.size = 1024;
    expect(readControl(s, "image.size")).toBe("1024");
  });

  it("wirft bei einem unbekannten Schlüssel, statt still nichts zu tun", () => {
    expect(() => readControl(fresh(), "gibtsNicht")).toThrow(/Unbekannter Settings-Schlüssel/);
    expect(() => writeControl(fresh(), "gibtsNicht", 1)).toThrow(/Unbekannter Settings-Schlüssel/);
  });
});

describe("writeControl — Normalisierung", () => {
  it("fällt bei leerem Pflichttext auf den Default zurück statt leer zu speichern", () => {
    const s = fresh();
    writeControl(s, "readingsFolder", "   ");
    writeControl(s, "filenameTemplate", "");
    expect(s.readingsFolder).toBe(DEFAULT_SETTINGS.readingsFolder);
    expect(s.filenameTemplate).toBe(DEFAULT_FILENAME_TEMPLATE);
  });

  it("trimmt Endpunkt und API-Schlüssel", () => {
    const s = fresh();
    writeControl(s, "llm.apiKey", "  sk-abc  ");
    writeControl(s, "image.endpoint", " http://127.0.0.1:8000 ");
    expect(s.llm.apiKey).toBe("sk-abc");
    expect(s.image.endpoint).toBe("http://127.0.0.1:8000");
  });

  it("behält einen leeren System-Prompt — leer heißt hier „nimm den Default-Prompt“", () => {
    const s = fresh();
    s.llm.systemPromptDe = "eigener Prompt";
    writeControl(s, "llm.systemPromptDe", "");
    expect(s.llm.systemPromptDe).toBe("");
  });

  it("wandelt Zahlenfelder aus dem Fallback-Textfeld und weist Müll ab", () => {
    const s = fresh();
    writeControl(s, "image.steps", "8");
    expect(s.image.steps).toBe(8);

    writeControl(s, "image.steps", "abc");
    expect(s.image.steps).toBe(DEFAULT_IMAGE_SETTINGS.steps);

    writeControl(s, "image.steps", -3);
    expect(s.image.steps).toBe(DEFAULT_IMAGE_SETTINGS.steps);

    writeControl(s, "image.steps", 12.7);
    expect(s.image.steps).toBe(12);
  });

  it("macht aus einem Objekt keinen Text — es würde sonst als „[object Object]“ gespeichert", () => {
    const s = fresh();
    writeControl(s, "llm.apiKey", { nope: true });
    expect(s.llm.apiKey).toBe("");
  });

  it("hält die Bildgröße als Zahl, obwohl das Dropdown Strings liefert", () => {
    const s = fresh();
    writeControl(s, "image.size", "512");
    expect(s.image.size).toBe(512);
  });

  it("nimmt für die ComfyUI-Steps leer als gültigen Wert (der Workflow gewinnt)", () => {
    const s = fresh();
    writeControl(s, "image.comfyStepsOverride", "4");
    expect(s.image.comfyStepsOverride).toBe(4);

    writeControl(s, "image.comfyStepsOverride", "");
    expect(s.image.comfyStepsOverride).toBeNull();

    writeControl(s, "image.comfyStepsOverride", "0");
    expect(s.image.comfyStepsOverride).toBeNull();
  });

  it("kennt für das Backend nur die zwei erlaubten Werte", () => {
    const s = fresh();
    writeControl(s, "image.backend", "comfyui");
    expect(s.image.backend).toBe("comfyui");
    writeControl(s, "image.backend", "irgendwas");
    expect(s.image.backend).toBe("a1111");
  });
});

describe("writeControl — Refresh-Meldung", () => {
  it("meldet genau bei den Schlüsseln neu aufzubauen, die die Zeilen-Auswahl ändern", () => {
    const s = fresh();
    expect(writeControl(s, "includeFrontmatter", false)).toBe(true);
    expect(writeControl(s, "image.backend", "comfyui")).toBe(true);
    expect(writeControl(s, "llm.model", "qwen")).toBe(true);

    expect(writeControl(s, "showNotes", false)).toBe(false);
    expect(writeControl(s, "image.styleSuffix", "tusche")).toBe(false);
  });
});

describe("Registry-Vollständigkeit", () => {
  it("liest jeden registrierten Schlüssel aus den Defaults, ohne zu werfen", () => {
    // Fängt den Fall ab, dass ein Getter auf ein Feld greift, das es nicht (mehr) gibt:
    // undefined käme sonst als leere Zeile in der Oberfläche an.
    const s = fresh();
    for (const key of Object.keys(SETTING_CONTROLS)) {
      expect(readControl(s, key), key).toBeDefined();
    }
  });
});
