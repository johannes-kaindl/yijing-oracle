// Loest die aktive LLM-Endpunktquelle auf: zuerst der LLM Endpoint Manager (falls installiert
// und ein Endpunkt liefert), sonst die lokale Endpunkt-Liste dieses Plugins (string[] +
// globaler apiKey). Pure — kein `obsidian`-Import, `check:pure`-gated. Der `manager`-Parameter
// kommt vom Aufrufer (obsidian/view.ts, obsidian/settings/llm-section.ts): das Finden des
// Fremdplugins braucht `app` und ist damit obsidian-seitig.
import { migrateEndpointList, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import {
  resolveEndpointSource,
  type EndpointChoice,
  type EndpointSourceResult,
  type LlmEndpointManagerApi,
} from "../../vendor/kit/endpoint-source";
import { type LlmSettings } from "./settings-defaults";

/** Die lokale `string[]`-Liste (UI-Abweichung `endpoint-list`, siehe AGENTS.md) als
 *  `EndpointConfig[]` fuer `resolveEndpointSource` — der EINE globale `apiKey` dieses Plugins
 *  gilt fuer jede Zeile, solange es keinen Key je Zeile gibt. `migrateEndpointList` deckt dabei
 *  auch den Alt-Datenstand (blanke Strings) ab; `llm.endpoints` bleibt selbst unveraendert
 *  string[] — es gibt keine Migration des gespeicherten Formats, nur eine Adaption beim Lesen. */
export function localEndpointConfigs(llm: LlmSettings): EndpointConfig[] {
  const configs = migrateEndpointList(undefined, llm.endpoints);
  const key = llm.apiKey.trim();
  if (!key) return configs;
  return configs.map((c) => (c.apiKey ? c : { ...c, apiKey: key }));
}

/** Ein Durchlauf: Manager zuerst (falls installiert), sonst lokal. `ping` prueft EINEN
 *  Endpunkt und wird durchgereicht (lokaler Pfad prueft damit reihum, wie bisher). */
export async function resolveLlmEndpoint(
  llm: LlmSettings,
  manager: LlmEndpointManagerApi | null,
  ping: (cfg: EndpointConfig) => Promise<boolean>,
  caller: string,
): Promise<EndpointSourceResult> {
  const choice: EndpointChoice | undefined = llm.choice;
  return resolveEndpointSource(
    {
      manager,
      local: localEndpointConfigs(llm),
      localModel: llm.model,
      capability: "chat",
      choice,
      caller,
    },
    ping,
  );
}
