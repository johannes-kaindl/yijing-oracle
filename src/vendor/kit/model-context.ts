// vendored from obsidian-kit#0.7.0, src/pure/model-context.ts
export interface ModelContext {
  maxContextLength?: number;
  loadedContextLength?: number;
}

function findById(json: unknown, model: string): Record<string, unknown> | null {
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const hit = (data as unknown[]).find((x) => (x as { id?: unknown }).id === model);
  return (hit as Record<string, unknown> | undefined) ?? null;
}

/** LM Studio GET /api/v0/models → per-Modell-Kontextlängen. null wenn Modell fehlt. */
export function parseLmStudioContext(json: unknown, model: string): ModelContext | null {
  const m = findById(json, model);
  if (!m) return null;
  const out: ModelContext = {};
  if (typeof m.max_context_length === "number") out.maxContextLength = m.max_context_length;
  if (typeof m.loaded_context_length === "number") out.loadedContextLength = m.loaded_context_length;
  return out;
}

/** Ollama POST /api/show → model_info hält "<arch>.context_length". null wenn nicht vorhanden. */
export function parseOllamaContext(json: unknown): ModelContext | null {
  const info = (json as { model_info?: unknown }).model_info;
  if (!info || typeof info !== "object") return null;
  for (const [k, v] of Object.entries(info as Record<string, unknown>)) {
    if (k.endsWith(".context_length") && typeof v === "number") return { maxContextLength: v };
  }
  return null;
}
