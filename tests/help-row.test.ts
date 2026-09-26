// Hilfe-Zeile (UI-STANDARD §8): erstes Element der Settings-Definitionen in beiden Renderpfaden,
// beide URLs dieses Repos.
import { beforeAll, describe, expect, it, vi } from "vitest";

const gezeichnet: { name?: string }[][] = [];
vi.mock("../src/vendor/kit-obsidian/settings_walker", () => ({
  renderSettingDefinitions: (_el: unknown, items: { name?: string }[]) => { gezeichnet.push(items); return () => {}; },
  refreshSettingsTab: () => {},
}));

import { SettingsTab } from "../src/obsidian/settings/index";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { registerI18n } from "../src/i18n/strings";
import { setLang } from "../src/vendor/kit/i18n";

function fakeSetting() {
  const calls = { buttons: [] as { text: string; click: () => void }[], extra: [] as { icon: string; tip: string; click: () => void }[] };
  const setting: Record<string, unknown> = {};
  setting.setName = () => setting;
  setting.setDesc = () => setting;
  setting.addButton = (cb: (b: unknown) => void) => {
    const rec = { text: "", click: () => {} }; const b: Record<string, unknown> = {};
    b.setButtonText = (x: string) => { rec.text = x; return b; };
    b.onClick = (f: () => void) => { rec.click = f; return b; };
    cb(b); calls.buttons.push(rec); return setting;
  };
  setting.addExtraButton = (cb: (b: unknown) => void) => {
    const rec = { icon: "", tip: "", click: () => {} }; const b: Record<string, unknown> = {};
    b.setIcon = (x: string) => { rec.icon = x; return b; };
    b.setTooltip = (x: string) => { rec.tip = x; return b; };
    b.onClick = (f: () => void) => { rec.click = f; return b; };
    cb(b); calls.extra.push(rec); return setting;
  };
  return { setting, calls };
}

describe("Hilfe-Zeile in den Settings", () => {
  beforeAll(() => { registerI18n(); setLang("en"); });
  const host = { settings: { ...DEFAULT_SETTINGS }, saveSettings: async () => {}, probeEndpoint: async () => ({}) } as never;
  const tab = () => new SettingsTab({} as never, {} as never, host);

  it("ist das ERSTE Element von getSettingDefinitions() (Host >= 1.13)", () => {
    const defs = tab().getSettingDefinitions() as unknown as { name?: string; type?: string; render?: unknown }[];
    expect(defs[0]!.type).toBeUndefined();
    expect(defs[0]!.name).toBe("Help");
    expect(typeof defs[0]!.render).toBe("function");
    expect(defs.filter((d) => d.name === "Help")).toHaveLength(1);
  });

  it("steht auch im Fallback (Host < 1.13) an erster Stelle der gezeichneten Liste", () => {
    gezeichnet.length = 0;
    tab().display();
    expect(gezeichnet[0]![0]!.name).toBe("Help");
  });

  it("oeffnet Doku-Index und Issues dieses Repos", () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const first = tab().getSettingDefinitions()[0] as unknown as { render: (s: unknown) => void };
    const { setting, calls } = fakeSetting();
    first.render(setting);
    expect(calls.buttons.map((b) => b.text)).toEqual(["Open documentation"]);
    expect(calls.extra.map((b) => [b.icon, b.tip])).toEqual([["bug", "Report an issue"]]);
    calls.buttons[0]!.click(); calls.extra[0]!.click();
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/README.md",
      "https://github.com/johannes-kaindl/yijing-oracle/issues",
    ]);
    vi.unstubAllGlobals();
  });

  it("hat deutsche Texte", () => {
    setLang("de");
    expect((tab().getSettingDefinitions()[0] as unknown as { name: string }).name).toBe("Hilfe");
    setLang("en");
  });
});
