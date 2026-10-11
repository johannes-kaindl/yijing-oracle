// Migration der Bestands-Settings. Pure — von check:pure erfasst.
import { parseEndpointList } from "../../vendor/kit/endpoint";
import { fillMissingRowModels, migrateEndpointListChecked, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from "../llm/settings-defaults";

/** Schlüsselbund-Eintrag des einen globalen API-Schlüssels bis 0.10 (`api-key-storage.ts`).
 *  Er wird beim Laden der ALTEN Form gelesen und nie gelöscht (das Kit legt je Zeile einen eigenen
 *  Eintrag an, `yijing-oracle-ep-<id>`). Ein Downgrade auf 0.10 trägt das NICHT: dessen Laden wirft
 *  an der Objekt-Liste. Der Eintrag bleibt nur, weil nichts ihn automatisch löschen soll. */
export const LEGACY_API_KEY_SECRET_ID = "yijing-oracle-llm-api-key";

export interface LlmMigration {
  llm: LlmSettings;
  /** `data.json` trägt noch die alte Form (Textarea-String, `string[]`, `llm.apiKey`) → einmal neu schreiben. */
  migrated: boolean;
  /** Einträge der Endpunkt-Liste, die kein Text/Objekt waren und verworfen wurden (der Aufrufer meldet es). */
  dropped: number;
  /** Ein Klartext-Schlüssel aus `data.json`, für den es keine Zeile gibt und den der Schlüsselbund (noch)
   *  nicht trägt: der Aufrufer legt ihn unter {@link LEGACY_API_KEY_SECRET_ID} ab, damit er weder verloren
   *  geht noch im Klartext in `data.json` bleibt. Sonst "". */
  strandedKey: string;
}

/** Die `llm`-Settings aus einer Bestands-`data.json` auf das heutige Schema bringen.
 *
 *  Formen von `llm.endpoints` im Bestand: bis 0.2.0 ein Textarea-**String** (eine URL pro Zeile)
 *  plus `activeEndpoint`; bis 0.10 ein `string[]` mit EINEM globalen `llm.apiKey` (später im
 *  Schlüsselbund unter {@link LEGACY_API_KEY_SECRET_ID}); seit der Verbindung über das Kit eine
 *  `EndpointConfig[]` mit Schlüssel je Zeile. Der globale Schlüssel wandert als `apiKey` in jede
 *  Zeile ohne eigenen — das Kit überführt ihn beim ersten Auflösen in den Schlüsselbund.
 *
 *  Die Fremdfelder bleiben (Forward-Compat), die abgelösten Felder `apiKey`, `activeEndpoint`,
 *  `requestThinking` und `model` verschwinden ausdrücklich: ein Merge mit den Defaults würde sie sonst als
 *  Leichen zurückschreiben. `requestThinking` liest `loadRequestSettings` aus dem ROHEN Bestand,
 *  bevor diese Funktion es streicht.
 *
 *  @param legacyStoreKey Wert des Schlüsselbund-Eintrags {@link LEGACY_API_KEY_SECRET_ID} ("" ohne).
 *  @example migrateLlmSettings({ endpoints: ["http://a:1"], apiKey: "sk" }, "").llm.endpoints
 *    // → [{ url: "http://a:1", apiKey: "sk" }] */
export function migrateLlmSettings(rawLlm: unknown, legacyStoreKey: string): LlmMigration {
  const r: Record<string, unknown> =
    rawLlm !== null && typeof rawLlm === "object" && !Array.isArray(rawLlm) ? { ...(rawLlm as Record<string, unknown>) } : {};
  const rawEndpoints = r.endpoints;

  let list: (string | EndpointConfig)[] | undefined;
  let droppedWhole = 0;
  let migrated = false;
  /** Liegt die ALTE Form vor? Nur dann gilt der globale Schlüssel: bei jedem Laden einer schon
   *  migrierten Liste würde er sonst in jede Zeile ohne Schlüssel zurückkehren — auch in eine, der
   *  der Nutzer ihn bewusst entzogen hat oder die zu einem fremden Server gehört. */
  let altForm = "apiKey" in r;
  if (rawEndpoints === undefined) {
    list = DEFAULT_LLM_SETTINGS.endpoints.map((e) => ({ ...e }));
  } else if (typeof rawEndpoints === "string") {
    list = parseEndpointList(rawEndpoints);
    migrated = true;
    altForm = true;
  } else if (Array.isArray(rawEndpoints)) {
    list = rawEndpoints as (string | EndpointConfig)[];
    if (rawEndpoints.some((e) => typeof e === "string")) { migrated = true; altForm = true; }
  } else {
    droppedWhole = 1;
    list = DEFAULT_LLM_SETTINGS.endpoints.map((e) => ({ ...e }));
  }
  const checked = migrateEndpointListChecked(undefined, list);

  const storedKey = typeof r.apiKey === "string" ? r.apiKey : "";
  const key = altForm ? (legacyStoreKey || storedKey).trim() : "";
  const withKeys = key
    ? checked.list.map((e) => (e.apiKey || e.secretId ? e : { ...e, apiKey: key }))
    : checked.list;
  // Das globale Modell (`llm.model`) ist abgeschafft: der Altwert geht einmal in jede Zeile ohne Modell
  // (nach Migration und Default-Zeile, vor dem Entfernen des Schluessels). Der Schluessel MUSS aus dem
  // geladenen Objekt verschwinden, sonst fuellt jeder Start eine vom Nutzer geleerte Zeile wieder auf.
  const endpoints = fillMissingRowModels(withKeys, r.model);
  if ("model" in r) migrated = true;
  delete r.model;

  // Ein Klartext-Schluessel aus data.json, fuer den es keine Zeile gibt, darf weder verloren gehen noch im
  // Klartext stehen bleiben: er wird als `strandedKey` gemeldet und vom Aufrufer in den Schluesselbund gelegt.
  const strandedKey = endpoints.length === 0 && storedKey.trim() !== "" && !legacyStoreKey ? storedKey.trim() : "";
  if ("apiKey" in r) migrated = true;
  delete r.apiKey;
  delete r.activeEndpoint;
  delete r.requestThinking;
  const llm: LlmSettings = { ...DEFAULT_LLM_SETTINGS, ...r, endpoints };
  const dropped = checked.dropped + droppedWhole;
  return { llm, migrated, dropped, strandedKey };
}
