// Die Modellzeile des Orakel-Panels: die Kit-Zeile (`buildModelBar`) für die Aufgabe „Deutung“ — Modell-Dropdown des aktiven
// Endpunkts, Automatisch, Neu laden, „Anderer Endpunkt …“ und die Denk-Steuerung in derselben Zeile. Das Panel zeichnet sich bei
// jedem Anstrich neu (`root.empty()`), die Zeile hält aber Zustand (Liste, Ladezustand, Ansage): {@link ModelRowSlot} gibt die alte
// Zeile vor dem Neuzeichnen frei (`destroy()`) und baut genau eine neue. Alles, was die Zeile liest, kommt über den Wirt (immer der
// letzte Stand, nie der vom Bau).
import type { App } from "obsidian";
import { getLang, t } from "../vendor/kit/i18n";
import { onLevelFor, thinkingFor, withThinkingLevel, type ThinkingLevel } from "../vendor/kit/sampling-profiles";
import { buildModelBar, type ModelBar } from "../vendor/kit-obsidian/model-bar";
import { thinkingOffTexts } from "../vendor/kit-obsidian/thinking-control";
import type { LlmConnection } from "../vendor/kit-obsidian/llm-connection";
import { MODE } from "../core/llm/request-settings";
import type { PluginSettings } from "../core/settings";

export interface ModelRowHost {
  settings: PluginSettings;
  llm: LlmConnection;
  saveSettings(): Promise<void>;
}

/** Texte der Denk-Steuerung; die Stufen und der Knopf kommen aus `src/i18n/strings.ts`, „aus nicht möglich“ aus dem Kit. */
function thinkingStrings() {
  return {
    // `button` wird nicht gerufen, wo „aus“ nicht möglich ist (Gemma 4 auf LM Studio, Claude): dort steht die Beschriftung des Kits.
    button: (level: ThinkingLevel): string => (level !== "off" ? t("chat.think.on", t(`request.level.${level}`)) : t("chat.think.off")),
    offNotPossible: thinkingOffTexts(getLang()),
    level: (l: ThinkingLevel): string => t(`request.level.${l}`),
    pickerLabel: t("request.thinkingLevel"),
  };
}

/** Wodurch sich der Endpunkt ändert, an dem die Modell-Liste hängt: die Wahl und die Adressen der Zeilen. Ändert sich das außerhalb der
 *  Zeile (Einstellungen, Manager), lädt {@link ModelRowSlot.sync} die Liste neu. */
function listKey(host: ModelRowHost): string {
  return JSON.stringify([host.settings.llm.choice ?? null, host.settings.llm.endpoints.map((e) => e.url)]);
}

/** Hält die EINE Modellzeile des Panels. */
export class ModelRowSlot {
  private bar: ModelBar | null = null;
  private seenKey = "";

  /** `busy`: eine Deutung startet oder läuft (die Zeile ist gesperrt). */
  constructor(private readonly app: App, private readonly host: ModelRowHost, private readonly busy: () => boolean) {}

  /** Gibt die vorige Zeile frei und baut eine neue in `parent` (vor jedem Neuzeichnen des Panels). */
  mount(parent: HTMLElement): void {
    this.destroy();
    const host = this.host;
    this.seenKey = listKey(host);
    this.bar = buildModelBar({
      app: this.app,
      containerEl: parent,
      llm: host.llm,
      label: t("view.modelLabel"),
      strings: { lang: getLang() },
      thinking: {
        family: () => host.llm.source().family,
        backend: () => host.llm.source().backend,
        current: () => thinkingFor(host.settings.request, MODE),
        onLevel: () => onLevelFor(host.settings.request, MODE),
        setLevel: async (level) => {
          host.settings.request = withThinkingLevel(host.settings.request, MODE, level);
          await host.saveSettings();
        },
        levelPicker: () => host.settings.request.levelPickerInChat,
        strings: thinkingStrings(),
      },
      disabled: () => this.busy(),
      onError: (e) => { console.error("[yijing-oracle]", e); },
    });
  }

  /** Zeichnet die Zeile aus dem Zustand neu (Sperre, Modell, Denkstufe) — nach `starting = true` und im `finally`, und wenn sich
   *  außerhalb etwas ändert. Hat sich der Endpunkt geändert, lädt sie auch die Liste neu. */
  sync(): void {
    const bar = this.bar;
    if (bar === null) return;
    const key = listKey(this.host);
    if (key !== this.seenKey) {
      this.seenKey = key;
      void bar.refresh();
    }
    bar.update();
  }

  /** Lädt die Modell-Liste neu (der Endpunkt-Manager wurde installiert oder entfernt). */
  reload(): void {
    void this.bar?.refresh();
  }

  destroy(): void {
    this.bar?.destroy();
    this.bar = null;
  }
}
