import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { obsidianSecretStore } from "../src/vendor/kit-obsidian/secrets";

/** Attrappe fuer `app.secretStorage` — das Kit-Mock kennt den Schluesselbund nicht. */
function fakeApp(opts: { persist: boolean; withStorage?: boolean }): App {
  const values = new Map<string, string>();
  const secretStorage = {
    getSecret: (id: string) => values.get(id) ?? null,
    setSecret: (id: string, v: string) => {
      if (opts.persist) values.set(id, v);
    },
    listSecrets: () => [...values.keys()],
  };
  return (opts.withStorage === false ? {} : { secretStorage }) as unknown as App;
}

describe("obsidianSecretStore", () => {
  it("liefert null, wenn Obsidian keinen Schluesselbund hat (< 1.11.4)", () => {
    expect(obsidianSecretStore(fakeApp({ persist: true, withStorage: false }))).toBeNull();
  });

  it("schreibt und liest zurueck", () => {
    const store = obsidianSecretStore(fakeApp({ persist: true }));
    store?.set("x", "geheim");
    expect(store?.get("x")).toBe("geheim");
  });

  it("wirft, wenn der Schluesselbund den Wert stillschweigend verwirft", () => {
    const store = obsidianSecretStore(fakeApp({ persist: false }));
    expect(() => store?.set("x", "geheim")).toThrow(/did not persist/);
  });

  it("streift Zeilenumbrueche vom Rand — der typische Clipboard-Rest", () => {
    const store = obsidianSecretStore(fakeApp({ persist: true }));
    store?.set("x", "sk-1\n");
    expect(store?.get("x")).toBe("sk-1");
  });

  it("has(): false ohne Eintrag, true nach set()", () => {
    const store = obsidianSecretStore(fakeApp({ persist: true }));
    expect(store?.has("x")).toBe(false);
    store?.set("x", "geheim");
    expect(store?.has("x")).toBe(true);
  });

  it("delete(): loescht ueber einen Leerstring-Schreibvorgang, has() faellt danach auf false", () => {
    const store = obsidianSecretStore(fakeApp({ persist: true }));
    store?.set("x", "geheim");
    store?.delete("x");
    expect(store?.get("x")).toBeNull();
    expect(store?.has("x")).toBe(false);
  });
});
