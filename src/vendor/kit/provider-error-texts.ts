// vendored from obsidian-kit@0.72.0, src/pure/provider-error-texts.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Fehlertexte (EN/DE) zu den Fehlercodes der Fähigkeits-Verträge `image-gen-provider`, `ocr-provider` und `audio-provider`, neben deren Typen.
 *
 *  Die Verträge nennen einen Code und eine Meldung des Anbieters; was der Nutzer liest, bauten die Konsumenten selbst, und zwar
 *  verschieden: koda-agent (`describeImageGenError`, `describeOcrError`) setzte je Code einen deutschen Satz davor, yijing-oracle zeigte für
 *  jeden Code „Bildgenerierung fehlgeschlagen: …“ — `busy` (später erneut versuchen) und `backend-unavailable` (Anbieter einschalten) waren dort
 *  für den Nutzer nicht zu unterscheiden. Kein Unterschied hatte einen Grund außer dem Stand des jeweiligen Plugins: es war Drift, keine
 *  Abstraktionsgrenze (Dach-AGENTS § Kit-first Punkt 3). Übernommen ist die reichere Fassung von koda, Code für Code; die Meldung des Anbieters
 *  hängt hinten an, so wie koda sie zeigte.
 *
 *  Reine Funktionen, ohne `obsidian`-Import. Die Sprache ist ein Kürzel (`"de"`, `"de-AT"` → Deutsch, alles andere Englisch). Ein Code, den
 *  dieses Kit nicht kennt (ein neuerer Anbieter), fällt auf den Text zu `failed` — mit der Meldung des Anbieters, die den Grund trägt. */
import type { ImageGenProviderError, ImageGenProviderErrorCode } from "./image-gen-provider";
import type { OcrProviderError, OcrProviderErrorCode } from "./ocr-provider";
import type { AudioProviderError, AudioProviderErrorCode } from "./audio-provider";

type Lang = "en" | "de";
const langOf = (lang: string | undefined): Lang => (lang !== undefined && lang.toLowerCase().startsWith("de") ? "de" : "en");

export const IMAGE_GEN_ERROR_TEXTS: Record<Lang, Record<ImageGenProviderErrorCode, string>> = {
  en: {
    "backend-unavailable": "Image generation isn't available",
    timeout: "Image generation took too long",
    busy: "Image generation is busy, try again later",
    refused: "Image generation refused the request",
    failed: "Image generation failed",
  },
  de: {
    "backend-unavailable": "Bildgenerierung nicht verfügbar",
    timeout: "Bildgenerierung hat zu lange gebraucht",
    busy: "Bildgenerierung ist beschäftigt, später erneut versuchen",
    refused: "Bildgenerierung hat den Auftrag abgelehnt",
    failed: "Bildgenerierung fehlgeschlagen",
  },
};

export const OCR_ERROR_TEXTS: Record<Lang, Record<OcrProviderErrorCode, string>> = {
  en: {
    "backend-unavailable": "Text recognition isn't available",
    "not-found": "Image not found",
    timeout: "Text recognition took too long",
    busy: "Text recognition is busy, try again later",
    unsupported: "Text recognition can't read this image format",
    failed: "Text recognition failed",
  },
  de: {
    "backend-unavailable": "Texterkennung nicht verfügbar",
    "not-found": "Bild nicht gefunden",
    timeout: "Texterkennung hat zu lange gebraucht",
    busy: "Texterkennung ist beschäftigt, später erneut versuchen",
    unsupported: "Dieses Bildformat liest die Texterkennung nicht",
    failed: "Texterkennung fehlgeschlagen",
  },
};

/** Audio (Transkription und Sprachausgabe, `audio-provider`) hat dieselben sechs Codes wie die Texterkennung. Anders als bei Bild und OCR gab es hier keine
 *  Konsumentenfassung zum Übernehmen — die Sätze sind nach dem Muster von `OCR_ERROR_TEXTS` neu, auf Wunsch des Masters (Welle 24) „Bibliothek ab Eins“. */
export const AUDIO_ERROR_TEXTS: Record<Lang, Record<AudioProviderErrorCode, string>> = {
  en: {
    "backend-unavailable": "Audio processing isn't available",
    "not-found": "Audio file not found",
    timeout: "Audio processing took too long",
    busy: "Audio processing is busy, try again later",
    unsupported: "This audio format isn't supported",
    failed: "Audio processing failed",
  },
  de: {
    "backend-unavailable": "Audioverarbeitung nicht verfügbar",
    "not-found": "Audiodatei nicht gefunden",
    timeout: "Audioverarbeitung hat zu lange gebraucht",
    busy: "Audioverarbeitung ist beschäftigt, später erneut versuchen",
    unsupported: "Dieses Audioformat wird nicht unterstützt",
    failed: "Audioverarbeitung fehlgeschlagen",
  },
};

const compose = (head: string, message: string): string => (message.trim() === "" ? head : `${head}: ${message}`);

/** Der Text zu einem Fehler der Bildgenerierung: Satz je Code, dahinter die Meldung des Anbieters (fehlt sie, bleibt der Satz allein). */
export function imageGenErrorText(e: ImageGenProviderError, lang?: string): string {
  const table = IMAGE_GEN_ERROR_TEXTS[langOf(lang)];
  return compose(table[e.error] ?? table.failed, e.message);
}

/** Der Text zu einem Fehler der Texterkennung, wie `imageGenErrorText`. */
export function ocrErrorText(e: OcrProviderError, lang?: string): string {
  const table = OCR_ERROR_TEXTS[langOf(lang)];
  return compose(table[e.error] ?? table.failed, e.message);
}

/** Der Text zu einem Fehler der Audioverarbeitung, wie `imageGenErrorText`. */
export function audioErrorText(e: AudioProviderError, lang?: string): string {
  const table = AUDIO_ERROR_TEXTS[langOf(lang)];
  return compose(table[e.error] ?? table.failed, e.message);
}
