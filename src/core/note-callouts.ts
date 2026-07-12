// Konfiguration, welche Wilhelm-Abschnitte in der Note als Callout gewickelt werden.
// Pure (kein obsidian). Genutzt von render.ts (Anwendung) und den Settings (UI).

export type CalloutSection = "hexInfo" | "judgment" | "image" | "meaning" | "lines";

export interface CalloutOption {
  enabled: boolean;
  /** Obsidian-Callout-Typ ohne Klammern, z.B. "quote", "note", "info". */
  type: string;
}

export type CalloutConfig = Record<CalloutSection, CalloutOption>;

export const CALLOUT_SECTIONS: CalloutSection[] = ["hexInfo", "judgment", "image", "meaning", "lines"];

export const DEFAULT_CALLOUTS: CalloutConfig = {
  hexInfo: { enabled: true, type: "quote" },
  judgment: { enabled: true, type: "quote" },
  image: { enabled: true, type: "quote" },
  meaning: { enabled: true, type: "quote" },
  lines: { enabled: true, type: "quote" },
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
