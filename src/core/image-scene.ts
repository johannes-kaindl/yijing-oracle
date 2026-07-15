// Reine Szenen-Komposition für das Meditationsbild — Parity-Port von
// yijing/web/image-scene.js (Änderungen dort müssen hier nachgezogen werden).
// Ursprungs- und Zielmotiv werden zu EINEM natürlichsprachlichen Szenen-Satz
// mit räumlicher Relation verschmolzen; die Atmosphäre wählt der Frage-Hash
// deterministisch (gleiche Frage → gleiche Szene).

export const IMAGE_MODIFIERS = [
  "at dawn", "at dusk", "under a starry night sky", "in morning mist",
  "in autumn colors", "under falling snow", "in spring bloom",
  "in lush summer green", "in gentle rain", "under a clear blue sky",
  "in warm golden light", "under drifting clouds",
];

// Mood-Klassen: das Motiv trägt eine Atmosphäre, die ein unpassender Modifier
// invertieren würde (dunkle Schlucht „in warm golden light" liest sich sonnig).
// Kuratiert nach BILD-Atmosphäre der 64 Motive, nicht nach abstrakter Bedeutung.
export const DARK_HEXAGRAMS = new Set([12, 23, 29, 30, 36, 39, 41, 47, 55, 56, 59, 64]);
export const BRIGHT_HEXAGRAMS = new Set([2, 3, 9, 11, 14, 22, 24, 25, 31, 35, 42, 44, 46, 49, 54, 58]);

export const DARK_MODIFIERS = [
  "at dusk", "under a starry night sky", "in morning mist",
  "under falling snow", "in gentle rain", "in autumn colors",
  "under drifting clouds", "in deep shadow", "under a grey overcast sky",
];
export const BRIGHT_MODIFIERS = [
  "at dawn", "in spring bloom", "in lush summer green",
  "under a clear blue sky", "in warm golden light", "under drifting clouds",
];

// Hintergrund-Phrasierung statt Übergang („a giving way to b" ließ Bildgeneratoren
// das zweite Motiv fallen).
export const SCENE_RELATIONS: ((a: string, b: string) => string)[] = [
  (a, b) => `${a}, with ${b} in the background`,
  (a, b) => `${a}, ${b} small in the distance`,
  (a, b) => `${a}, ${b} on the horizon beyond`,
];

/** djb2 — stabil über Läufe/Geräte; rein lokal (kein Cross-File-Vertrag). */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export type Mood = "dark" | "bright" | "neutral";

export function moodFor(primaryNumber?: number): Mood {
  if (primaryNumber === undefined) return "neutral";
  return DARK_HEXAGRAMS.has(primaryNumber) ? "dark"
    : BRIGHT_HEXAGRAMS.has(primaryNumber) ? "bright"
    : "neutral";
}

export interface SceneInput {
  primaryMotif: string;
  resultingMotif: string;
  question: string;
  primaryNumber?: number;
}

export interface SceneResult {
  scene: string;
  motif: string;
  motif2: string;
  modifier: string;
  mood: Mood;
}

export function composeImageRequest({ primaryMotif, resultingMotif, question, primaryNumber }: SceneInput): SceneResult {
  const motif = (primaryMotif || "").trim() || "a still mountain lake";
  const motif2 = (resultingMotif || "").trim();
  const q = (question || "").trim();
  const h = q ? hashString(q) : 0;
  const mood = moodFor(primaryNumber);
  const pool = mood === "dark" ? DARK_MODIFIERS
    : mood === "bright" ? BRIGHT_MODIFIERS
    : IMAGE_MODIFIERS;
  const modifier = q ? pool[h % pool.length] : "in soft daylight";
  const base = motif2 ? SCENE_RELATIONS[h % SCENE_RELATIONS.length](motif, motif2) : motif;
  const scene = modifier ? `${base}, ${modifier}` : base;
  return { scene, motif, motif2, modifier, mood };
}

/** Finaler SD-Prompt: Szene + konfigurierbares Stil-Suffix. */
export function buildSdPrompt(scene: string, styleSuffix: string): string {
  const suffix = styleSuffix.trim();
  return suffix ? `${scene}, ${suffix}` : scene;
}
