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
// Update 2026-09-16: `endpoint_config.ts` liegt seit der LLM-Endpoint-Manager-Migration
// vollstaendig vendoriert unter src/vendor/kit/endpoint_config.ts (resolveEndpointSource
// braucht es). `authHeaders` bleibt hier trotzdem stehen — die bestehenden Aufrufer
// (http.ts, chat-client.ts, image-client.ts, llm-section.ts) importieren diesen schmalen
// Ausschnitt, und ein Umstellen aller Importe auf den Vendor-Pfad ist kein Teil dieser
// Migration (`llm.endpoints` bleibt `string[]`, siehe core/llm/resolve-endpoint.ts). Bei
// einer spaeteren Umstellung auf `EndpointConfig[]` als Speicherformat faellt diese Datei weg.

/** Auth-Header für einen Endpunkt — die EINZIGE Stelle, an der ein Bearer aus einem
 *  Endpunkt-/Anbieter-Schlüssel gebaut wird. */
export function authHeaders(apiKey?: string): Record<string, string> {
  const k = apiKey?.trim();
  return k ? { Authorization: `Bearer ${k}` } : {};
}
