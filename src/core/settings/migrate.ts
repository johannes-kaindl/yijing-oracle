// Migration der Bestands-Settings. Pure — von check:pure erfasst.
import { parseEndpointList } from "../../vendor/kit/endpoint";

/** Endpunkt-Liste aus einer Bestands-`data.json` normalisieren.
 *
 *  Bis 0.2.0 war `llm.endpoints` ein Textarea-**String** (eine URL pro Zeile) plus ein
 *  separates `activeEndpoint`-Feld. Ab jetzt ist es `string[]`, und „aktiv" wird abgeleitet
 *  (erster erreichbarer). mergeSettings ist shallow, deshalb kann nach dem llm-Spread in
 *  main.ts noch der alte String im Feld stehen — diese Funktion nimmt beide Formen.
 *
 *  Abweichung von vault-rags `migrateEndpointList(single, list)`: dort war der Altbestand ein
 *  Single-Endpoint-Feld, hier ein mehrzeiliger String → ein Union-Parameter statt zweier.
 *
 *  @example migrateEndpointList("http://a:1\nhttp://b:2") // → ["http://a:1", "http://b:2"]
 *  @example migrateEndpointList(["http://a:1"])           // → ["http://a:1"]
 *  @example migrateEndpointList(undefined)                // → [] */
export function migrateEndpointList(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return raw.filter((e) => e && e.trim().length > 0);
  if (typeof raw === "string") return parseEndpointList(raw);
  return [];
}
