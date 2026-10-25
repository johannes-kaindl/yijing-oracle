// vendored from obsidian-kit@0.70.1, src/obsidian/capability-apis.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { IMAGE_GEN_PLUGIN_ID, isImageGenProviderApi, type ImageGenProviderApi } from "../kit/image-gen-provider";
import { OCR_PLUGIN_ID, isOcrProviderApi, type OcrProviderApi } from "../kit/ocr-provider";
import { readPluginApi } from "./plugin-api";

/** Die Bildgenerierungs-API von `local-image-generator` oder `null` (Plugin fehlt, abgeschaltet, falsche Form oder Version). Frisch je Aufruf. */
export function readImageGenApi(app: unknown): ImageGenProviderApi | null {
  return readPluginApi(app, IMAGE_GEN_PLUGIN_ID, isImageGenProviderApi);
}

/** Die OCR-API von `image-to-markdown` oder `null`. */
export function readOcrApi(app: unknown): OcrProviderApi | null {
  return readPluginApi(app, OCR_PLUGIN_ID, isOcrProviderApi);
}
