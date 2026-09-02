// uebernommen aus obsidian-kit/src/vendor/code-kit/pure/endpoint_config.ts, 2026-09-02
// (dort seit code-kit@0.5.0; urspruenglich vault-rag/src/endpoint_config.ts 0.20.0).
//
// Warum ein Ausschnitt und keine vendorierte Datei: `endpoint_config.ts` traegt 176 Zeilen,
// und ihr Gegenstand ist die Endpunkt-Liste als `EndpointConfig[]` — Struktur, Migration
// alter String-Listen, Listen-Bearbeitung, dazu eine als @deprecated markierte Modell-Kruecke.
// Dieses Repo fuehrt seine Endpunkte als `string[]` mit EINEM globalen Schluessel. Die ganze
// Datei zu vendorieren hiesse, eine zweite, ungenutzte Endpunkt-Welt danebenzulegen — und
// genau deren Migration ist der Schritt, bei dem der konfigurierte Schluessel verloren geht
// (`migrateEndpointList` migriert nur die URL-Altformen). Ein halb vorhandenes Modul waere die
// Einladung, ihn beilaeufig anzufangen.
//
// Bei einer spaeteren Umstellung auf `EndpointConfig[]` faellt diese Datei weg und das
// Kit-Modul wird vollstaendig vendoriert.

/** Auth-Header für einen Endpunkt — die EINZIGE Stelle, an der ein Bearer aus einem
 *  Endpunkt-/Anbieter-Schlüssel gebaut wird. */
export function authHeaders(apiKey?: string): Record<string, string> {
  const k = apiKey?.trim();
  return k ? { Authorization: `Bearer ${k}` } : {};
}
