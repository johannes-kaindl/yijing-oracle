// A1111-kompatibler txt2img-Client (Draw Things, A1111, Forge, SD.Next).
// HTTP wird injiziert (httpPostJson aus http.ts) — obsidian-frei + in Node testbar,
// Muster wie ChatClient. Der Vertrag selbst liegt in core/image-backend.ts, damit ihn
// beide Backends (hier und core/comfy/client.ts) aus der pure-Schicht beziehen.
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { type HttpPostJson, type ImageBackend, type ImageRequest } from "../core/image-backend";

// Wiederausgang: hält die bestehenden Import-Pfade (view.ts) gültig.
export { type HttpPostJson, type ImageBackend, type ImageRequest };

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
      seed: req.seed,
      // steps === null → Feld weglassen, damit der Server seinen eigenen Default nimmt.
      ...(req.steps === null ? {} : { steps: req.steps }),
    });
    if (status !== 200) throw new Error(`txt2img HTTP ${status}`);
    const images = (json as { images?: unknown })?.images;
    const first: unknown = Array.isArray(images) ? images[0] : undefined;
    if (typeof first !== "string" || !first) throw new Error("txt2img: empty result");
    return first;
  }
}
