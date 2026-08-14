// ComfyUI-Backend: Workflow absenden, auf das Ergebnis warten, Bild holen. Pure
// (kein obsidian-Import) — der Transport wird injiziert, wie bei ChatClient/Txt2ImgClient.
//
// Arbeitsteilung mit dem WebSocket (obsidian/comfy-progress.ts): der Socket liefert NUR
// die Fortschrittsanzeige. Ob der Lauf gelang, steht in /history — dort ist auch der
// Fehlerfall vollständig abgebildet (status_str + messages, gemessen an ComfyUI 0.30.0).
// Fällt der Socket aus, verliert der Nutzer den Balken, nicht das Bild.
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { type ImageBackend, type ImageRequest } from "../image-backend";
import { inspectWorkflow, patchWorkflow, type ComfyGraph } from "./workflow";

export interface ComfyProgress {
  value: number;
  max: number;
}

export interface ComfyTransport {
  postJson: (url: string, body: unknown) => Promise<{ status: number; json: unknown }>;
  getJson: (url: string) => Promise<{ status: number; json: unknown }>;
  getBase64: (url: string) => Promise<{ status: number; base64: string }>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface ComfyOptions {
  /** Muss derselbe sein, mit dem der Progress-Socket verbunden ist. */
  clientId?: string;
  /** Gesamtdauer bis zum Abbruch. Default 10 min — ein Lauf dauert real Minuten
   *  (gemessen: 57 s für 6 Steps bei 512 px auf MPS). */
  timeoutMs?: number;
  pollMs?: number;
  onProgress?: (p: ComfyProgress) => void;
}

interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

function errorMessageFrom(json: unknown): string | null {
  const e = (json as { error?: { message?: string } })?.error;
  return typeof e?.message === "string" ? e.message : null;
}

/** Klartext aus status.messages ziehen — dort liegt bei einem Ausführungsfehler
 *  die eigentliche Ursache (OOM, fehlendes Modell, kaputter Node). */
function executionError(status: unknown): string {
  const messages = (status as { messages?: unknown[] })?.messages;
  if (!Array.isArray(messages)) return "execution failed";
  for (const m of messages) {
    if (!Array.isArray(m) || m[0] !== "execution_error") continue;
    const data = m[1] as { exception_message?: string } | undefined;
    if (typeof data?.exception_message === "string") return data.exception_message;
  }
  return "execution failed";
}

export class ComfyClient implements ImageBackend {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly pollMs: number;

  constructor(
    endpoint: string,
    private readonly workflowJson: string,
    private readonly transport: ComfyTransport,
    private readonly opts: ComfyOptions = {},
  ) {
    this.base = normalizeEndpoint(endpoint);
    this.timeoutMs = opts.timeoutMs ?? 600000;
    this.pollMs = opts.pollMs ?? 1000;
  }

  /** Einspeisepunkt für den Progress-Socket (obsidian-Schicht). */
  reportProgress(p: ComfyProgress): void {
    this.opts.onProgress?.(p);
  }

  async generate(req: ImageRequest): Promise<string> {
    const graph = this.parseWorkflow();
    const inspected = inspectWorkflow(graph);
    if (!inspected.ok) {
      throw new Error(`comfy: workflow unusable (${inspected.error.kind})`);
    }

    const patched = patchWorkflow(graph, inspected.slots, {
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      seed: req.seed,
      steps: req.steps,
      width: req.width,
      height: req.height,
    });

    const promptId = await this.submit(patched);
    const image = await this.waitForImage(promptId);
    return this.fetchImage(image);
  }

  private parseWorkflow(): ComfyGraph {
    if (!this.workflowJson.trim()) throw new Error("comfy: no workflow configured");
    try {
      return JSON.parse(this.workflowJson) as ComfyGraph;
    } catch {
      throw new Error("comfy: workflow is not valid JSON");
    }
  }

  private async submit(prompt: ComfyGraph): Promise<string> {
    const body: Record<string, unknown> = { prompt };
    if (this.opts.clientId) body.client_id = this.opts.clientId;

    const { status, json } = await this.transport.postJson(`${this.base}/prompt`, body);
    if (status !== 200) {
      throw new Error(errorMessageFrom(json) ?? `comfy: /prompt HTTP ${status}`);
    }
    const nodeErrors = (json as { node_errors?: Record<string, unknown> })?.node_errors;
    if (nodeErrors && Object.keys(nodeErrors).length > 0) {
      throw new Error(`comfy: workflow rejected — ${JSON.stringify(nodeErrors)}`);
    }
    const promptId = (json as { prompt_id?: unknown })?.prompt_id;
    if (typeof promptId !== "string") throw new Error("comfy: no prompt_id in response");
    return promptId;
  }

  private async waitForImage(promptId: string): Promise<ComfyImageRef> {
    const deadline = this.transport.now() + this.timeoutMs;

    for (;;) {
      const { json } = await this.transport.getJson(`${this.base}/history/${promptId}`);
      const entry = (json as Record<string, unknown>)?.[promptId] as
        | { status?: unknown; outputs?: Record<string, { images?: unknown[] }> }
        | undefined;

      if (entry) {
        const statusStr = (entry.status as { status_str?: string })?.status_str;
        if (statusStr === "error") throw new Error(`comfy: ${executionError(entry.status)}`);

        const image = this.firstImage(entry.outputs);
        if (image) return image;
      }

      if (this.transport.now() >= deadline) {
        throw new Error(`comfy: timeout after ${this.timeoutMs} ms`);
      }
      await this.transport.sleep(this.pollMs);
    }
  }

  private firstImage(outputs: Record<string, { images?: unknown[] }> | undefined): ComfyImageRef | null {
    for (const node of Object.values(outputs ?? {})) {
      for (const raw of node.images ?? []) {
        const img = raw as { filename?: unknown; subfolder?: unknown; type?: unknown };
        if (typeof img.filename !== "string") continue;
        // subfolder und type kommen AUS DER ANTWORT: ein Workflow mit PreviewImage statt
        // SaveImage legt das Bild unter type "temp" ab, nicht "output". Wer das fest
        // verdrahtet, bricht genau die Workflows, die keine Zweitkopie sammeln wollen.
        return {
          filename: img.filename,
          subfolder: typeof img.subfolder === "string" ? img.subfolder : "",
          type: typeof img.type === "string" ? img.type : "output",
        };
      }
    }
    return null;
  }

  private async fetchImage(img: ComfyImageRef): Promise<string> {
    const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    const { status, base64 } = await this.transport.getBase64(`${this.base}/view?${q.toString()}`);
    if (status !== 200) throw new Error(`comfy: /view HTTP ${status}`);
    if (!base64) throw new Error("comfy: empty image");
    return base64;
  }
}
