// Anschluss an den Besitzer der Fähigkeit „Prompt → Bild“: local-image-generator (Kit-Vertrag `image-gen-provider`).
// Frisch je Aufruf (das Plugin kann zur Laufzeit deaktiviert werden), Form-Guard statt Versionsvergleich.
import { type App } from "obsidian";
import { isImageGenProviderApi, type ImageGenProviderApi } from "../vendor/kit/image-gen-provider";

export const IMAGE_GEN_PLUGIN_ID = "local-image-generator";

export function readImageGenApi(app: App): ImageGenProviderApi | null {
  const reg = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
  if (reg === undefined || reg === null || typeof reg !== "object") return null;
  const api = (reg[IMAGE_GEN_PLUGIN_ID] as { api?: unknown } | undefined)?.api;
  return isImageGenProviderApi(api) ? api : null;
}
