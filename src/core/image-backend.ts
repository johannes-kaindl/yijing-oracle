// Vertrag aller Bild-Backends. Pure (kein obsidian-Import) — von check:pure erfasst.
// Implementierungen: obsidian/image-client.ts (A1111) · core/comfy/client.ts (ComfyUI).

export type HttpPostJson = (url: string, body: unknown) => Promise<{ status: number; json: unknown }>;

export interface ImageRequest {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  /** null = das Backend entscheidet: ComfyUI nimmt den Wert aus dem Workflow,
   *  A1111 lässt das Feld weg und der Server nutzt seinen Default. */
  steps: number | null;
  seed: number;
}

export interface ImageBackend {
  /** Liefert das Bild als Base64-PNG; wirft Error mit Klartext bei Fehlschlag. */
  generate(req: ImageRequest): Promise<string>;
}
