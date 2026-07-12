// Zhu-Xi-Linienregeln (Wilhelm/Baynes „Über die Befragung des Orakels").
// Port von /Users/Shared/code/yijing/web/ruling.js — pure, KEIN obsidian-Import.
// changingIndices: 0-basiert, Index 0 = unterste Linie. primaryNumber = King-Wen-Nr.
import { type Lang } from "./data";
import { type Reading } from "./reading";

export type RulingRule =
  | "judgment-primary" | "line-primary" | "lines-primary" | "judgments-both"
  | "lines-resulting" | "line-resulting" | "judgment-resulting" | "special-qian-kun";

export interface RulingResult {
  rule: RulingRule;
  lineIndices: number[];
  decisiveIndex: number | null;
  source: "primary" | "resulting" | "both";
}

/** Bestimmt, welcher kanonische Text nach klassischem Schema maßgeblich ist. */
export function rulingText(
  { primaryNumber, changingIndices }: { primaryNumber: number; changingIndices: number[] },
): RulingResult {
  const idx = [...(changingIndices || [])].sort((a, b) => a - b);
  const n = idx.length;
  const nonChanging = [0, 1, 2, 3, 4, 5].filter((i) => !idx.includes(i));
  switch (n) {
    case 0:
      return { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" };
    case 1:
      return { rule: "line-primary", lineIndices: [idx[0]], decisiveIndex: idx[0], source: "primary" };
    case 2: // beide Linien; die OBERE (höherer Index) entscheidet
      return { rule: "lines-primary", lineIndices: idx, decisiveIndex: idx[1], source: "primary" };
    case 3: // Urteile von Primär + Zielbild; Primär maßgeblich
      return { rule: "judgments-both", lineIndices: [], decisiveIndex: null, source: "both" };
    case 4: // die zwei NICHT-wandelnden Linien des ZIELBILDS; untere entscheidet
      return { rule: "lines-resulting", lineIndices: nonChanging, decisiveIndex: nonChanging[0], source: "resulting" };
    case 5: // die eine nicht-wandelnde Linie des ZIELBILDS
      return { rule: "line-resulting", lineIndices: nonChanging, decisiveIndex: nonChanging[0], source: "resulting" };
    case 6:
      if (primaryNumber === 1 || primaryNumber === 2) // Qian/Kun: „Anwendung der Neun/Sechs" (7. Eintrag)
        return { rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" };
      return { rule: "judgment-resulting", lineIndices: [], decisiveIndex: null, source: "resulting" };
    default: // defensiv (>6 unmöglich): auf Primär-Urteil zurückfallen
      return { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" };
  }
}

interface RulingStrings { label: string; rules: Record<RulingRule, string>; }

const RULING_TEXT: Record<Lang, RulingStrings> = {
  de: {
    label: "Maßgeblich nach Tradition",
    rules: {
      "judgment-primary": "Keine wandelnde Linie — das Urteil des Hexagramms ist maßgeblich.",
      "line-primary": "Eine wandelnde Linie — ihr Text ist maßgeblich.",
      "lines-primary": "Zwei wandelnde Linien — beide gelten, die obere entscheidet.",
      "judgments-both": "Drei wandelnde Linien — die Urteile von Ursprungs- und Zielbild gelten, das Ursprungsurteil führt.",
      "lines-resulting": "Vier wandelnde Linien — die beiden ruhenden Linien des Zielbilds gelten, die untere entscheidet.",
      "line-resulting": "Fünf wandelnde Linien — die eine ruhende Linie des Zielbilds ist maßgeblich.",
      "judgment-resulting": "Sechs wandelnde Linien — das Urteil des Zielbilds ist maßgeblich.",
      "special-qian-kun": "Sechs wandelnde Linien — es gilt der Sonderspruch zur Anwendung der Neun bzw. der Sechs.",
    },
  },
  en: {
    label: "Decisive by tradition",
    rules: {
      "judgment-primary": "No moving line — the hexagram's judgment is decisive.",
      "line-primary": "One moving line — its text is decisive.",
      "lines-primary": "Two moving lines — both apply; the upper one decides.",
      "judgments-both": "Three moving lines — the judgments of the primary and resulting hexagrams apply; the primary leads.",
      "lines-resulting": "Four moving lines — the two resting lines of the resulting hexagram apply; the lower decides.",
      "line-resulting": "Five moving lines — the single resting line of the resulting hexagram is decisive.",
      "judgment-resulting": "Six moving lines — the judgment of the resulting hexagram is decisive.",
      "special-qian-kun": "Six moving lines — the special text “use of the nine/six” applies.",
    },
  },
};

/** Reading → fertiger maßgeblich-Satz in der Reading-Sprache (Label + Text + Rohergebnis). */
export function rulingSentence(reading: Reading, lang: Lang): { label: string; text: string; result: RulingResult } {
  const result = rulingText({
    primaryNumber: reading.primaryNumber,
    changingIndices: reading.changingPositions.map((p) => p - 1),
  });
  const s = RULING_TEXT[lang];
  return { label: s.label, text: s.rules[result.rule], result };
}
