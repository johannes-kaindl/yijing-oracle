// Defaults der Bildgenerierung — pure (Muster: llm/settings-defaults.ts).
// Leerer Endpoint = Feature aus (Button erscheint nicht).

/** A1111-kompatibel (Draw Things, A1111, Forge, SD.Next) oder ComfyUI (Workflow-JSON). */
export type ImageBackendKind = "a1111" | "comfyui";

export interface ImageSettings {
  /** Welche API am Endpunkt spricht. Default "a1111" — Bestandskonfigurationen
   *  kennen das Feld nicht und verhalten sich damit unverändert. */
  backend: ImageBackendKind;
  /** Bild-Server. Leer = Feature aus. */
  endpoint: string;
  /** Wird an den Szenen-Satz angehängt. */
  styleSuffix: string;
  negativePrompt: string;
  /** Quadratische Kantenlänge in px. */
  size: number;
  /** Sampling-Schritte für A1111. */
  steps: number;
  /** Aus ComfyUI exportierter Graph (Workflow → Export (API)). Leer = nicht eingerichtet. */
  comfyWorkflow: string;
  /** Überschreibt die Steps im ComfyUI-Workflow. null = der Workflow gewinnt — sonst
   *  zwängen wir einem Turbo-Workflow (4–8 Steps) einen SDXL-Default von 28 auf. */
  comfyStepsOverride: number | null;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  backend: "a1111",
  endpoint: "",
  styleSuffix: "ink wash painting, soft light, muted colors",
  negativePrompt: "text, watermark, signature, frame, border, lowres, blurry",
  size: 768,
  steps: 28,
  comfyWorkflow: "",
  comfyStepsOverride: null,
};
