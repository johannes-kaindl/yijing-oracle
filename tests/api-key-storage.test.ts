import { describe, expect, it } from "vitest";
import { API_KEY_SECRET_ID, loadApiKey, persistApiKey, type SecretStore } from "../src/core/settings/api-key-storage";

// Der API-Schluessel lag bis 2026-09-03 in `llm.apiKey` und damit in data.json — im Klartext,
// in einer Datei im Vault, die jeder Sync (Obsidian Sync, iCloud, git) mitnimmt. Obsidians
// SecretStorage (seit 1.11.4) haelt ihn OS-verschluesselt und je Geraet. Der Floor dieses
// Plugins ist 1.8.7, deshalb zweigleisig: mit Schluesselbund wandert der Wert dorthin und
// data.json bleibt leer; ohne Schluesselbund bleibt alles wie zuvor.

class MemoryStore implements SecretStore {
  readonly values = new Map<string, string>();
  get(id: string): string | null {
    return this.values.get(id) ?? null;
  }
  set(id: string, value: string): void {
    this.values.set(id, value);
  }
  has(id: string): boolean {
    return (this.values.get(id) ?? "") !== "";
  }
  delete(id: string): void {
    this.values.delete(id);
  }
}

/** Ein Store, der Schreibvorgaenge stillschweigend verwirft — z. B. eine Plattform ohne
 *  Keychain-Zugriff. Das Rueckleseproblem faellt dann im Store selbst auf (Wurf). */
class LeakyStore implements SecretStore {
  get(): string | null {
    return null;
  }
  set(id: string): void {
    throw new Error(`SecretStorage did not persist ${id}`);
  }
  has(): boolean {
    return false;
  }
  delete(): void {
    // no-op
  }
}

describe("loadApiKey — welcher Wert gilt beim Laden", () => {
  it("ohne Schluesselbund gilt der Wert aus data.json, nichts zu migrieren", () => {
    expect(loadApiKey("sk-alt", null)).toEqual({ apiKey: "sk-alt", migrate: false });
  });

  it("ein Altwert in data.json wird zur Migration angemeldet", () => {
    const store = new MemoryStore();
    expect(loadApiKey("sk-alt", store)).toEqual({ apiKey: "sk-alt", migrate: true });
  });

  it("der Schluesselbund gewinnt, wenn beide gefuellt sind — data.json wird trotzdem bereinigt", () => {
    const store = new MemoryStore();
    store.set(API_KEY_SECRET_ID, "sk-bund");
    expect(loadApiKey("sk-alt", store)).toEqual({ apiKey: "sk-bund", migrate: true });
  });

  it("nur der Schluesselbund gefuellt: kein Schreibvorgang noetig", () => {
    const store = new MemoryStore();
    store.set(API_KEY_SECRET_ID, "sk-bund");
    expect(loadApiKey("", store)).toEqual({ apiKey: "sk-bund", migrate: false });
  });

  it("beide leer: leer, nichts zu tun", () => {
    expect(loadApiKey("", new MemoryStore())).toEqual({ apiKey: "", migrate: false });
  });
});

describe("persistApiKey — was in data.json landet", () => {
  it("ohne Schluesselbund bleibt der Schluessel in data.json", () => {
    expect(persistApiKey("sk-1", null, () => {})).toBe("sk-1");
  });

  it("mit Schluesselbund landet der Wert dort und data.json bekommt einen Leerstring", () => {
    const store = new MemoryStore();
    expect(persistApiKey("sk-1", store, () => {})).toBe("");
    expect(store.get(API_KEY_SECRET_ID)).toBe("sk-1");
  });

  it("ein geleertes Feld leert auch den Schluesselbund-Eintrag", () => {
    const store = new MemoryStore();
    store.set(API_KEY_SECRET_ID, "sk-1");
    expect(persistApiKey("", store, () => {})).toBe("");
    expect(store.get(API_KEY_SECRET_ID)).toBe("");
  });

  it("verwirft der Schluesselbund den Wert, bleibt er in data.json — mit Warnung, ohne Wurf", () => {
    const warnungen: string[] = [];
    expect(persistApiKey("sk-1", new LeakyStore(), (m) => warnungen.push(m))).toBe("sk-1");
    expect(warnungen).toHaveLength(1);
    expect(warnungen[0]).toMatch(/did not persist/);
  });
});
