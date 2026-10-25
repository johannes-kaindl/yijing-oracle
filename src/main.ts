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
import { LEGACY_API_KEY_SECRET_ID, migrateLlmSettings } from "./core/settings/migrate";
import { REQUEST_MIGRATIONS } from "./core/llm/request-settings";
import { loadRequestSettings } from "./vendor/kit/sampling-profiles";
import { type LlmConnection } from "./vendor/kit-obsidian/llm-connection";
import { obsidianSecretStore } from "./vendor/kit-obsidian/secrets";
import { migrateLocalEndpoints } from "./vendor/kit-obsidian/endpoint-secrets";
import { normalizeImageSettings } from "./core/image-settings";
import { type Lang } from "./core/data";
import {
  DEFAULT_SETTINGS,
  SettingsTab,
  resolveReadingLang,
  type OutputMode,
  type PluginSettings,
} from "./obsidian/settings";
import { OracleView, VIEW_TYPE_YIJING, type OracleHost } from "./obsidian/view";
import { writeReading } from "./obsidian/reading-writer";
import { nowStamp } from "./obsidian/clock";
import { createOracleConnection } from "./obsidian/connection";
import { onEndpointManagerChanged } from "./vendor/kit-obsidian/endpoint-source";

export default class YijingOraclePlugin extends Plugin implements OracleHost {
  // Basisklasse deklariert `settings?: unknown` (Obsidian ≥1.13) — hier auf den
  // konkreten Typ verengen, ohne ein eigenes Feld zu emittieren.
  declare settings: PluginSettings;

  /** Die ganze LLM-Anbindung: Endpunkt-Quelle, Modellliste, Anfrage-Parameter, Client und die
   *  Settings-Abschnitte „Endpunkte“ und „Anfrage“ (Kit `createLlmConnection`). */
  llm!: LlmConnection;

  async onload(): Promise<void> {
    const raw: unknown = await this.loadData();
    this.settings = mergeSettings(DEFAULT_SETTINGS, raw);
    // frontmatterFields sind Objekte — mergeSettings klont nur die Array-Ebene, nicht die
    // Elemente. Tief kopieren, damit die Settings-UI nie DEFAULT_FRONTMATTER_FIELDS mutiert.
    this.settings.frontmatterFields = this.settings.frontmatterFields.map((f) => ({ ...f }));
    // Sampling-Profile: request-Block saeubern und das alte `llm.requestThinking` einmalig nach
    // `request.thinking.creative` migrieren — aus dem ROHEN Bestand, BEVOR migrateLlmSettings das
    // Feld streicht. `dropped` wird nach registerI18n gemeldet (Notice braucht t()).
    const requestLoad = loadRequestSettings(raw, REQUEST_MIGRATIONS);
    this.settings.request = requestLoad.request;
    // Endpunkt-Liste: Textarea-String / string[] + ein globaler Schluessel → EndpointConfig[] mit
    // Schluessel je Zeile (das Kit ueberfuehrt ihn beim ersten Aufloesen in den Schluesselbund).
    // Der alte Schluesselbund-Eintrag wird nur fuer die ALTE Form gelesen und nie geloescht.
    const rawLlm = raw !== null && typeof raw === "object" ? (raw as { llm?: unknown }).llm : undefined;
    const store = obsidianSecretStore(this.app);
    const llmLoad = migrateLlmSettings(rawLlm, store.get(LEGACY_API_KEY_SECRET_ID) ?? "");
    // Ein Klartext-Schluessel ohne Zeile: in den Schluesselbund (alter Eintrag), nicht im Klartext lassen.
    if (llmLoad.strandedKey) {
      try { store.set(LEGACY_API_KEY_SECRET_ID, llmLoad.strandedKey); }
      catch (e) { console.warn("[yijing-oracle] API-Schluessel ohne Endpunkt-Zeile konnte nicht gesichert werden:", e); }
    }
    // Klartext-Schluessel sofort in den Schluesselbund (je Zeile ein Eintrag), nicht erst beim ersten
    // Aufloesen: mit installiertem Manager wird die lokale Liste gar nicht aufgeloest.
    const secured = migrateLocalEndpoints(this.app, this.manifest.id, llmLoad.llm.endpoints);
    this.settings.llm = { ...llmLoad.llm, endpoints: secured.list };
    // mergeSettings ist shallow; der image-Block wird neu aufgebaut (die Schlüssel der früheren Eigenbau-Anbindung fallen weg).
    this.settings.image = normalizeImageSettings(this.settings.image);
    this.settings.callouts = mergeCallouts(this.settings.callouts);
    this.llm = createOracleConnection({
      app: this.app,
      pluginId: this.manifest.id,
      settings: () => this.settings,
      save: () => this.saveSettings(),
    });
    if (llmLoad.migrated || secured.changed) await this.saveSettings();

    registerI18n();
    setLang(pickLang(this.readLocale()));
    if (requestLoad.dropped.length > 0) {
      new Notice(t("request.dropped", String(requestLoad.dropped.length)));
      console.warn("[yijing-oracle] ungueltige request-Einstellungen verworfen:", requestLoad.dropped);
    }
    if (llmLoad.dropped > 0) console.warn(`[yijing-oracle] ${llmLoad.dropped} ungueltige Endpunkt-Eintraege verworfen`);

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

    const settingsTab = new SettingsTab(this.app, this, this, this.llm);
    this.addSettingTab(settingsTab);
    // Der Host rendert beim Oeffnen des Tabs die bei addSettingTab gecachten Definitionen (SettingsTab-Kommentar "Fallstrick 2") —
    // installiert sich der LLM Endpoint Manager erst NACH diesem Zeitpunkt, bliebe die Endpunkt-Zeile sonst veraltet. Seit Kit 0.61.0
    // zieht das Abo selbst nach, wenn der Manager erst nach dem Plugin erscheint, und ruft `cb` dann einmal.
    this.register(onEndpointManagerChanged(this.app, () => {
      settingsTab.refresh();
      this.eachView((v) => v.reloadModelRow());
    }));
  }

  resolveReadingLang(): Lang {
    return resolveReadingLang(this.settings, this.readLocale());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Endpunkt, Modell und Denkstufe ändern sich auch in den Einstellungen: die Modellzeile des offenen Panels zieht nach.
    this.eachView((v) => v.syncModelRow());
  }

  private eachView(fn: (v: OracleView) => void): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_YIJING)) {
      if (leaf.view instanceof OracleView) fn(leaf.view);
    }
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
