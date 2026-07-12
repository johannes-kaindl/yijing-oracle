// Reines Reading-Modell: aus 6 geworfenen Linien das Primär- und (bei wandelnden
// Linien) das Resultat-Hexagramm ableiten. Kennt keine Texte und kein Obsidian.
import { type Line, binary, binaryForKingWen, kingWen, lineState } from "./casting";

export interface Reading {
  lines: Line[];
  primaryBinary: string;
  primaryNumber: number;
  /** null wenn keine wandelnden Linien. */
  resultingBinary: string | null;
  resultingNumber: number | null;
  /** 1-basiert, von unten gezählt. Leer wenn keine. */
  changingPositions: number[];
  /** true wenn ALLE sechs Linien wandeln (Yong-Sonderfall bei Hex 1/2). */
  allChanging: boolean;
}

export function buildReading(lines: Line[]): Reading {
  if (lines.length !== 6) throw new Error(`Reading needs exactly 6 lines, got ${lines.length}`);

  const primaryBinary = binary(lines, false);
  const primaryNumber = kingWen(primaryBinary);
  if (primaryNumber === null) throw new Error(`Invalid hexagram binary: ${primaryBinary}`);

  const changingPositions = lines
    .map((l, i) => (lineState(l.value).changing ? i + 1 : 0))
    .filter((p) => p > 0);
  const hasChanging = changingPositions.length > 0;

  const resultingBinary = hasChanging ? binary(lines, true) : null;
  const resultingNumber = resultingBinary ? kingWen(resultingBinary) : null;
  if (resultingBinary && resultingNumber === null) {
    throw new Error(`Invalid resulting binary: ${resultingBinary}`);
  }

  return {
    lines,
    primaryBinary,
    primaryNumber,
    resultingBinary,
    resultingNumber,
    changingPositions,
    allChanging: changingPositions.length === 6,
  };
}

/** Rekonstruiert ein Reading aus (Primär-Nummer + wandelnden Positionen) — z.B. aus dem
 *  Frontmatter einer gespeicherten Reading-Note. Leitet die exakten Linien-Werte ab:
 *  yang+wandelnd → 9, yang+stabil → 7, yin+wandelnd → 6, yin+stabil → 8. */
export function reconstructReading(primaryNumber: number, changingPositions: number[]): Reading {
  const bin = binaryForKingWen(primaryNumber);
  if (!bin) throw new Error(`Unknown hexagram number: ${primaryNumber}`);
  const changing = new Set(changingPositions);
  const lines: Line[] = [...bin].map((c, i) => {
    const yang = c === "1";
    const isChanging = changing.has(i + 1);
    const value = isChanging ? (yang ? 9 : 6) : yang ? 7 : 8;
    return { value };
  });
  return buildReading(lines);
}
