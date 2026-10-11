import { describe, expect, it } from "vitest";
import { migrateLlmSettings } from "../src/core/settings/migrate";
import { DEFAULT_LLM_SETTINGS } from "../src/core/llm/settings-defaults";

describe("migrateLlmSettings — Endpunkt-Liste", () => {
  it("parst den alten Textarea-String zeilenweise (Bestands-data.json bis 0.2.0)", () => {
    const { llm, migrated } = migrateLlmSettings({ endpoints: "http://a:1\nhttp://b:2" }, "");
    expect(llm.endpoints).toEqual([{ url: "http://a:1" }, { url: "http://b:2" }]);
    expect(migrated).toBe(true);
  });

  it("macht aus einem string[] eine EndpointConfig[]", () => {
    const { llm, migrated } = migrateLlmSettings({ endpoints: ["http://a:1", "", "  ", "http://b:2"] }, "");
    expect(llm.endpoints).toEqual([{ url: "http://a:1" }, { url: "http://b:2" }]);
    expect(migrated).toBe(true);
  });

  it("lässt eine schon migrierte EndpointConfig[] unverändert und verlangt kein Neuschreiben", () => {
    const eps = [{ url: "http://a:1", id: "x", secretId: "yijing-oracle-ep-x", model: "m" }];
    const { llm, migrated } = migrateLlmSettings({ endpoints: eps }, "");
    expect(llm.endpoints).toEqual(eps);
    expect(migrated).toBe(false);
  });

  it("fehlendes Feld → die Default-Liste, als frische Kopie", () => {
    const { llm } = migrateLlmSettings({}, "");
    expect(llm.endpoints).toEqual(DEFAULT_LLM_SETTINGS.endpoints);
    expect(llm.endpoints).not.toBe(DEFAULT_LLM_SETTINGS.endpoints);
    expect(llm.endpoints[0]).not.toBe(DEFAULT_LLM_SETTINGS.endpoints[0]);
  });

  it("leere Liste bleibt leer (kein Rückfall auf den Default)", () => {
    expect(migrateLlmSettings({ endpoints: [] }, "").llm.endpoints).toEqual([]);
  });

  it("kein Objekt (null, undefined) → Defaults", () => {
    expect(migrateLlmSettings(undefined, "").llm).toEqual(DEFAULT_LLM_SETTINGS);
    expect(migrateLlmSettings(null, "").llm).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it("meldet verworfene Einträge, statt sie still zu verlieren", () => {
    const { llm, dropped } = migrateLlmSettings({ endpoints: ["http://a:1", 42, { url: 7 }] }, "");
    expect(llm.endpoints).toEqual([{ url: "http://a:1" }]);
    expect(dropped).toBe(2);
  });
});

describe("migrateLlmSettings — der eine globale Schlüssel", () => {
  it("wandert aus data.json als apiKey in jede Zeile und verschwindet aus llm", () => {
    const { llm, migrated } = migrateLlmSettings({ endpoints: ["http://a:1", "http://b:2"], apiKey: "sk-alt" }, "");
    expect(llm.endpoints).toEqual([{ url: "http://a:1", apiKey: "sk-alt" }, { url: "http://b:2", apiKey: "sk-alt" }]);
    expect("apiKey" in llm).toBe(false);
    expect(migrated).toBe(true);
  });

  it("der alte Schlüsselbund-Eintrag gewinnt gegen data.json (wie bis 0.10)", () => {
    const { llm } = migrateLlmSettings({ endpoints: ["http://a:1"], apiKey: "sk-datei" }, "sk-bund");
    expect(llm.endpoints[0]?.apiKey).toBe("sk-bund");
  });

  it("data.json trägt nur den Leerstring (Schlüssel lag im Schlüsselbund) → Bund-Wert in die Zeilen", () => {
    const { llm, migrated } = migrateLlmSettings({ endpoints: ["http://a:1"], apiKey: "" }, "sk-bund");
    expect(llm.endpoints).toEqual([{ url: "http://a:1", apiKey: "sk-bund" }]);
    expect(migrated).toBe(true);
  });

  it("überschreibt weder einen Schlüssel noch einen Schlüsselbund-Verweis der Zeile", () => {
    const { llm } = migrateLlmSettings({
      endpoints: [{ url: "http://a:1", apiKey: "sk-eigen" }, { url: "http://b:2", secretId: "yijing-oracle-ep-b" }, "http://c:3"],
      apiKey: "sk-global",
    }, "");
    expect(llm.endpoints).toEqual([
      { url: "http://a:1", apiKey: "sk-eigen" },
      { url: "http://b:2", secretId: "yijing-oracle-ep-b" },
      { url: "http://c:3", apiKey: "sk-global" },
    ]);
  });

  it("ohne Schlüssel bekommt keine Zeile ein apiKey-Feld", () => {
    const { llm } = migrateLlmSettings({ endpoints: ["http://a:1"] }, "");
    expect(llm.endpoints[0]).toEqual({ url: "http://a:1" });
  });
});

describe("migrateLlmSettings — abgelöste Felder", () => {
  it("nimmt apiKey, activeEndpoint und requestThinking ausdrücklich aus dem Ergebnis", () => {
    const { llm } = migrateLlmSettings({ endpoints: ["http://a:1"], apiKey: "x", activeEndpoint: "http://a:1", requestThinking: true }, "");
    expect("apiKey" in llm).toBe(false);
    expect("activeEndpoint" in llm).toBe(false);
    expect("requestThinking" in llm).toBe(false);
  });

  it("behält eigene Werte und Fremdfelder (Forward-Compat)", () => {
    const { llm } = migrateLlmSettings({ systemPromptDe: "p", zukunft: 1 }, "");
    expect(llm.systemPromptDe).toBe("p");
    expect((llm as unknown as Record<string, unknown>).zukunft).toBe(1);
  });
});

describe("migrateLlmSettings — zweiter Lauf und Sonderfälle (Gegenlese 2026-10-09)", () => {
  it("setzt den globalen Schluessel NICHT erneut ein, wenn die Liste schon migriert ist", () => {
    // Zustand nach dem ersten Lauf: Objekt-Liste, Zeile 2 ohne Schluessel (neu angelegt oder entzogen),
    // der alte Schluesselbund-Eintrag steht weiter da.
    const bereits = { endpoints: [{ url: "http://a:1", id: "x", secretId: "yijing-oracle-ep-x" }, { url: "http://fremd:2" }] };
    const { llm, migrated } = migrateLlmSettings(bereits, "sk-alt-im-bund");
    expect(llm.endpoints[1]).toEqual({ url: "http://fremd:2" });
    expect(migrated).toBe(false);
  });

  it("fehlt `endpoints` ganz, bekommt die Standardzeile keinen Schluessel aus dem alten Eintrag", () => {
    const { llm } = migrateLlmSettings({}, "sk-alt-im-bund");
    expect(llm.endpoints).toEqual(DEFAULT_LLM_SETTINGS.endpoints);
  });

  it("leere Liste plus Klartext-Schluessel in data.json: als strandedKey gemeldet, nicht im Klartext gelassen", () => {
    const { llm, strandedKey, migrated } = migrateLlmSettings({ endpoints: [], apiKey: "sk-nur-in-datei" }, "");
    expect(strandedKey).toBe("sk-nur-in-datei");
    expect("apiKey" in llm).toBe(false);
    expect(migrated).toBe(true);
  });

  it("kein strandedKey, wenn eine Zeile den Schluessel traegt oder der Schluesselbund ihn schon hat", () => {
    expect(migrateLlmSettings({ endpoints: ["http://a:1"], apiKey: "sk" }, "").strandedKey).toBe("");
    expect(migrateLlmSettings({ endpoints: [], apiKey: "sk" }, "sk-bund").strandedKey).toBe("");
  });

});

describe("migrateLlmSettings — globales Modell wandert in die Zeilen (Welle 17)", () => {
  it("erster Lauf: der Altwert geht in jede Zeile ohne Modell, der Schlüssel verschwindet, neu speichern", () => {
    const r = migrateLlmSettings({ model: " alt ", endpoints: [{ url: "http://a:1", id: "a" }, { url: "http://b:2", id: "b", model: "eigen" }] }, "");
    expect(r.llm.endpoints).toEqual([{ url: "http://a:1", id: "a", model: "alt" }, { url: "http://b:2", id: "b", model: "eigen" }]);
    expect("model" in r.llm).toBe(false);
    expect(r.migrated).toBe(true);
  });

  it("die Default-Zeile (fehlende Liste) bekommt den Altwert", () => {
    const { llm } = migrateLlmSettings({ model: "alt" }, "");
    expect(llm.endpoints).toEqual([{ ...DEFAULT_LLM_SETTINGS.endpoints[0], model: "alt" }]);
  });

  it("zweiter Lauf ändert nichts — auch eine vom Nutzer geleerte Zeile bleibt leer", () => {
    const first = migrateLlmSettings({ model: "alt", endpoints: [{ url: "http://a:1", id: "a" }] }, "");
    const geleert = { ...first.llm, endpoints: first.llm.endpoints.map(({ model: _m, ...e }) => e) };
    const second = migrateLlmSettings(geleert, "");
    expect(second.llm.endpoints).toEqual(geleert.endpoints);
    expect(second.migrated).toBe(false);
  });

  it("ein leerer Altwert streicht nur den Schlüssel", () => {
    const r = migrateLlmSettings({ model: "", endpoints: [{ url: "http://a:1", id: "a" }] }, "");
    expect(r.llm.endpoints).toEqual([{ url: "http://a:1", id: "a" }]);
    expect("model" in r.llm).toBe(false);
    expect(r.migrated).toBe(true);
  });
});
