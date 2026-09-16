// Verteilt den API-Schluessel zwischen data.json und Obsidians Schluesselbund (SecretStorage,
// seit 1.11.4). Rein: kennt weder `obsidian` noch das Settings-Objekt — nur einen Store.
//
// Warum zweigleisig: der Floor dieses Plugins ist 1.8.7. Mit Schluesselbund liegt der Wert
// OS-verschluesselt und je Geraet, data.json traegt einen Leerstring; ohne Schluesselbund
// bleibt der Wert in data.json wie bis 0.5.1. Die Netzwege lesen weiterhin
// `settings.llm.apiKey` aus dem Speicher — `getSecret` ist synchron, deshalb aendert sich
// an ihnen nichts, nur an Laden und Speichern.
//
// SecretStore kommt seit 2026-09-16 aus dem Kit-Vendor (vendor/kit/secrets.ts, pure — kein
// obsidian-Import, `check:pure`-vertraeglich) statt aus einer eigenen, engeren Definition hier:
// has()/delete() kamen mit dem Kit-Schnitt dazu (Endpunkt-Manager-Migration braucht sie fuer
// den lokalen Fallback-Pfad), eine zweite lokale Kopie des Interfaces wuerde nur driften.
import type { SecretStore } from "../../vendor/kit/secrets";
export type { SecretStore };

/** Feste ID: lowercase-alphanumerisch mit Bindestrichen, wie SecretStorage sie verlangt. */
export const API_KEY_SECRET_ID = "yijing-oracle-llm-api-key";

/** Beim Laden: welcher Wert gilt, und muss data.json bereinigt werden (`migrate`)?
 *  Der Schluesselbund gewinnt, wenn beide gefuellt sind — er ist der neuere Ort, und ein
 *  Altwert in data.json ist auf jeden Fall aufzuraeumen. */
export function loadApiKey(stored: string, secrets: SecretStore | null): { apiKey: string; migrate: boolean } {
  if (!secrets) return { apiKey: stored, migrate: false };
  const inStore = secrets.get(API_KEY_SECRET_ID) ?? "";
  return { apiKey: inStore || stored, migrate: stored !== "" };
}

/** Beim Speichern: schreibt in den Schluesselbund und gibt zurueck, was data.json tragen
 *  soll. Verwirft der Store den Wert (Wurf), bleibt der Schluessel in data.json wie bisher —
 *  lieber Klartext mit Warnung als ein stiller Verlust, den der Nutzer erst am 401 bemerkt. */
export function persistApiKey(apiKey: string, secrets: SecretStore | null, warn: (msg: string) => void): string {
  if (!secrets) return apiKey;
  try {
    secrets.set(API_KEY_SECRET_ID, apiKey);
    return "";
  } catch (e) {
    warn(`yijing-oracle: API key stays in data.json — ${e instanceof Error ? e.message : String(e)}`);
    return apiKey;
  }
}
