// Settings-Tab: fünf Sektionen. Dünn — jede Sektion rendert in ihrer eigenen
// Datei, die Entscheidungslogik liegt pure in core/settings/.
//
// Die Sektionen waren bis 2026-07-20 einklappbar (vendored kit-obsidian/collapsible).
// Aufgegeben, weil einklappbare Sektionen und die deklarative Settings-API
// (getSettingDefinitions, Obsidian 1.13+) sich ausschließen: SettingDefinitionGroup
// kennt kein Collapse. Ohne Migration erscheinen die Einstellungen ab 1.13 nicht in
// Obsidians Settings-Suche — die das Auffinden besser löst als Zuklappen. Sektionen
// jetzt über setHeading() (PROF-OBS-06).
import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { type SettingsHost } from "../../core/settings";
import {
  renderGeneralSection,
  renderNoteContentSection,
  renderNoteStorageSection,
} from "./note-section";
import { renderLlmSection } from "./llm-section";
import { renderImageSection } from "./image-section";

// Import-Pfade der Bestands-Aufrufer (main.ts, view.ts) unverändert halten.
export { DEFAULT_SETTINGS, resolveReadingLang } from "../../core/settings";
export type { OutputMode, PluginSettings, SettingsHost } from "../../core/settings";
export { DEFAULT_LLM_SETTINGS } from "../../core/llm/settings-defaults";
export type { LlmSettings } from "../../core/llm/settings-defaults";

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const ctx = {
      host: this.host,
      rerender: () => {
        this.display();
      },
    };

    /* Sektions-Überschrift; die Sektion rendert danach flach in denselben Container.
       Vorher lieferte collapsibleSection() einen eigenen Body — die Render-Funktionen
       nehmen unverändert ein HTMLElement entgegen, deshalb bleibt ihre Signatur gleich. */
    const section = (title: string): HTMLElement => {
      new Setting(containerEl).setName(title).setHeading();
      return containerEl;
    };

    renderGeneralSection(section(t("set.secGeneral")), ctx);
    renderNoteStorageSection(section(t("set.secNoteStorage")), ctx);
    renderNoteContentSection(section(t("set.secNoteContent")), ctx);
    renderLlmSection(section(t("set.llmHead")), ctx);
    renderImageSection(section(t("set.imgHead")), ctx);
  }
}
