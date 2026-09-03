import { describe, expect, it } from "vitest";
import YijingOraclePlugin from "../src/main";
import { API_KEY_SECRET_ID } from "../src/core/settings/api-key-storage";

// Verdrahtung von loadApiKey/persistApiKey in main.ts: Migration beim Laden, Verteilung beim
// Speichern. Die reine Logik testet api-key-storage.test.ts; hier geht es darum, dass das
// Plugin sie an BEIDEN Stellen aufruft und der Speicherwert dabei unangetastet bleibt —
// die sechs Netzwege lesen `settings.llm.apiKey` aus dem Speicher.

function keychain(): { values: Map<string, string>; storage: object } {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getSecret: (id: string) => values.get(id) ?? null,
      setSecret: (id: string, v: string) => void values.set(id, v),
      listSecrets: () => [...values.keys()],
    },
  };
}

function plugin(app: object, stored: unknown): YijingOraclePlugin & { gespeichert: () => unknown } {
  const p = new YijingOraclePlugin(app as never, { id: "yijing-oracle", name: "Yijing", version: "0.0.0" } as never);
  const daten = { wert: stored, schreibvorgaenge: 0 };
  p.loadData = async () => daten.wert;
  p.saveData = async (d: unknown) => {
    daten.wert = JSON.parse(JSON.stringify(d));
    daten.schreibvorgaenge += 1;
  };
  return Object.assign(p, { gespeichert: () => daten.wert });
}

describe("API-Schluessel: Verdrahtung in main.ts", () => {
  it("migriert einen Altwert aus data.json beim Laden in den Schluesselbund", async () => {
    const kc = keychain();
    const p = plugin({ secretStorage: kc.storage }, { llm: { apiKey: "sk-alt" } });
    await p.onload();
    expect(p.settings.llm.apiKey).toBe("sk-alt");
    expect(kc.values.get(API_KEY_SECRET_ID)).toBe("sk-alt");
    expect((p.gespeichert() as { llm: { apiKey: string } }).llm.apiKey).toBe("");
  });

  it("laedt den Wert aus dem Schluesselbund, wenn data.json leer ist", async () => {
    const kc = keychain();
    kc.values.set(API_KEY_SECRET_ID, "sk-bund");
    const p = plugin({ secretStorage: kc.storage }, { llm: { apiKey: "" } });
    await p.onload();
    expect(p.settings.llm.apiKey).toBe("sk-bund");
  });

  it("beim Speichern bleibt der Wert im Speicher, data.json bekommt einen Leerstring", async () => {
    const kc = keychain();
    const p = plugin({ secretStorage: kc.storage }, null);
    await p.onload();
    p.settings.llm.apiKey = "sk-neu";
    await p.saveSettings();
    expect(p.settings.llm.apiKey).toBe("sk-neu");
    expect(kc.values.get(API_KEY_SECRET_ID)).toBe("sk-neu");
    expect((p.gespeichert() as { llm: { apiKey: string } }).llm.apiKey).toBe("");
  });

  it("ohne Schluesselbund (< 1.11.4) bleibt alles wie bis 0.5.1", async () => {
    const p = plugin({}, { llm: { apiKey: "sk-alt" } });
    await p.onload();
    expect(p.settings.llm.apiKey).toBe("sk-alt");
    await p.saveSettings();
    expect((p.gespeichert() as { llm: { apiKey: string } }).llm.apiKey).toBe("sk-alt");
  });
});
