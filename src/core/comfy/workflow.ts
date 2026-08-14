// ComfyUI-Workflow im API-Format lesen und patchen. Pure (kein obsidian-Import).
//
// Der Nutzer hinterlegt einen aus ComfyUI exportierten Graphen; wir finden darin die
// Einfügestellen über die explizite Node-Verlinkung (`"positive": ["6", 0]`), nicht über
// Klassennamen oder Konventionen. Damit trägt derselbe Code SDXL-, Flux- und
// Z-Image-Turbo-Workflows, die strukturell verschieden sind (SDXL lädt Modell/CLIP/VAE
// gemeinsam über CheckpointLoaderSimple, Z-Image-Turbo getrennt über UNETLoader +
// CLIPLoader + VAELoader).

export interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
}
export type ComfyGraph = Record<string, ComfyNode>;

export interface WorkflowSlots {
  sampler: string;
  positive: string;
  negative: string;
  latent: string;
  /** Variiert je Sampler: KSampler → "seed", KSamplerAdvanced/SamplerCustom → "noise_seed". */
  seedField: "seed" | "noise_seed";
  /** null = dieser Sampler kennt kein Steps-Feld (z. B. SamplerCustom via sigmas). */
  stepsField: "steps" | null;
}

export type InspectError =
  | { kind: "not-an-object" }
  | { kind: "no-sampler" }
  | { kind: "ambiguous-sampler"; ids: string[] }
  | { kind: "dangling-ref"; field: string; id: string };

export type InspectResult =
  | { ok: true; slots: WorkflowSlots }
  | { ok: false; error: InspectError };

const LINK_FIELDS = ["positive", "negative", "latent_image"] as const;

function isNode(v: unknown): v is ComfyNode {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Partial<ComfyNode>;
  return typeof n.class_type === "string" && typeof n.inputs === "object" && n.inputs !== null;
}

/** Ein Verweis im API-Format ist [nodeId, outputIndex]. */
function refTarget(v: unknown): string | null {
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
}

export function inspectWorkflow(graph: unknown): InspectResult {
  if (typeof graph !== "object" || graph === null || Array.isArray(graph)) {
    return { ok: false, error: { kind: "not-an-object" } };
  }
  const nodes = graph as Record<string, unknown>;

  // Sampler = der Node, der positive, negative UND latent_image entgegennimmt. Bewusst
  // ohne Klassennamen-Liste: KSampler, KSamplerAdvanced und SamplerCustom erfüllen das
  // gleichermaßen (gemessen an ComfyUI 0.30.0), ebenso künftige Varianten.
  const candidates = Object.keys(nodes).filter((id) => {
    const n = nodes[id];
    return isNode(n) && LINK_FIELDS.every((f) => f in n.inputs);
  });

  if (candidates.length === 0) return { ok: false, error: { kind: "no-sampler" } };
  if (candidates.length > 1) {
    return { ok: false, error: { kind: "ambiguous-sampler", ids: candidates } };
  }

  const samplerId = candidates[0];
  const sampler = nodes[samplerId] as ComfyNode;

  const resolved: Record<string, string> = {};
  for (const field of LINK_FIELDS) {
    const target = refTarget(sampler.inputs[field]);
    if (target === null || !isNode(nodes[target])) {
      return { ok: false, error: { kind: "dangling-ref", field, id: String(target ?? "") } };
    }
    resolved[field] = target;
  }

  return {
    ok: true,
    slots: {
      sampler: samplerId,
      positive: resolved.positive,
      negative: resolved.negative,
      latent: resolved.latent_image,
      // Feldnamen AM NODE ablesen, nicht annehmen: ein blind gesetztes `seed` legte bei
      // KSamplerAdvanced ein neues, unbenutztes Feld an — das Bild käme, wäre aber bei
      // jedem Wurf identisch. Ein stiller Fehler, der erst beim Vergleich auffällt.
      seedField: "noise_seed" in sampler.inputs ? "noise_seed" : "seed",
      stepsField: "steps" in sampler.inputs ? "steps" : null,
    },
  };
}

export interface PatchValues {
  prompt: string;
  negativePrompt: string;
  seed: number;
  /** null = Steps aus dem Workflow übernehmen. */
  steps: number | null;
  width: number;
  height: number;
}

/** Setzt die Reading-Werte in eine **Kopie** des Graphen. Alles, was nicht in `slots`
 *  benannt ist, bleibt unverändert — Sampler-Name, Scheduler, CFG, LoRAs und Upscaler
 *  gehören dem Nutzer und sind bewusst nicht konfigurierbar. */
export function patchWorkflow(graph: ComfyGraph, slots: WorkflowSlots, v: PatchValues): ComfyGraph {
  const out = JSON.parse(JSON.stringify(graph)) as ComfyGraph;

  out[slots.positive].inputs.text = v.prompt;
  out[slots.negative].inputs.text = v.negativePrompt;
  out[slots.sampler].inputs[slots.seedField] = v.seed;

  if (v.steps !== null && slots.stepsField !== null) {
    out[slots.sampler].inputs[slots.stepsField] = v.steps;
  }

  // Nicht jeder Latent-Node hat Maße (LatentFromBatch, LatentUpscale mit Verweis).
  // Ein blind gesetztes width/height legte dort ein totes Feld an.
  const latent = out[slots.latent].inputs;
  if ("width" in latent) latent.width = v.width;
  if ("height" in latent) latent.height = v.height;

  return out;
}
