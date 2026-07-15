// Defaults der Bildgenerierung — pure (Muster: llm/settings-defaults.ts).
// Leerer Endpoint = Feature aus (Button erscheint nicht).
export interface ImageSettings {
  /** A1111-kompatibler Server (Draw Things API). Leer = Feature aus. */
  endpoint: string;
  /** Wird an den Szenen-Satz angehängt. */
  styleSuffix: string;
  negativePrompt: string;
  /** Quadratische Kantenlänge in px. */
  size: number;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  endpoint: "",
  styleSuffix: "ink wash painting, soft light, muted colors",
  negativePrompt: "text, watermark, signature, frame, border, lowres, blurry",
  size: 768,
};
