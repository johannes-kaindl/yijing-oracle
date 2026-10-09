import { describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";
import { llmRows } from "../src/obsidian/settings/llm-section";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { type SectionCtx } from "../src/obsidian/settings/section-ctx";

// Die Zeile „Endpunkte“ ist seit der Verbindung ein Host fuer deren renderSettings: Quelle (Manager
// oder lokal), Endpunkt-Liste mit Schluessel je Zeile und der Abschnitt „Anfrage“ kommen aus dem Kit.
// Strukturell geprueft: die Zeile gibt der Verbindung einen EIGENEN Host (nicht den Tab) und bleibt
// ueber die Begriffe auffindbar, unter denen das maskierte Schluesselfeld und „Anfrage“ gesucht werden.

function fakeCtx(llm: Record<string, unknown>): SectionCtx {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    host: { settings, saveSettings: async () => {} },
    llm,
    app: { plugins: { plugins: {} } },
    write: () => {},
    save: () => {},
    rerender: () => {},
  } as unknown as SectionCtx;
}

type Row = { name?: string; aliases?: string[]; render?: (s: Setting) => unknown };
const rowsOf = (ctx: SectionCtx): Row[] => llmRows(ctx) as unknown as Row[];
/** t() faellt ohne registerI18n() auf den rohen Schluessel zurueck — gesucht wird ueber dessen erkennbaren Teil. */
const find = (rows: Row[], re: RegExp): Row => {
  const row = rows.find((r) => typeof r.name === "string" && re.test(r.name));
  expect(row, `Zeile ${String(re)} nicht gefunden`).toBeTruthy();
  return row as Row;
};

describe("Zeile „Endpunkte“ — Host der Kit-Verbindung", () => {
  it("ruft renderSettings mit der Zeile selbst als Host und der Sprache des Plugins", () => {
    const renderSettings = vi.fn();
    const ctx = fakeCtx({ renderSettings });
    const setting = new Setting(makeFakeEl());
    find(rowsOf(ctx), /llmEndpoints/i).render?.(setting);
    expect(renderSettings).toHaveBeenCalledTimes(1);
    expect(renderSettings.mock.calls[0]![0]).toBe(setting.settingEl);
    expect(renderSettings.mock.calls[0]![1]).toMatchObject({ lang: expect.stringMatching(/^(de|en)$/) });
  });

  it("ist ueber Schluessel- und Anfrage-Begriffe auffindbar (Hatch ohne lesbaren Wert)", () => {
    const aliases = find(rowsOf(fakeCtx({})), /llmEndpoints/i).aliases ?? [];
    for (const begriff of ["token", "api key", "bearer", "temperature", "thinking", "sampling"]) {
      expect(aliases, begriff).toContain(begriff);
    }
  });

  it("zeichnet keine eigene Schluessel-Zeile mehr — der Schluessel gehoert zur Endpunkt-Zeile", () => {
    const namen = rowsOf(fakeCtx({})).map((r) => r.name ?? "");
    expect(namen.some((n) => /llmApiKey/i.test(n))).toBe(false);
  });
});
