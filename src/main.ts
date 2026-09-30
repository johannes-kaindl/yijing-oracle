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
import { loadRequestSettings } from "./core/llm/request-settings";
import { deviationNotice } from "./core/request-text";
import { createRequestSession, type RequestSession } from "./vendor/kit-obsidian/request-session";
import { type RequestSectionState } from "./vendor/kit-obsidian/request-section";
import { type RequestSettings } from "./vendor/kit/sampling-profiles";
import { loadApiKey, persistApiKey } from "./core/settings/api-key-storage";
import { obsidianSecretStore } from "./vendor/kit-obsidian/secrets";
import { DEFAULT_IMAGE_SETTINGS } from "./core/image-settings";
import { type Lang } from "./core/data";
import {
  DEFAULT_SETTINGS,
  DEFAULT_LLM_SETTINGS,
  SettingsTab,
  resolveReadingLang,
  type OutputMode,
  type PluginSettings,
} from "./obsidian/settings";
import { OracleView, VIEW_TYPE_YIJING, type OracleHost } from "./obsidian/view";
import { writeReading } from "./obsidian/reading-writer";
import { nowStamp } from "./obsidian/clock";
import { probeEndpoint } from "./obsidian/http";
import { authHeaders } from "./core/llm/auth";
import { normalizeEndpoint } from "./vendor/kit/endpoint";
import { type EndpointStatus } from "./vendor/kit/endpoint_diagnostics";
import { onEndpointManagerChanged } from "./vendor/kit-obsidian/endpoint-source";
import { type EndpointSourceResult } from "./vendor/kit/endpoint-source";
import { type RequestHost } from "./obsidian/settings/request-section";

export default class YijingOraclePlugin extends Plugin implements RequestHost, OracleHost {
  // Basisklasse deklariert `settings?: unknown` (Obsidian ≥1.13) — hier auf den
  // konkreten Typ verengen, ohne ein eigenes Feld zu emittieren.
  declare settings: PluginSettings;

  /** Letztes Ergebnis der Endpunkt-Aufloesung (Familie/Backend/gesendetes Modell) — fuer den
   *  Abschnitt „Anfrage“ im Settings-Tab. Vor der ersten Deutung leer. */
  private lastSource: EndpointSourceResult | null = null;
  /** Letzte Anfrage und Abweichungen der laufenden Sitzung (nicht gespeichert). */
  readonly requestSession: RequestSession = createRequestSession({ message: (d) => deviationNotice(d) });

  async onload(): Promise<void> {
    const raw: unknown = await this.loadData();
    this.settings = mergeSettings(DEFAULT_SETTINGS, raw);
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
    // Sampling-Profile: request-Block saeubern und das alte `llm.requestThinking` einmalig nach
    // `request.thinking.creative` migrieren — aus dem ROHEN Bestand, VOR dem strip (der das Feld
    // loescht). `dropped` wird nach registerI18n gemeldet (Notice braucht t()).
    const requestLoad = loadRequestSettings(raw);
    this.settings.request = requestLoad.request;
    stripLegacyLlmFields(this.settings.llm);
    // mergeSettings ist shallow — auch das image-Objekt gegen neue Defaults auffüllen.
    this.settings.image = { ...DEFAULT_IMAGE_SETTINGS, ...(this.settings.image ?? {}) };
    this.settings.callouts = mergeCallouts(this.settings.callouts);
    // Der API-Schluessel gehoert in Obsidians Schluesselbund (garantiert ab minAppVersion
    // 1.11.4), nicht in data.json (Klartext, wandert mit jedem Vault-Sync). Ein Altwert aus
    // data.json wird beim ersten Laden hinuebergeschrieben und dort geleert; im Speicher steht
    // er weiterhin, damit die Netzwege ihn wie bisher unter `settings.llm.apiKey` finden.
    const apiKeyLoad = loadApiKey(this.settings.llm.apiKey, obsidianSecretStore(this.app));
    this.settings.llm.apiKey = apiKeyLoad.apiKey;
    if (apiKeyLoad.migrate) await this.saveSettings();

    registerI18n();
    setLang(pickLang(this.readLocale()));
    if (requestLoad.dropped.length > 0) {
      new Notice(t("request.dropped", String(requestLoad.dropped.length)));
      console.warn("[yijing-oracle] ungueltige request-Einstellungen verworfen:", requestLoad.dropped);
    }

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

    const settingsTab = new SettingsTab(this.app, this, this);
    this.addSettingTab(settingsTab);
    // Der Host rendert beim Oeffnen des Tabs die bei addSettingTab gecachten Definitionen
    // (SettingsTab-Kommentar "Fallstrick 2") — installiert sich der LLM Endpoint Manager erst
    // NACH diesem Zeitpunkt (Plugin-Ladereihenfolge ist nicht garantiert), bliebe die
    // Endpunkt-Zeile sonst bis zur naechsten eigenen Werteaenderung veraltet. Erst nach
    // onLayoutReady abonnieren (Kit-Empfehlung in onEndpointManagerChanged): verringert das
    // Risiko, den Manager zu verpassen, ohne es ganz auszuschliessen.
    this.app.workspace.onLayoutReady(() => {
      onEndpointManagerChanged(this.app, () => settingsTab.refresh());
    });
  }

  resolveReadingLang(): Lang {
    return resolveReadingLang(this.settings, this.readLocale());
  }

  async saveSettings(): Promise<void> {
    // Schluessel in den Schluesselbund, data.json ohne ihn — das Speicherobjekt bleibt
    // unangetastet (die Netzwege lesen daraus). Verwirft der Schluesselbund den Wert
    // stillschweigend, liefert persistApiKey den Wert fuer data.json zurueck wie bis 0.5.1.
    const storedApiKey = persistApiKey(this.settings.llm.apiKey, obsidianSecretStore(this.app), (m) => console.warn(m));
    await this.saveData({ ...this.settings, llm: { ...this.settings.llm, apiKey: storedApiKey } });
  }

  /** OracleHost: merkt das Ergebnis der Endpunkt-Aufloesung fuer „Anfrage“. */
  recordEndpointSource(r: EndpointSourceResult): void { this.lastSource = r; }

  /** RequestHost: Zustand fuer `buildRequestSection`. */
  requestSectionState(): RequestSectionState {
    const s = this.lastSource;
    return {
      family: s?.family ?? null, familySource: s?.familySource ?? "none",
      backend: s?.backend ?? "unknown", backendSource: s?.backendSource ?? "none",
      model: s?.model ?? "", sentModel: s?.sentModel ?? "",
      ...(s?.defaultModel !== undefined ? { defaultModel: s.defaultModel } : {}),
    };
  }

  async saveRequestSettings(next: RequestSettings): Promise<void> {
    this.settings.request = next;
    await this.saveSettings();
  }

  /** SettingsHost: Per-Zeile-Probe für den Endpunkt-Editor. Injiziert, damit die
   *  Settings-Schicht die Netz-Anbindung nicht selbst kennt. */
  probeEndpoint(endpoint: string): Promise<EndpointStatus> {
    return probeEndpoint(normalizeEndpoint(endpoint), authHeaders(this.settings.llm.apiKey));
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
