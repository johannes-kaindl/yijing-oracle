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
import { mergeCallouts } from "./core/note-callouts";
import { migrateEndpointList, stripLegacyLlmFields } from "./core/settings/migrate";
import { DEFAULT_IMAGE_SETTINGS } from "./core/image-settings";
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
import { probeEndpoint } from "./obsidian/http";
import { normalizeEndpoint } from "./vendor/kit/endpoint";
import { type EndpointStatus } from "./vendor/kit/endpoint_diagnostics";

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
    // Nach dem Spread steht in `endpoints` entweder noch der alte Textarea-String
    // (Bestands-data.json bis 0.2.0) oder bereits string[]. migrateEndpointList nimmt beides.
    this.settings.llm.endpoints = migrateEndpointList(this.settings.llm.endpoints);
    // mergeSettings erhält unbekannte raw-Felder (Forward-Compat) → das alte `activeEndpoint`
    // überlebt den Spread und würde als Leiche zurückgeschrieben. Explizit entfernen.
    stripLegacyLlmFields(this.settings.llm);
    // mergeSettings ist shallow — auch das image-Objekt gegen neue Defaults auffüllen.
    this.settings.image = { ...DEFAULT_IMAGE_SETTINGS, ...(this.settings.image ?? {}) };
    this.settings.callouts = mergeCallouts(this.settings.callouts);

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

  /** SettingsHost: Per-Zeile-Probe für den Endpunkt-Editor. Injiziert, damit die
   *  Settings-Schicht die Netz-Anbindung nicht selbst kennt. */
  probeEndpoint(endpoint: string): Promise<EndpointStatus> {
    return probeEndpoint(normalizeEndpoint(endpoint));
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
        callouts: this.settings.callouts,
        includeNotes: this.settings.showNotes,
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
