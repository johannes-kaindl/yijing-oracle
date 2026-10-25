import { describe, expect, it, vi } from "vitest";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";
import { ModelRowSlot, type ModelRowHost } from "../src/obsidian/model-row";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/core/settings";
import { MODE } from "../src/core/llm/request-settings";
import { onLevelFor, thinkingFor } from "../src/vendor/kit/sampling-profiles";

// Die Zeile ist die des Kits; geprüft wird, was dieses Plugin dazu sagt: genau EINE Zeile trotz Voll-Neuzeichnen, die Sperre während
// einer Deutung, der Wechsel über `llm.setModel`, die Denkstufe im Modus `creative`. Gegen das Kit-Fake-DOM (ohne CSS-Kaskade): die
// Anordnung im echten Panel misst der GUI-Smoke.

interface FakeEl {
  children: FakeEl[]; disabled?: boolean; value: string;
  querySelector(sel: string): FakeEl | null; querySelectorAll(sel: string): FakeEl[];
  getAttribute(k: string): string | null; dispatchEvent(e: unknown): boolean;
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const flush = async (): Promise<void> => { await tick(); await tick(); };

function setup() {
  const settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
  const state = { model: "m1", list: ["m1", "m2", "m3"], family: null as string | null };
  const llm = {
    models: vi.fn(async () => ({ models: [...state.list], reachable: true })),
    setModel: vi.fn(async (m: string) => { state.model = m; }),
    modelInUse: () => state.model,
    source: () => ({ family: state.family, familySource: "none", backend: "unknown", backendSource: "none", model: state.model, sentModel: state.model }),
  };
  const saveSettings = vi.fn(async () => undefined);
  const host = { settings, llm, saveSettings } as unknown as ModelRowHost;
  const busy = { value: false };
  const slot = new ModelRowSlot({ plugins: { plugins: {} } } as never, host, () => busy.value);
  const parent = makeFakeEl() as unknown as FakeEl & HTMLElement;
  return { settings, state, llm, saveSettings, busy, slot, parent };
}
const bars = (el: FakeEl): FakeEl[] => el.querySelectorAll(".okit-model-bar");
const select = (el: FakeEl): FakeEl => el.querySelector(".okit-model-bar-select") as FakeEl;

describe("ModelRowSlot", () => {
  it("(a) zeichnet genau eine Zeile, auch wenn das Panel sich bei jedem Anstrich neu zeichnet", async () => {
    const s = setup();
    for (let i = 0; i < 5; i++) {
      // Das Panel leert sich (`root.empty()`) und baut die Zeile neu — die alte wird vorher freigegeben.
      s.slot.mount(s.parent);
      await flush();
    }
    expect(bars(s.parent)).toHaveLength(1);
  });

  it("(a) destroy() entfernt die Zeile; ein Ergebnis, das danach eintrifft, zeichnet nichts mehr", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    s.slot.destroy();
    await flush();
    expect(bars(s.parent)).toHaveLength(0);
  });

  it("(b) gesperrt, solange eine Deutung startet oder läuft; sonst frei", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    expect(select(s.parent).disabled).toBe(false);
    s.busy.value = true;
    s.slot.sync();
    expect(select(s.parent).disabled).toBe(true);
    s.busy.value = false;
    s.slot.sync();
    expect(select(s.parent).disabled).toBe(false);
  });

  it("(b) die Sperre kommt auch bei einem Neubau mit, wenn schon gesperrt wird", async () => {
    const s = setup();
    s.busy.value = true;
    s.slot.mount(s.parent);
    await flush();
    expect(select(s.parent).disabled).toBe(true);
  });

  it("(c) ein Wechsel ruft llm.setModel mit dem gewählten Modell; die Zeile zeigt es danach", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    const dd = select(s.parent);
    dd.value = "m3";
    dd.dispatchEvent({ type: "change" });
    await flush();
    expect(s.llm.setModel).toHaveBeenCalledWith("m3");
    expect(select(s.parent).value).toBe("m3");
  });

  it("(d) die Denk-Steuerung steht IN der Zeile, nicht daneben", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    expect(s.parent.querySelectorAll(".okit-thinking-control")).toHaveLength(1);
    expect(bars(s.parent)[0]?.querySelectorAll(".okit-thinking-control")).toHaveLength(1);
  });

  it("(d) der Denk-Knopf schreibt die Stufe in den Modus creative, merkt die letzte Einschalt-Stufe und speichert je Klick einmal", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    const before = thinkingFor(s.settings.request, MODE);
    expect(before).not.toBe("off");   // Profilvorgabe des Modus: Denken an
    const toggle = (): FakeEl => s.parent.querySelector(".okit-thinking-toggle") as FakeEl;
    toggle().dispatchEvent({ type: "click" });
    await flush();
    expect(thinkingFor(s.settings.request, MODE)).toBe("off");
    expect(onLevelFor(s.settings.request, MODE)).toBe(before);   // „aus“ lässt die Einschalt-Stufe stehen
    expect(s.saveSettings).toHaveBeenCalledTimes(1);
    toggle().dispatchEvent({ type: "click" });
    await flush();
    expect(thinkingFor(s.settings.request, MODE)).toBe(before);   // wieder an: die gemerkte Stufe
    expect(s.saveSettings).toHaveBeenCalledTimes(2);
    // andere Modi bleiben unberührt
    expect(Object.keys(s.settings.request.thinking).filter((m) => m !== MODE)).toEqual(Object.keys(DEFAULT_SETTINGS.request.thinking).filter((m) => m !== MODE));
  });

  it("(e) sync() zeichnet ein außerhalb geändertes Modell in die Zeile, ohne Neubau", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    const first = bars(s.parent)[0];
    s.state.model = "m2";
    s.slot.sync();
    expect(select(s.parent).value).toBe("m2");
    expect(bars(s.parent)[0]).toBe(first);
  });

  it("(e) sync() lädt die Liste neu, wenn sich der Endpunkt geändert hat, und nur dann", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    expect(s.llm.models).toHaveBeenCalledTimes(1);
    s.slot.sync(); s.slot.sync();
    await flush();
    expect(s.llm.models).toHaveBeenCalledTimes(1);
    s.settings.llm.choice = { kind: "endpoint", id: "x" } as never;
    s.slot.sync();
    await flush();
    expect(s.llm.models).toHaveBeenCalledTimes(2);
    s.slot.sync();
    await flush();
    expect(s.llm.models).toHaveBeenCalledTimes(2);
  });

  it("reload() lädt die Liste neu (Manager installiert oder entfernt)", async () => {
    const s = setup();
    s.slot.mount(s.parent);
    await flush();
    s.slot.reload();
    await flush();
    expect(s.llm.models).toHaveBeenCalledTimes(2);
  });
});
