// Konfiguration, welche Wilhelm-Abschnitte in der Note als Callout gewickelt werden.
// Pure (kein obsidian). Genutzt von render.ts (Anwendung) und den Settings (UI).

export type CalloutSection = "overview" | "question" | "hexInfo" | "judgment" | "image" | "artwork" | "meaning" | "lines" | "notes";

export interface CalloutOption {
  enabled: boolean;
  /** Obsidian-Callout-Typ ohne Klammern, z.B. "quote", "note", "info". */
  type: string;
}

export type CalloutConfig = Record<CalloutSection, CalloutOption>;

export const CALLOUT_SECTIONS: CalloutSection[] = ["overview", "question", "hexInfo", "judgment", "image", "artwork", "meaning", "lines", "notes"];

export const DEFAULT_CALLOUTS: CalloutConfig = {
  overview: { enabled: true, type: "note" },
  question: { enabled: true, type: "question" },
  hexInfo: { enabled: true, type: "quote" },
  judgment: { enabled: true, type: "quote" },
  image: { enabled: true, type: "quote" },
  artwork: { enabled: true, type: "quote" },
  meaning: { enabled: true, type: "quote" },
  lines: { enabled: true, type: "quote" },
  notes: { enabled: true, type: "quote" },
};

/** Füllt eine (teilweise/veraltete) geladene Config gegen die Defaults auf — pro Sektion
 *  tief, damit neue Sektionen und fehlende Felder sauber ergänzt werden (shallow-Merge-Falle). */
export function mergeCallouts(
  loaded: Partial<Record<CalloutSection, Partial<CalloutOption>>> | undefined,
): CalloutConfig {
  const out = {} as CalloutConfig;
  for (const k of CALLOUT_SECTIONS) out[k] = { ...DEFAULT_CALLOUTS[k], ...(loaded?.[k] ?? {}) };
  return out;
}
