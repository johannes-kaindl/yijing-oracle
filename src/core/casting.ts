// Drei-Münzen-Wurf + King-Wen-Lookup. 1:1-Port aus
// yijing/scripts/ios-app/OracleKit/Casting.swift (= web/app.js, = build_data.py).
// Die King-Wen-Tabelle ist damit die VIERTE kanonische Kopie — bewusst dupliziert
// (kein gemeinsames Package, siehe Spec §3/Ansatz A). Das Parity-Gate in
// tests/casting.test.ts prüft sie gegen data/hexagrams.json (spiegelt test-kingwen.mjs).

export interface Line {
  /** Wurfwert 6..9. 7|9 = yang, 6|9 = wandelnd. */
  value: number;
}

export interface LineState {
  yang: boolean;
  changing: boolean;
  /** Ziel-Bit im Resultat-Hexagramm (wandelnd flippt, stabil behält). */
  target: 0 | 1;
}

/** value 7|9 = yang; 6|9 = wandelnd; target-Bit (wandelnd flippt, stabil behält). */
export function lineState(value: number): LineState {
  const yang = value === 7 || value === 9;
  const changing = value === 6 || value === 9;
  const target: 0 | 1 = changing ? (yang ? 0 : 1) : yang ? 1 : 0;
  return { yang, changing, target };
}

/** RNG-Abstraktion: liefert 0 oder 1 (ein Münzwurf). Injizierbar für Tests. */
export type CoinRng = () => 0 | 1;

/** Standard-RNG: Math.random (window-agnostisch, läuft in Obsidian UND Node/vitest;
 *  für ein Orakel genügt die Qualität — wie in der Web-App). */
const defaultCoin: CoinRng = () => (Math.random() < 0.5 ? 0 : 1);

/** Drei Münzen → Wert 6..9 (Verteilung 1:3:3:1). */
export function tossLine(coin: CoinRng = defaultCoin): Line {
  let sum = 0;
  for (let i = 0; i < 3; i++) sum += coin();
  return { value: 6 + sum };
}

/** Sechs Linien; Index 0 = UNTERSTE Linie (bottom-up wie Web-App). */
export function cast(coin: CoinRng = defaultCoin): Line[] {
  return Array.from({ length: 6 }, () => tossLine(coin));
}

/** Unterste Linie ist Index 0; yang → "1". useTarget baut das Resultat-Hexagramm. */
export function binary(lines: Line[], useTarget = false): string {
  return lines
    .map((l) => {
      const st = lineState(l.value);
      return String(useTarget ? st.target : st.yang ? 1 : 0);
    })
    .join("");
}

/** Referenz-Figur für ein bekanntes Hexagramm: "1" → value 7, "0" → value 8. */
export function linesFromBinary(bin: string): Line[] {
  return [...bin].map((c) => ({ value: c === "1" ? 7 : 8 }));
}

export function kingWen(bin: string): number | null {
  return BINARY_TO_KING_WEN[bin] ?? null;
}

/** binary (unterste Linie = erstes Zeichen) → King-Wen-Nummer. Verbatim aus OracleKit. */
export const BINARY_TO_KING_WEN: Record<string, number> = {
  "111111": 1, "000000": 2, "100010": 3, "010001": 4, "111010": 5, "010111": 6, "010000": 7, "000010": 8,
  "111011": 9, "110111": 10, "111000": 11, "000111": 12, "101111": 13, "111101": 14, "001000": 15, "000100": 16,
  "100110": 17, "011001": 18, "110000": 19, "000011": 20, "100101": 21, "101001": 22, "000001": 23, "100000": 24,
  "100111": 25, "111001": 26, "100001": 27, "011110": 28, "010010": 29, "101101": 30, "001110": 31, "011100": 32,
  "001111": 33, "111100": 34, "000101": 35, "101000": 36, "101011": 37, "110101": 38, "010100": 39, "001010": 40,
  "110001": 41, "100011": 42, "111110": 43, "011111": 44, "000110": 45, "011000": 46, "010110": 47, "011010": 48,
  "101110": 49, "011101": 50, "100100": 51, "001001": 52, "001011": 53, "110100": 54, "101100": 55, "001101": 56,
  "011011": 57, "110110": 58, "010011": 59, "110010": 60, "110011": 61, "001100": 62, "101010": 63, "010101": 64,
};
