// vendored from obsidian-kit@0.70.0, src/pure/audio-provider.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Öffentlicher Vertrag des Fähigkeits-Besitzers `audio-interface` (Transkription + TTS) — Muster
 *  `pure/endpoint-source.ts`: EINE Quelle, der Besitzer re-exportiert sie, Konsumenten vendoren.
 *  Fehler sind Werte (`AudioProviderError`), Methoden fangen selbst — nie werfen.
 *
 *  **Form-Guard statt Versionskopie:** Ein Konsument prüft `isAudioProviderApi(x)`, nicht eine
 *  gespiegelte `apiVersion`-Konstante — eine Kopie altert unabhängig vom echten Anbieter und
 *  bleibt still grün, wenn sich der Vertrag ändert (LESSONS 2026-09-25, „llm-lab-Muster" — genau
 *  das soll dieser Vertrag NICHT wiederholen).
 *
 *  Die API abstrahiert über BACKENDS (mobil: Apple-Kurzbefehl, desktop: localhost-Dienst/Piper),
 *  nicht über die Brücke — ein Konsument merkt den Unterschied nie (Spec § Leitentscheidung). */
export const AUDIO_PROVIDER_API_VERSION = 1;

export type AudioProviderErrorCode = "backend-unavailable" | "not-found" | "timeout" | "busy" | "unsupported" | "failed";
export interface AudioProviderError { error: AudioProviderErrorCode; message: string }

export interface SpeakOptions {
  /** Vault-Zielordner (ohne Dateinamen) — die Endung wählt das Backend (z. B. `.caf` beim
   *  Kurzbefehl-Weg statt des naheliegenden `.m4a`). */
  targetFolder: string;
}

export interface AudioProviderApi {
  version: 1;
  /** Audio-Datei (Vault-relativer Pfad) → transkribierter Text. */
  transcribe(vaultPath: string): Promise<string | AudioProviderError>;
  /** Text → Vault-relativer Pfad der erzeugten Audio-Datei. */
  speak(text: string, opts: SpeakOptions): Promise<string | AudioProviderError>;
}

const METHODS = ["transcribe", "speak"] as const;

export function isAudioProviderApi(x: unknown): x is AudioProviderApi {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== AUDIO_PROVIDER_API_VERSION) return false;
  return METHODS.every((m) => typeof o[m] === "function");
}
