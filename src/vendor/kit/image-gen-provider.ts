// vendored from obsidian-kit@0.70.1, src/pure/image-gen-provider.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Öffentlicher Vertrag des Fähigkeits-Besitzers `local-image-generator` (Bildgenerierung) —
 *  Muster `pure/endpoint-source.ts`: EINE Quelle, der Besitzer re-exportiert sie, Konsumenten
 *  vendoren. Fehler sind Werte (`ImageGenProviderError`), Methoden fangen selbst — nie werfen.
 *  Form-Guard statt Versionskopie, siehe `audio-provider.ts` (dieselbe Begründung).
 *
 *  Die API abstrahiert über BACKENDS (mobil: Apple-Kurzbefehl/Image Playground, desktop:
 *  DrawThings/A1111/Comfy) — ein Konsument merkt den Unterschied nie (Spec § Leitentscheidung).
 *  Mobil ist der Kurzbefehl-Weg das EINZIGE Backend (Kernversprechen, nicht Kür): stilisierte
 *  Ausgaben (Animation/Illustration/Sketch), keine Fotorealistik, keine Negativ-Prompts/Maße. */
export const IMAGE_GEN_PROVIDER_API_VERSION = 1;
/** Plugin-ID des Besitzers (`local-image-generator`): dort liegt die API unter `app.plugins.plugins[id].api`; gelesen mit `readImageGenApi`. */
export const IMAGE_GEN_PLUGIN_ID = "local-image-generator";

export type ImageGenProviderErrorCode = "backend-unavailable" | "timeout" | "busy" | "refused" | "failed";
export interface ImageGenProviderError { error: ImageGenProviderErrorCode; message: string }

export interface GenerateImageOptions {
  /** Vault-Zielordner (ohne Dateinamen) — die Endung wählt das Backend. */
  targetFolder: string;
}

export interface ImageGenProviderApi {
  version: 1;
  /** Prompt → Vault-relativer Pfad des erzeugten Bilds. */
  generateImage(prompt: string, opts: GenerateImageOptions): Promise<string | ImageGenProviderError>;
}

const METHODS = ["generateImage"] as const;

export function isImageGenProviderApi(x: unknown): x is ImageGenProviderApi {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== IMAGE_GEN_PROVIDER_API_VERSION) return false;
  return METHODS.every((m) => typeof o[m] === "function");
}
