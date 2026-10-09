// Die LLM-Verbindung des Plugins: Endpunkt-Quelle, Modellliste, Anfrage-Parameter, Chat-Client und
// die Settings-Abschnitte „Quelle“, „Endpunkte“ und „Anfrage“ kommen aus dem Kit
// (`createLlmConnection`). Hier steht nur, was dieses Plugin dazu sagt: der feste Modus
// `creative` (die Deutung ist freie, deutende Rede) und wie die Verbindung seine Settings liest
// und schreibt. Eigene Datei statt Inline in `main.ts`, damit ein Test dieselbe Verdrahtung
// gegen eine Fake-Umgebung fährt, nicht eine Kopie davon.
import { type App } from "obsidian";
import { getLang } from "../vendor/kit/i18n";
import {
  createLlmConnection, type LlmConnection, type LlmConnectionOptions, type LlmConnectionSettings,
} from "../vendor/kit-obsidian/llm-connection";
import { MODE } from "../core/llm/request-settings";
import { type PluginSettings } from "../core/settings";

export interface OracleConnectionDeps {
  app: App;
  pluginId: string;
  /** Live-Zugriff: das Settings-Objekt wird beim Laden ersetzt, ein gemerktes Objekt wäre dann veraltet. */
  settings: () => PluginSettings;
  save: () => Promise<void>;
  /** Nur für Tests (Transport, Probe, Modell-Liste, Backend, Uhr): überlagert die Optionen, die das
   *  Plugin nicht selbst setzt. `mode`, `getSettings` und `persist` bleiben die des Plugins. */
  options?: Partial<Omit<LlmConnectionOptions, "app" | "pluginId" | "caller" | "capability" | "mode" | "getSettings" | "persist">>;
}

/** Settings → Verbindung. `choice` fehlt im Ergebnis, wenn keine Wahl getroffen ist (nicht `undefined`). */
export function connectionSettings(s: PluginSettings): LlmConnectionSettings {
  return {
    endpoints: s.llm.endpoints,
    ...(s.llm.choice !== undefined ? { choice: s.llm.choice } : {}),
    model: s.llm.model,
    request: s.request,
  };
}

/** Verbindung → Settings. SYNCHRON, bevor gespeichert wird: die Endpunkt-Liste liest ihre Zeilen
 *  gleich danach über `getSettings()` zurück, und die Verbindung prüft das. Ein Feld, das der Patch
 *  nicht nennt, bleibt unberührt; `choice: undefined` im Patch löscht die Wahl. */
export function applyConnectionPatch(s: PluginSettings, patch: Partial<LlmConnectionSettings>): void {
  if (patch.endpoints !== undefined) s.llm.endpoints = patch.endpoints;
  if ("choice" in patch) {
    if (patch.choice === undefined) delete s.llm.choice;
    else s.llm.choice = patch.choice;
  }
  if (patch.model !== undefined) s.llm.model = patch.model;
  if (patch.request !== undefined) s.request = patch.request;
}

export function createOracleConnection(d: OracleConnectionDeps): LlmConnection {
  return createLlmConnection({
    app: d.app,
    pluginId: d.pluginId,
    caller: "yijing-oracle",
    capability: "chat",
    mode: MODE,
    lang: () => getLang(),
    ...d.options,
    getSettings: () => connectionSettings(d.settings()),
    // Erst in die Settings schreiben, dann speichern (siehe `applyConnectionPatch`). `save` darf die
    // Verbindung nicht selbst `invalidate()`n lassen: sie ruft `persist` aus `resolve`.
    persist: (patch) => {
      applyConnectionPatch(d.settings(), patch);
      return d.save();
    },
  });
}
