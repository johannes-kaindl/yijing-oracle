// Typisierter Zugriff auf die gebundelten Hexagramm-Daten. Löst (Sprache × Register)
// zu fertigen Strings auf, damit render.ts nur noch komponiert. Rein (kein Obsidian).
//
// Feld-Matrix (siehe Spec §5):
//   logisch      de/classic          de/neutral            en/classic     en/neutral
//   judgment     judgment            judgment_neutral      judgment_en    judgment_en_neutral
//   image        image               image_neutral         image_en       image_en_neutral
//   line.text    lines[].text        (kein neutral)        lines[].text_en (kein neutral)
//   line.interp  interpretation      interpretation_neutral interpretation_en  interpretation_en_neutral
// Fehlende neutral/en-Varianten fallen sauber auf ihre Basis zurück.
import hexDeRaw from "../data/hexagrams.json";
import hexEnRaw from "../data/hexagrams.en.json";

export type Lang = "de" | "en";
export type Register = "classic" | "neutral";

interface RawLine {
  position: string;
  position_en?: string;
  text: string;
  text_en?: string;
  interpretation: string;
  interpretation_neutral?: string;
  interpretation_en?: string;
  interpretation_en_neutral?: string;
}

interface RawTrigram {
  symbol: string;
  name: string;
  pinyin: string;
  family: string;
  nature: string;
}

interface RawHex {
  number: number;
  binary: string;
  unicode: string;
  name_de: string;
  name_latin: string;
  name_chinese: string;
  pinyin: string;
  name_en?: string;
  trigrams: { above: RawTrigram; below: RawTrigram };
  meaning: string;
  meaning_neutral?: string;
  meaning_en?: string;
  meaning_en_neutral?: string;
  judgment: string;
  judgment_neutral?: string;
  judgment_en?: string;
  judgment_en_neutral?: string;
  image: string;
  image_neutral?: string;
  image_en?: string;
  image_en_neutral?: string;
  lines: RawLine[];
}

// Die JSONs werden von esbuild (Prod) bzw. vitest (Test) als Module geladen; der Cast
// vermeidet, dass TS den 700-KB-Literaltyp propagiert.
const HEX_DE = hexDeRaw as unknown as RawHex[];
const HEX_EN = hexEnRaw as unknown as RawHex[];

export interface HexLine {
  position: string;
  text: string;
  interpretation: string;
}

export interface TrigramInfo {
  symbol: string;
  name: string;
  pinyin: string;
  /** Familien-Rolle (nur deutsch im Datensatz, z.B. „mittlerer Sohn"). */
  family: string;
  /** Naturbild (nur deutsch, z.B. „Wasser"). */
  nature: string;
}

export interface HexagramData {
  number: number;
  binary: string;
  unicode: string;
  nameLocal: string;
  nameLatin: string;
  nameChinese: string;
  pinyin: string;
  judgment: string;
  image: string;
  /** Interpretierender Kommentar (Wilhelm); sprachabhängig, kann leer sein. */
  meaning: string;
  trigrams: { above: TrigramInfo; below: TrigramInfo };
  /** 6 Linien, bei Hex 1/2 zusätzlich der Yong-Text an Index 6. */
  lines: HexLine[];
}

function pickTrigram(raw: RawTrigram): TrigramInfo {
  return { symbol: raw.symbol, name: raw.name, pinyin: raw.pinyin, family: raw.family, nature: raw.nature };
}

/** Bedeutung (meaning) mit Sprache × Register: neutral fällt auf classic zurück. */
function pickMeaning(raw: RawHex, lang: Lang, register: Register): string {
  if (lang === "de") {
    return ((register === "neutral" && raw.meaning_neutral) || raw.meaning) ?? "";
  }
  const en = raw.meaning_en ?? raw.meaning;
  return ((register === "neutral" && raw.meaning_en_neutral) || en) ?? "";
}

function pickField(raw: RawHex, base: "judgment" | "image", lang: Lang, register: Register): string {
  if (lang === "de") {
    const neutral = raw[`${base}_neutral`];
    return register === "neutral" && neutral ? neutral : raw[base];
  }
  const en = raw[`${base}_en`] ?? raw[base];
  const enNeutral = raw[`${base}_en_neutral`];
  return register === "neutral" && enNeutral ? enNeutral : en;
}

function pickLine(rl: RawLine, lang: Lang, register: Register): HexLine {
  if (lang === "de") {
    return {
      position: rl.position,
      text: rl.text,
      interpretation: (register === "neutral" && rl.interpretation_neutral) || rl.interpretation,
    };
  }
  const interpEn = rl.interpretation_en ?? rl.interpretation;
  return {
    position: rl.position_en ?? rl.position,
    text: rl.text_en ?? rl.text,
    interpretation: (register === "neutral" && rl.interpretation_en_neutral) || interpEn,
  };
}

export function getHexagram(number: number, lang: Lang, register: Register): HexagramData {
  const src = lang === "de" ? HEX_DE : HEX_EN;
  const raw = src.find((h) => h.number === number);
  if (!raw) throw new Error(`Hexagram ${number} not found in ${lang} data`);

  return {
    number: raw.number,
    binary: raw.binary,
    unicode: raw.unicode,
    nameLocal: lang === "en" ? raw.name_en ?? raw.name_de : raw.name_de,
    nameLatin: raw.name_latin,
    nameChinese: raw.name_chinese,
    pinyin: raw.pinyin,
    judgment: pickField(raw, "judgment", lang, register),
    image: pickField(raw, "image", lang, register),
    meaning: pickMeaning(raw, lang, register),
    trigrams: { above: pickTrigram(raw.trigrams.above), below: pickTrigram(raw.trigrams.below) },
    lines: raw.lines.map((rl) => pickLine(rl, lang, register)),
  };
}
