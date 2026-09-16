import { describe, expect, it } from "vitest";
import { Setting } from "obsidian";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";
import { llmRows } from "../src/obsidian/settings/llm-section";
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from "../src/core/llm/settings-defaults";
import { type SectionCtx } from "../src/obsidian/settings/section-ctx";
import { LLM_ENDPOINT_MANAGER_PLUGIN_ID, type LlmEndpointManagerApi } from "../src/vendor/kit/endpoint-source";

// Manager-first: bei installiertem LLM Endpoint Manager zeigt die Endpunkt-Zeile den
// Kit-Baustein (buildEndpointSourceSection) statt des lokalen Zeilen-Editors — und
// umgekehrt faellt sie ohne Manager auf den lokalen Editor zurueck (renderLocalList).
// Item B6/B11 dieses Auftrags: hier strukturell geprueft, nicht nur behauptet.

function fakeManagerApi(): LlmEndpointManagerApi {
  return {
    version: 1,
    list: () => [],
    get: () => null,
    resolve: async () => ({ error: "no-endpoint" }),
    materialize: async () => ({ error: "not-found" }),
    models: async () => [],
    importEndpoints: async () => ({ added: [], merged: [], skipped: [] }),
    on: () => () => {},
  };
}

function fakeCtx(withManager: boolean): SectionCtx {
  const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, endpoints: ["http://a:1"], apiKey: "" };
  const settings = { llm } as unknown as SectionCtx["host"]["settings"];
  const app = {
    plugins: {
      plugins: withManager ? { [LLM_ENDPOINT_MANAGER_PLUGIN_ID]: { api: fakeManagerApi() } } : {},
    },
  } as unknown as SectionCtx["app"];
  return {
    host: { settings, saveSettings: async () => {}, probeEndpoint: async () => ({ kind: "ok" }) as never } as SectionCtx["host"],
    app,
    write: () => {},
    save: () => {},
    rerender: () => {},
  } as unknown as SectionCtx;
}

/** Sammelt alle `Setting`-Instanzen, die unter `containerEl` gezeichnet wurden — die Kit-
 *  Sektion haengt ihre Zeilen ueber `new Setting(opts.containerEl)`, das Mock verknuepft die
 *  Instanz am erzeugten `settingEl` (`__setting`). */
function settingsIn(containerEl: any): { nameValue: string }[] {
  return (containerEl.children ?? []).map((c: any) => c.__setting).filter(Boolean);
}

function endpointsRow(ctx: SectionCtx): { render?: (s: Setting) => unknown } {
  const rows = llmRows(ctx) as { name?: string; render?: (s: Setting) => unknown }[];
  // t() faellt ohne registerI18n() auf den rohen Schluessel zurueck — wie in
  // tests/api-key-field.test.ts wird deshalb ueber den erkennbaren Teil des Schluessels
  // gesucht, nicht ueber den uebersetzten Text.
  const row = rows.find((r) => typeof r.name === "string" && /llmEndpoints/i.test(r.name));
  expect(row, "Endpunkte-Zeile nicht gefunden").toBeTruthy();
  return row as { render?: (s: Setting) => unknown };
}

describe("Endpunkte-Zeile: Manager-first", () => {
  it("ohne Manager: lokaler Zeilen-Editor (buildEndpointList) zeichnet in den Body-Container", () => {
    const ctx = fakeCtx(false);
    const setting = new Setting(makeFakeEl());
    endpointsRow(ctx).render?.(setting);
    // buildEndpointList zeichnet u.a. einen "Add an endpoint…"-Knopf; der Kit-Baustein
    // (Manager-Fall) zeichnet stattdessen einen "managed"-Kopf mit Dropdown.
    // settingBodyHost() liefert setting.settingEl selbst (geleert) als Body-Container.
    const rows = settingsIn(setting.settingEl);
    expect(rows.some((s) => s.nameValue === "src.managed")).toBe(false); // kein "managed"-Kopf
  });

  it("mit installiertem Manager: buildEndpointSourceSection zeichnet den managed-Kopf", () => {
    const ctx = fakeCtx(true);
    const setting = new Setting(makeFakeEl());
    endpointsRow(ctx).render?.(setting);
    const rows = settingsIn(setting.settingEl);
    expect(rows.some((s) => s.nameValue === "src.managed")).toBe(true);
  });
});
