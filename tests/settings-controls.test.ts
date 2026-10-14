// Die Wert-Schicht der deklarativen Settings-API. Getestet wird, was bis 0.4.0 in
// onChange-Callbacks der Render-Schicht stand und deshalb ungetestet war: Trimmen,
// Default-Rückfall und Zahl-Coercion. Der native 1.13-Host prüft nur den Control-Typ —
// alles darüber hinaus muss hier abgefangen werden.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/core/settings";
import { DEFAULT_FILENAME_TEMPLATE } from "../src/core/filename";
import { SETTING_CONTROLS, readControl, writeControl } from "../src/core/settings/controls";

/** Frische Kopie — die Specs mutieren das übergebene Objekt. */
function fresh(): PluginSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("readControl", () => {
  it("liest flache und verschachtelte Felder über denselben Schlüsselraum", () => {
    const s = fresh();
    s.readingsFolder = "Orakel";
    s.image.styleSuffix = "tusche";

    expect(readControl(s, "readingsFolder")).toBe("Orakel");
    expect(readControl(s, "image.styleSuffix")).toBe("tusche");
  });

  it("kennt die Schlüssel der früheren Bild-Anbindung nicht mehr", () => {
    for (const k of ["image.backend", "image.endpoint", "image.size", "image.steps", "image.negativePrompt", "image.comfyWorkflow", "image.comfyStepsOverride"]) {
      expect(() => readControl(fresh(), k), k).toThrow(/Unbekannter Settings-Schlüssel/);
    }
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

  it("behält einen leeren System-Prompt — leer heißt hier „nimm den Default-Prompt“", () => {
    const s = fresh();
    s.llm.systemPromptDe = "eigener Prompt";
    writeControl(s, "llm.systemPromptDe", "");
    expect(s.llm.systemPromptDe).toBe("");
  });

  it("macht aus einem Objekt keinen Text — es würde sonst als „[object Object]“ gespeichert", () => {
    const s = fresh();
    writeControl(s, "image.styleSuffix", { nope: true });
    expect(s.image.styleSuffix).toBe("");
  });
});

describe("writeControl — Refresh-Meldung", () => {
  it("meldet genau bei den Schlüsseln neu aufzubauen, die die Zeilen-Auswahl ändern", () => {
    const s = fresh();
    expect(writeControl(s, "includeFrontmatter", false)).toBe(true);

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
