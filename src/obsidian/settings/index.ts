// Settings-Tab: fünf einklappbare Sektionen. Dünn — jede Sektion rendert in ihrer eigenen
// Datei, die Entscheidungslogik liegt pure in core/settings/.
import { type App, type Plugin, PluginSettingTab } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { collapsibleSection, type CollapsibleStorage } from "../../vendor/kit-obsidian/collapsible";
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

    // Auf-/Zu-Zustand überlebt das Schließen des Tabs (das Kit ist storage-agnostisch —
    // der Consumer verdrahtet die Persistenz selbst).
    const storage: CollapsibleStorage = {
      getCollapsed: (key) => this.host.settings.uiCollapsed[key],
      setCollapsed: (key, collapsed) => {
        this.host.settings.uiCollapsed[key] = collapsed;
        void this.host.saveSettings();
      },
    };

    renderGeneralSection(
      collapsibleSection(containerEl, {
        title: t("set.secGeneral"),
        key: "general",
        storage,
        defaultCollapsed: false,
      }),
      ctx,
    );
    renderNoteStorageSection(
      collapsibleSection(containerEl, { title: t("set.secNoteStorage"), key: "note-storage", storage }),
      ctx,
    );
    renderNoteContentSection(
      collapsibleSection(containerEl, { title: t("set.secNoteContent"), key: "note-content", storage }),
      ctx,
    );
    renderLlmSection(
      collapsibleSection(containerEl, { title: t("set.llmHead"), key: "llm", storage }),
      ctx,
    );
    renderImageSection(
      collapsibleSection(containerEl, { title: t("set.imgHead"), key: "image", storage }),
      ctx,
    );
  }
}
