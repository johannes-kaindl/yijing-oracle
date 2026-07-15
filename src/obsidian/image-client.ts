// A1111-kompatibler txt2img-Client (Draw Things, A1111, Forge, SD.Next).
// HTTP wird injiziert (httpPostJson aus http.ts) — obsidian-frei + in Node testbar,
// Muster wie ChatClient. ComfyUI käme später als zweite ImageBackend-Implementierung.
import { normalizeEndpoint } from "../vendor/kit/endpoint";

export type HttpPostJson = (url: string, body: unknown) => Promise<{ status: number; json: unknown }>;

export interface ImageRequest {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
}

export interface ImageBackend {
  /** Liefert das Bild als Base64-PNG; wirft Error mit Klartext bei Fehlschlag. */
  generate(req: ImageRequest): Promise<string>;
}

export class Txt2ImgClient implements ImageBackend {
  constructor(
    private readonly endpoint: string,
    private readonly post: HttpPostJson,
  ) {}

  async generate(req: ImageRequest): Promise<string> {
    const url = `${normalizeEndpoint(this.endpoint)}/sdapi/v1/txt2img`;
    const { status, json } = await this.post(url, {
      prompt: req.prompt,
      negative_prompt: req.negativePrompt,
      width: req.width,
      height: req.height,
      steps: req.steps,
      seed: req.seed,
    });
    if (status !== 200) throw new Error(`txt2img HTTP ${status}`);
    const images = (json as { images?: unknown })?.images;
    const first: unknown = Array.isArray(images) ? images[0] : undefined;
    if (typeof first !== "string" || !first) throw new Error("txt2img: empty result");
    return first;
  }
}
