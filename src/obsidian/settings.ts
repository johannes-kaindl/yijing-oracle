import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import { pickLang, t } from "../vendor/kit/i18n";
import { type Lang, type Register } from "../core/data";

export type OutputMode = "note" | "cursor";

export interface PluginSettings {
  /** "auto" folgt der Obsidian-Sprache; sonst feste Reading-Sprache. */
  readingLang: "auto" | Lang;
  register: Register;
  defaultOutput: OutputMode;
  readingsFolder: string;
  openAfterCreate: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  readingLang: "auto",
  register: "classic",
  defaultOutput: "note",
  readingsFolder: "Yijing/Readings",
  openAfterCreate: true,
};

/** Löst die effektive Reading-Sprache auf: "auto" → aus dem UI-Locale abgeleitet. */
export function resolveReadingLang(settings: PluginSettings, uiLocale?: string | null): Lang {
  return settings.readingLang === "auto" ? pickLang(uiLocale) : settings.readingLang;
}

export interface SettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

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
    const s = this.host.settings;

    new Setting(containerEl)
      .setName(t("set.readingLang"))
      .setDesc(t("set.readingLangDesc"))
      .addDropdown((d) =>
        d
          .addOption("auto", t("set.langAuto"))
          .addOption("de", "Deutsch")
          .addOption("en", "English")
          .setValue(s.readingLang)
          .onChange(async (v) => {
            s.readingLang = v as PluginSettings["readingLang"];
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.register"))
      .setDesc(t("set.registerDesc"))
      .addDropdown((d) =>
        d
          .addOption("classic", t("set.regClassic"))
          .addOption("neutral", t("set.regNeutral"))
          .setValue(s.register)
          .onChange(async (v) => {
            s.register = v as Register;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.output"))
      .setDesc(t("set.outputDesc"))
      .addDropdown((d) =>
        d
          .addOption("note", t("set.outNote"))
          .addOption("cursor", t("set.outCursor"))
          .setValue(s.defaultOutput)
          .onChange(async (v) => {
            s.defaultOutput = v as OutputMode;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.folder"))
      .setDesc(t("set.folderDesc"))
      .addText((txt) =>
        txt
          .setPlaceholder("Yijing/Readings")
          .setValue(s.readingsFolder)
          .onChange(async (v) => {
            s.readingsFolder = v.trim() || DEFAULT_SETTINGS.readingsFolder;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.openAfter"))
      .setDesc(t("set.openAfterDesc"))
      .addToggle((tg) =>
        tg.setValue(s.openAfterCreate).onChange(async (v) => {
          s.openAfterCreate = v;
          await this.host.saveSettings();
        }),
      );
  }
}
