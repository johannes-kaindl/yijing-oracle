// Settings-Typen + Defaults. Pure (kein obsidian-Import) — von check:pure erfasst. Die
// Render-Schicht lebt in obsidian/settings/ und re-exportiert diese Symbole, damit die
// bestehenden Import-Pfade (main.ts, view.ts) unverändert bleiben.
import { pickLang } from "../vendor/kit/i18n";
import { type EndpointStatus } from "../vendor/kit/endpoint_diagnostics";
import { type Lang, type Register } from "./data";
import { DEFAULT_FRONTMATTER_FIELDS, type FrontmatterField } from "./frontmatter";
import { DEFAULT_FILENAME_TEMPLATE } from "./filename";
import { type CalloutConfig, DEFAULT_CALLOUTS } from "./note-callouts";
import { type LlmSettings, DEFAULT_LLM_SETTINGS } from "./llm/settings-defaults";
import { type ImageSettings, DEFAULT_IMAGE_SETTINGS } from "./image-settings";

export type OutputMode = "note" | "cursor";

export interface PluginSettings {
  /** "auto" folgt der Obsidian-Sprache; sonst feste Reading-Sprache. */
  readingLang: "auto" | Lang;
  register: Register;
  defaultOutput: OutputMode;
  readingsFolder: string;
  /** Dateiname-Schema mit Platzhaltern ({date} {time} {hex} {resulting} {hexpair} {question}). */
  filenameTemplate: string;
  openAfterCreate: boolean;
  /** Frontmatter überhaupt anlegen? */
  includeFrontmatter: boolean;
  /** Pro Key: Name + Aktiv-Haken. */
  frontmatterFields: FrontmatterField[];
  /** LLM-Deutungs-Konfiguration. */
  llm: LlmSettings;
  /** Bildgenerierung (Bildmeditation). */
  image: ImageSettings;
  /** Callout-Wrapping der Wilhelm-Abschnitte in der Note. */
  callouts: CalloutConfig;
  /** Wilhelms Fußnoten als Anmerkungen-Abschnitt in die Note schreiben. */
  showNotes: boolean;
  /** Auf-/Zu-Zustand der einklappbaren Settings-Sektionen, pro Sektions-Key. */
  uiCollapsed: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  readingLang: "auto",
  register: "neutral",
  defaultOutput: "note",
  readingsFolder: "Yijing/Readings",
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  openAfterCreate: true,
  includeFrontmatter: true,
  frontmatterFields: DEFAULT_FRONTMATTER_FIELDS,
  llm: DEFAULT_LLM_SETTINGS,
  image: DEFAULT_IMAGE_SETTINGS,
  callouts: DEFAULT_CALLOUTS,
  showNotes: true,
  uiCollapsed: {},
};

/** Löst die effektive Reading-Sprache auf: "auto" → aus dem UI-Locale abgeleitet. */
export function resolveReadingLang(settings: PluginSettings, uiLocale?: string | null): Lang {
  return settings.readingLang === "auto" ? pickLang(uiLocale) : settings.readingLang;
}

/** Schmaler Vertrag der Settings-UI zum Plugin (UI-STANDARD §4: die View kennt weder Plugin
 *  noch Ports direkt). */
export interface SettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  /** Probt EINEN Endpunkt und klassifiziert das Ergebnis (Per-Zeile-Status im Editor).
   *  Injiziert, damit die Settings-Schicht die Netz-Anbindung nicht selbst kennt. */
  probeEndpoint(endpoint: string): Promise<EndpointStatus>;
}
