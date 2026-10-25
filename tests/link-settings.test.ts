import { describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import { makeFakeEl, ToggleComponent } from "./vendor/kit/obsidian-mock";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/core/settings";
import { linkRows } from "../src/obsidian/settings/link-section";
import { type SectionCtx } from "../src/obsidian/settings/section-ctx";

// Der Linkschutz der Deutung ist im Default AUS (obsidian-kit 0.70.0): ein Nutzer, der nichts anfasst, bekommt weder obsidian://-Links
// noch lokale Bilder in einer Antwort. Geprüft: die Defaults, dass die zwei Zeilen im Tab stehen und dass jeder Schalter in sein
// eigenes Feld schreibt und speichert. Dass der Wächter im Panel wirkt, misst der GUI-Smoke (K-a bis K-c).

type Row = { name?: string; render?: (s: Setting) => unknown };

function ctxOf(settings: PluginSettings) {
  const save = vi.fn();
  const ctx = { host: { settings, saveSettings: async () => undefined }, save } as unknown as SectionCtx;
  return { ctx, save };
}

/** Zeichnet die Zeile in eine Setting-Attrappe und liefert ihren Schalter. */
function schalter(row: Row): ToggleComponent {
  const setting = new Setting(makeFakeEl());
  row.render?.(setting);
  const toggle = (setting as unknown as { components: unknown[] }).components.find((c) => c instanceof ToggleComponent);
  expect(toggle, `Zeile ${String(row.name)} hat keinen Schalter`).toBeTruthy();
  return toggle as ToggleComponent;
}

describe("Linkschutz der Deutung", () => {
  it("beide Schalter sind im Default aus", () => {
    expect(DEFAULT_SETTINGS.allowObsidianLinks).toBe(false);
    expect(DEFAULT_SETTINGS.allowLocalImages).toBe(false);
  });

  it("der Tab hat zwei Zeilen mit den Kit-Texten", () => {
    const rows = linkRows(ctxOf(structuredClone(DEFAULT_SETTINGS)).ctx) as unknown as Row[];
    expect(rows.map((r) => r.name)).toEqual([expect.stringMatching(/obsidian/i), expect.stringMatching(/image|bild/i)]);
  });

  it("die Zeilen zeigen den gespeicherten Zustand", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.allowLocalImages = true;
    const [links, bilder] = linkRows(ctxOf(settings).ctx) as unknown as Row[];
    expect(schalter(links!).getValue()).toBe(false);
    expect(schalter(bilder!).getValue()).toBe(true);
  });

  it("jeder Schalter schreibt in sein eigenes Feld und speichert einmal", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const { ctx, save } = ctxOf(settings);
    const [links, bilder] = linkRows(ctx) as unknown as Row[];
    schalter(links!).onChangeCB?.(true);
    expect(settings.allowObsidianLinks).toBe(true);
    expect(settings.allowLocalImages).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    schalter(bilder!).onChangeCB?.(true);
    expect(settings.allowLocalImages).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    schalter(links!).onChangeCB?.(false);
    expect(settings.allowObsidianLinks).toBe(false);
    expect(settings.allowLocalImages).toBe(true);
  });
});
