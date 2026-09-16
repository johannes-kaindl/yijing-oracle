import { describe, expect, it } from "vitest";
import { localEndpointConfigs, resolveLlmEndpoint } from "../src/core/llm/resolve-endpoint";
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from "../src/core/llm/settings-defaults";
import { type EndpointConfig } from "../src/vendor/kit/endpoint_config";
import { type LlmEndpointManagerApi } from "../src/vendor/kit/endpoint-source";

const alwaysReachable = async (): Promise<boolean> => true;
const neverReachable = async (): Promise<boolean> => false;

describe("localEndpointConfigs — lokale Liste als EndpointConfig[]", () => {
  it("uebernimmt die geordnete string[]-Liste und haengt den globalen apiKey an jede Zeile", () => {
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://a:1", "http://b:2"], apiKey: "sk-global" };
    expect(localEndpointConfigs(llm)).toEqual([
      { url: "http://a:1", apiKey: "sk-global" },
      { url: "http://b:2", apiKey: "sk-global" },
    ]);
  });

  it("ohne apiKey traegt kein Eintrag einen Schluessel", () => {
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://a:1"], apiKey: "" };
    expect(localEndpointConfigs(llm)).toEqual([{ url: "http://a:1" }]);
  });

  it("Alt-Datenstand (leere/blanke Zeilen) faellt raus — migrateEndpointList uebernimmt das", () => {
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["", "  ", "http://a:1"], apiKey: "" };
    expect(localEndpointConfigs(llm)).toEqual([{ url: "http://a:1" }]);
  });
});

describe("resolveLlmEndpoint — ohne Manager (Bestandsverhalten)", () => {
  it("liefert den ersten erreichbaren lokalen Endpunkt mit dem globalen Modell", async () => {
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://a:1"], apiKey: "", model: "llama" };
    const r = await resolveLlmEndpoint(llm, null, alwaysReachable, "yijing-oracle");
    expect(r.kind).toBe("local");
    expect(r.config?.url).toBe("http://a:1");
    expect(r.model).toBe("llama");
  });

  it("kein erreichbarer Endpunkt -> config null, kein Wurf", async () => {
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://a:1"] };
    const r = await resolveLlmEndpoint(llm, null, neverReachable, "yijing-oracle");
    expect(r.config).toBeNull();
    expect(r.model).toBe("");
  });

  it("choice.model gewinnt gegen das globale Modell (lokaler Pfad)", async () => {
    const llm: LlmSettings = {
      ...DEFAULT_LLM_SETTINGS,
      endpoints: ["http://a:1"],
      model: "llama",
      choice: { model: "mistral" },
    };
    const r = await resolveLlmEndpoint(llm, null, alwaysReachable, "yijing-oracle");
    expect(r.model).toBe("mistral");
  });
});

/** Fake-Manager nach dem Vertrag von `LlmEndpointManagerApi` — reicht fuer die drei hier
 *  gebrauchten Methoden, die uebrigen sind No-ops (Vorlage: lingotuner GUI-Smoke Abschnitt M,
 *  hier ohne HTTP — reine Unit-Ebene). */
function fakeManager(opts: {
  resolve: LlmEndpointManagerApi["resolve"];
  materialize?: LlmEndpointManagerApi["materialize"];
}): LlmEndpointManagerApi {
  return {
    version: 1,
    list: () => [],
    get: () => null,
    resolve: opts.resolve,
    materialize: opts.materialize ?? (async () => ({ error: "not-found" })),
    models: async () => [],
    importEndpoints: async () => ({ added: [], merged: [], skipped: [] }),
    on: () => () => {},
  };
}

describe("resolveLlmEndpoint — mit Manager (kein lokaler Rueckfall bei Fehlschlag)", () => {
  it("nutzt den vom Manager gelieferten Endpunkt + defaultModel", async () => {
    const cfg: EndpointConfig = { url: "http://manager:1234" };
    const manager = fakeManager({ resolve: async () => ({ id: "e1", config: cfg, label: "M", defaultModel: "m1" }) });
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://local:1"], model: "local-model" };
    const r = await resolveLlmEndpoint(llm, manager, alwaysReachable, "yijing-oracle");
    expect(r.kind).toBe("manager");
    expect(r.config?.url).toBe("http://manager:1234");
    expect(r.model).toBe("m1");
  });

  it("choice.model gewinnt gegen den Endpunkt-Default (der teuerste Fehler aus lingotuner C1)", async () => {
    const cfg: EndpointConfig = { url: "http://manager:1234" };
    const manager = fakeManager({ resolve: async () => ({ id: "e1", config: cfg, label: "M", defaultModel: "m-default" }) });
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, choice: { model: "m-chosen" } };
    const r = await resolveLlmEndpoint(llm, manager, alwaysReachable, "yijing-oracle");
    expect(r.model).toBe("m-chosen");
  });

  it("Manager ohne Endpunkt (secret-missing): config null, reason gesetzt, KEIN lokaler Rueckfall", async () => {
    const manager = fakeManager({ resolve: async () => ({ error: "secret-missing" }) });
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://local:1"] };
    const r = await resolveLlmEndpoint(llm, manager, alwaysReachable, "yijing-oracle");
    expect(r.kind).toBe("manager");
    expect(r.config).toBeNull();
    expect(r.reason).toBe("secret-missing");
  });

  it("verwaiste choice.endpointId faellt automatisch auf resolve() zurueck, Grund bleibt sichtbar", async () => {
    const cfg: EndpointConfig = { url: "http://manager:1234" };
    const manager = fakeManager({
      materialize: async () => ({ error: "not-found" }),
      resolve: async () => ({ id: "e1", config: cfg, label: "M", defaultModel: "m1" }),
    });
    const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, choice: { endpointId: "geloescht" } };
    const r = await resolveLlmEndpoint(llm, manager, alwaysReachable, "yijing-oracle");
    expect(r.config?.url).toBe("http://manager:1234");
    expect(r.reason).toBe("not-found");
  });
});
