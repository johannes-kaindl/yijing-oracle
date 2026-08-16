// Settings-Tab, zweigleisig: `getSettingDefinitions()` IST die Struktur (Obsidian ≥ 1.13
// rendert sie selbst und nimmt sie in die Einstellungs-Suche auf), darunter zeichnet der
// Kit-Walker dieselbe Struktur mit der klassischen Setting-API nach. EINE Wahrheit für beide
// Pfade — REGISTRY „Zweigleisige deklarative Settings — eine-Wahrheit-Walker".
//
// Zwei Fallstricke, gemessen von den Vorgänger-Consumern und hier eingehalten:
// (1) Bedingte Zeilen werden WEGGELASSEN, nicht per `visible` versteckt — der native
//     1.13-Renderer wertet `visible` an Gruppen-Items nicht aus.
// (2) Beim Öffnen des Tabs ruft der Host weder display() noch getSettingDefinitions(),
//     sondern rendert die beim addSettingTab gecachten Definitionen — und ruft vorher
//     hide(). Ohne den Refresh dort wären die bedingten Zeilen so alt wie der Plugin-Start.
//
// Die Sektionen waren bis 2026-07-20 einklappbar (vendored kit-obsidian/collapsible).
// Aufgegeben, weil einklappbare Sektionen und die deklarative API sich ausschließen:
// SettingDefinitionGroup kennt kein Collapse. Suchbarkeit löst das Auffinden besser.
import { type App, type Plugin, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { refreshSettingsTab, renderSettingDefinitions } from "../../vendor/kit-obsidian/settings_walker";
import { type SettingsHost } from "../../core/settings";
import { type ControlKey, readControl, writeControl } from "../../core/settings/controls";
import {
  calloutRows,
  frontmatterRows,
  generalRows,
  noteContentRows,
  noteStorageRows,
} from "./note-section";
import { llmRows } from "./llm-section";
import { imageRows } from "./image-section";
import { type SectionCtx } from "./section-ctx";

// Import-Pfade der Bestands-Aufrufer (main.ts, view.ts) unverändert halten.
export { DEFAULT_SETTINGS, resolveReadingLang } from "../../core/settings";
export type { OutputMode, PluginSettings, SettingsHost } from "../../core/settings";
export { DEFAULT_LLM_SETTINGS } from "../../core/llm/settings-defaults";
export type { LlmSettings } from "../../core/llm/settings-defaults";

export class SettingsTab extends PluginSettingTab {
  /** Cleanups der Hatches aus dem letzten Fallback-Rendern. */
  private cleanupPrevious: () => void = () => {};

  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
  }

  // ── Die eine Wahrheit ──────────────────────────────────────────────────────
  getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
    const ctx = this.ctx();
    return [
      { type: "group", heading: t("set.secGeneral"), items: generalRows() },
      { type: "group", heading: t("set.secNoteStorage"), items: noteStorageRows() },
      { type: "group", heading: t("set.fmHead"), items: frontmatterRows(ctx) },
      { type: "group", heading: t("set.secNoteContent"), items: noteContentRows() },
      { type: "group", heading: t("set.calloutHead"), items: calloutRows(ctx) },
      { type: "group", heading: t("set.llmHead"), items: llmRows(ctx) },
      { type: "group", heading: t("set.imgHead"), items: imageRows(ctx) },
    ];
  }

  // ── Wert-Vertrag der deklarativen API ──────────────────────────────────────
  getControlValue(key: string): unknown {
    return readControl(this.host.settings, key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Alles läuft durch die pure Registry: der deklarative Host prüft nur den Control-Typ,
    // nicht unsere Grenzen (Trim, Default-Rückfall, Zahl-Coercion).
    const needsRefresh = writeControl(this.host.settings, key, value);
    await this.host.saveSettings();
    if (needsRefresh) this.refresh();
  }

  // ── Was die Sektionen zum Wirken brauchen ──────────────────────────────────
  private ctx(): SectionCtx {
    return {
      host: this.host,
      write: (key, value) => {
        void this.setControlValue(key, value);
      },
      save: () => {
        void this.host.saveSettings();
      },
      rerender: () => {
        this.refresh();
      },
    };
  }

  /** Neu zeichnen — ab 1.13 partiell über die native update()-API, darunter voller Rebuild. */
  private refresh(): void {
    refreshSettingsTab(this, () => {
      this.rebuild();
    });
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ─────────────────────────────────
  private rebuild(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(
      this.containerEl,
      this.getSettingDefinitions(),
      this,
      this.app,
    );
  }

  display(): void {
    this.rebuild();
  }

  hide(): void {
    this.cleanupPrevious();
    this.cleanupPrevious = () => {};
    // Nur der native ≥1.13-Pfad braucht das (Fallstrick 2 oben): dort rendert der Host beim
    // Öffnen die gecachten Definitionen und ruft vorher hide(). Unter 1.12 ruft er display()
    // ohnehin selbst — ein Rebuild hier wäre ein zweiter, samt Endpunkt-Proben in einen
    // Container, den niemand mehr sieht. Deshalb bewusst ein leerer Fallback.
    refreshSettingsTab(this, () => {});
  }
}
