// Bildmeditation — pure (Muster: llm/settings-defaults.ts).
// Server, Backend, Größe und Negativ-Prompt gehören dem Plugin local-image-generator (Kit-Vertrag
// `image-gen-provider`); hier bleibt nur, was die Szene betrifft: der Stil-Zusatz am Prompt.

export interface ImageSettings {
  /** Wird an den Szenen-Satz angehängt. */
  styleSuffix: string;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  styleSuffix: "ink wash painting, soft light, muted colors",
};

/** Liest den gespeicherten `image`-Block. Die Schlüssel der früheren Eigenbau-Anbindung (backend, endpoint, negativePrompt,
 *  size, steps, comfyWorkflow, comfyStepsOverride) werden verworfen, damit sie nicht für immer in der data.json bleiben. */
export function normalizeImageSettings(raw: unknown): ImageSettings {
  const suffix = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).styleSuffix : undefined;
  return { styleSuffix: typeof suffix === "string" ? suffix : DEFAULT_IMAGE_SETTINGS.styleSuffix };
}
