// Plugin-Shell: verdrahtet Settings, i18n, View, Commands, Ribbon. Bewusst dünn — die
// Orakel-Logik lebt im puren Kern (core/), die Oberfläche in obsidian/. Reihenfolge im
// onload (PROF-OBS-07): registerI18n() + setLang() ZUERST, vor addCommand/addRibbonIcon/
// addSettingTab — sonst rendern die t()-Aufrufe die rohen Keys.
import { Notice, Plugin, getLanguage } from "obsidian";
import { pickLang, setLang, t } from "./vendor/kit/i18n";
import { mergeSettings } from "./vendor/kit/settings";
import { registerI18n } from "./i18n/strings";
import { cast } from "./core/casting";
import { buildReading } from "./core/reading";
import { renderReading } from "./core/render";
import { type Lang } from "./core/data";
import {
  DEFAULT_SETTINGS,
  DEFAULT_LLM_SETTINGS,
  SettingsTab,
  resolveReadingLang,
  type OutputMode,
  type PluginSettings,
  type SettingsHost,
} from "./obsidian/settings";
import { OracleView, VIEW_TYPE_YIJING, type OracleHost } from "./obsidian/view";
import { writeReading } from "./obsidian/reading-writer";
import { nowStamp } from "./obsidian/clock";

export default class YijingOraclePlugin extends Plugin implements SettingsHost, OracleHost {
  // Basisklasse deklariert `settings?: unknown` (Obsidian ≥1.13) — hier auf den
  // konkreten Typ verengen, ohne ein eigenes Feld zu emittieren.
  declare settings: PluginSettings;

  async onload(): Promise<void> {
    this.settings = mergeSettings(DEFAULT_SETTINGS, await this.loadData());
    // frontmatterFields sind Objekte — mergeSettings klont nur die Array-Ebene, nicht die
    // Elemente. Tief kopieren, damit die Settings-UI nie DEFAULT_FRONTMATTER_FIELDS mutiert.
    this.settings.frontmatterFields = this.settings.frontmatterFields.map((f) => ({ ...f }));
    // mergeSettings ist shallow — das llm-Objekt separat gegen neue Defaults auffüllen.
    this.settings.llm = { ...DEFAULT_LLM_SETTINGS, ...(this.settings.llm ?? {}) };

    registerI18n();
    setLang(pickLang(this.readLocale()));

    this.registerView(VIEW_TYPE_YIJING, (leaf) => new OracleView(leaf, this));

    this.addRibbonIcon("sparkles", t("ribbon.tooltip"), () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-view",
      name: t("cmd.openView"),
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "cast-note",
      name: t("cmd.castNote"),
      callback: () => void this.castDirect("note"),
    });
    this.addCommand({
      id: "cast-cursor",
      name: t("cmd.castCursor"),
      editorCallback: () => void this.castDirect("cursor"),
    });

    this.addSettingTab(new SettingsTab(this.app, this, this));
  }

  resolveReadingLang(): Lang {
    return resolveReadingLang(this.settings, this.readLocale());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** getLanguage() ist ab Obsidian 1.8.0 verfügbar (manifest minAppVersion 1.8.7). */
  private readLocale(): string | null {
    return getLanguage();
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_YIJING);
    if (existing.length > 0) {
      await workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_YIJING, active: true });
    await workspace.revealLeaf(leaf);
  }

  /** Direkter Wurf ohne Panel (Command). Fragelos; nutzt die Standard-Einstellungen. */
  private async castDirect(mode: OutputMode): Promise<void> {
    try {
      const lang = this.resolveReadingLang();
      const date = nowStamp();
      const reading = buildReading(cast());
      const rendered = renderReading(reading, {
        lang,
        register: this.settings.register,
        date,
        question: "",
        includeFrontmatter: this.settings.includeFrontmatter,
        frontmatterFields: this.settings.frontmatterFields,
      });
      const result = await writeReading(
        this.app,
        {
          rendered,
          date,
          question: "",
          hexNumber: reading.primaryNumber,
          resultingNumber: reading.resultingNumber,
          lang,
          interpretation: null,
          thinkingInNote: this.settings.llm.thinkingInNote,
        },
        mode,
        this.settings,
      );
      if (result.file) {
        new Notice(t("notice.saved", result.file.basename));
        if (result.mode === "note" && this.settings.openAfterCreate) {
          await this.app.workspace.getLeaf(false).openFile(result.file);
        }
      }
    } catch (e) {
      new Notice(t("notice.dataError"));
      console.error("[yijing-oracle]", e);
    }
  }
}
