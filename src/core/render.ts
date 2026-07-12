// Reines Rendering: Reading + Hexagramm-Daten → Frontmatter + Markdown-Body.
// Berührt NIE eine Datei (das macht reading-writer.ts) und nutzt NICHT die globale
// UI-i18n — die Sektions-Labels hängen an der SPRACHE DES READINGS (kann von der
// UI-Sprache abweichen), darum ein eigenes, kleines Label-Set hier.
import { type Reading } from "./reading";
import { getHexagram, type HexagramData, type HexLine, type Lang, type Register, type TrigramInfo } from "./data";
import { type FrontmatterField, buildFrontmatter } from "./frontmatter";
import { MARKER_START, MARKER_END } from "./llm/insert";
import { wrapCallout } from "./llm/callout";
import { type CalloutConfig, type CalloutOption, DEFAULT_CALLOUTS } from "./note-callouts";
import { rulingSentence } from "./ruling";

export interface RenderOptions {
  lang: Lang;
  register: Register;
  /** ISO-nahe Zeitmarke, von der obsidian-Schicht geliefert (render bleibt uhr-frei). */
  date: string;
  question?: string;
  /** false → gar kein Frontmatter (leerer frontmatter-String). */
  includeFrontmatter: boolean;
  /** Welche Keys unter welchem Namen ins Frontmatter. */
  frontmatterFields: FrontmatterField[];
  /** Callout-Wrapping pro Abschnitt (Default: alle an, quote). */
  callouts?: CalloutConfig;
  /** Wilhelms Fußnoten als Anmerkungen-Abschnitt anhängen (Default via caller). */
  includeNotes?: boolean;
}

export interface RenderedReading {
  /** H1-Text ohne führendes "# " — auch Basis für den Dateinamen. */
  title: string;
  /** YAML-Innentext ohne "---"-Zäune. */
  frontmatter: string;
  /** Voller Markdown ab "# …" (ohne Frontmatter) — für Note UND Cursor-Einfügung. */
  body: string;
  /** Wie body, aber OHNE H1-Titel + Untertitel — für die Panel-Vorschau, wo die
   *  Kopfzeile (Figur + Namen) den Titel bereits trägt (kein Doppel). */
  previewBody: string;
}

interface Labels {
  origin: string;
  target: string;
  judgment: string;
  image: string;
  meaning: string;
  changes: string;
  changingLines: string;
  question: string;
  overview: string;
  trigrams: string;
  decisive: string;
  no: string;
  upperTrigram: string;
  lowerTrigram: string;
  notesHead: string;
  line: string;
  attribution: string;
}

const LABELS: Record<Lang, Labels> = {
  de: {
    origin: "Ursprungsbild",
    target: "Zielbild",
    judgment: "Das Urteil",
    image: "Das Bild",
    meaning: "Bedeutung",
    changes: "Wandelnde Linien",
    changingLines: "wandelnde Linien",
    question: "Frage",
    overview: "Überblick",
    trigrams: "Trigramme",
    decisive: "maßgeblich",
    no: "Nr.",
    upperTrigram: "Oberes Trigramm",
    lowerTrigram: "Unteres Trigramm",
    notesHead: "Anmerkungen",
    line: "Linie",
    attribution: "*Text: Richard Wilhelm — I Ging, Das Buch der Wandlungen.*",
  },
  en: {
    origin: "Primary Hexagram",
    target: "Resulting Hexagram",
    judgment: "The Judgment",
    image: "The Image",
    meaning: "Meaning",
    changes: "Changing Lines",
    changingLines: "changing lines",
    question: "Question",
    overview: "Overview",
    trigrams: "Trigrams",
    decisive: "decisive",
    no: "No.",
    upperTrigram: "Upper trigram",
    lowerTrigram: "Lower trigram",
    notesHead: "Notes",
    line: "Line",
    attribution: "*Text: Richard Wilhelm — I Ching, The Book of Changes.*",
  },
};

/** Übersetzt einen Fußnoten-Anchor ("judgment"/"image"/"line:N") in ein Label. */
function anchorLabel(anchor: string, L: Labels): string {
  if (anchor === "judgment") return L.judgment;
  if (anchor === "image") return L.image;
  const m = /^line:(\d+)$/.exec(anchor);
  if (m) return `${L.line} ${m[1]}`;
  return anchor;
}

function heading(unicode: string, number: number, nameLocal: string): string {
  return `${unicode} ${number} · ${nameLocal}`;
}

/** Ein Abschnitt: als Callout gewickelt (enabled) oder als schlichte ### -Überschrift. */
function section(title: string, body: string, cfg: CalloutOption): string {
  return cfg.enabled ? wrapCallout(title, body, cfg.type, false) : `### ${title}\n\n${body}`;
}

/** Eine Trigramm-Zeile: Symbol · Name (Pinyin) — Familie, Natur (Deskriptoren nur DE). */
function trigramLine(label: string, tri: TrigramInfo, lang: Lang): string {
  const base = `${tri.symbol} ${tri.name} (${tri.pinyin})`;
  const desc = lang === "de" && (tri.family || tri.nature) ? ` — ${[tri.family, tri.nature].filter(Boolean).join(", ")}` : "";
  return `- ${label}: ${base}${desc}`;
}

/** H2-Titeltext eines Hexagramm-Abschnitts: Figur · Nr · Namen. */
function hexHeading(h: HexagramData, L: Labels): string {
  return `${h.unicode} ${L.no} ${h.number} — ${h.nameChinese} ${h.pinyin} · ${h.nameLatin} — ${h.nameLocal}`;
}

/** Trigramm-Block eines Hexagramms (der Name steht schon in der H2): nur obere/untere Trigramm-Zeile. */
function hexInfoBlock(h: HexagramData, L: Labels, lang: Lang, cfg: CalloutOption): string {
  const bullets = [trigramLine(L.upperTrigram, h.trigrams.above, lang), trigramLine(L.lowerTrigram, h.trigrams.below, lang)].join("\n");
  return cfg.enabled ? wrapCallout(L.trigrams, bullets, cfg.type, false) : bullets;
}

/** Eine wandelnde Linie als Unterabschnitt (####): Positions-Titel (+ „· maßgeblich") + Text (+ Deutung). */
function lineSection(line: HexLine, cfg: CalloutOption, decisive: boolean, L: Labels): string {
  const title = decisive ? `${line.position} · ${L.decisive}` : line.position;
  const body = [line.text.trim(), line.interpretation?.trim()].filter(Boolean).join("\n\n");
  return cfg.enabled ? wrapCallout(title, body, cfg.type, false) : `#### ${title}\n\n${body}`;
}

/** Überblick-Block: Hexagramm-Paar (+ Pfeil bei Wandlung), wandelnde Linien, maßgeblich-Satz. */
function overviewBlock(
  reading: Reading,
  primary: HexagramData,
  resulting: HexagramData | null,
  L: Labels,
  ruling: { label: string; text: string },
  cfg: CalloutOption,
): string {
  const pair = resulting
    ? `${primary.unicode} ${L.no} ${primary.number} ${primary.nameLocal}  →  ${resulting.unicode} ${L.no} ${resulting.number} ${resulting.nameLocal}`
    : `${primary.unicode} ${L.no} ${primary.number} ${primary.nameLocal}`;
  const rest: string[] = [];
  if (reading.changingPositions.length > 0) rest.push(`**${L.changes}:** ${reading.changingPositions.join(", ")}`);
  rest.push(`**${ruling.label}:** ${ruling.text}`);
  return cfg.enabled
    ? wrapCallout(pair, rest.join("\n"), cfg.type, false)
    : `### ${L.overview}\n\n${[pair, ...rest].join("\n\n")}`;
}

export function renderReading(reading: Reading, opts: RenderOptions): RenderedReading {
  const L = LABELS[opts.lang];
  const primary = getHexagram(reading.primaryNumber, opts.lang, opts.register);
  const title = heading(primary.unicode, primary.number, primary.nameLocal);
  const question = opts.question?.trim() ?? "";

  // ── Frontmatter ────────────────────────────────────────────────────────
  const frontmatter = opts.includeFrontmatter
    ? buildFrontmatter(opts.frontmatterFields, {
        date: opts.date,
        question,
        hexagram: reading.primaryNumber,
        changingLines: reading.changingPositions,
        resulting: reading.resultingNumber,
        language: opts.lang,
        register: opts.register,
      })
    : "";

  // ── Body ───────────────────────────────────────────────────────────────
  const cal = opts.callouts ?? DEFAULT_CALLOUTS;
  const resulting = reading.resultingNumber !== null ? getHexagram(reading.resultingNumber, opts.lang, opts.register) : null;
  const ruling = rulingSentence(reading, opts.lang);

  const titleLine = `# ${title}`;
  const subtitleLine = `> ${[primary.nameLatin, primary.nameChinese, primary.pinyin].filter(Boolean).join(" · ")}`;

  // ── Kopf: Titel · Untertitel · Frage · Überblick ────────────────────────
  const head: string[] = [titleLine, subtitleLine];
  if (question) {
    head.push(cal.question.enabled ? wrapCallout(L.question, question, cal.question.type, true) : `**${L.question}:** ${question}`);
  }
  head.push(overviewBlock(reading, primary, resulting, L, ruling, cal.overview));

  const content: string[] = [];

  // ── Ursprungsbild (mit seinen wandelnden Linien) ────────────────────────
  content.push(`## ${L.origin} — ${hexHeading(primary, L)}`);
  content.push(hexInfoBlock(primary, L, opts.lang, cal.hexInfo));
  content.push(section(L.judgment, primary.judgment.trim(), cal.judgment));
  content.push(section(L.image, primary.image.trim(), cal.image));
  if (primary.meaning.trim()) content.push(section(L.meaning, primary.meaning.trim(), cal.meaning));

  if (reading.changingPositions.length > 0) {
    content.push(`### ${L.changes}`);
    // Nur wenn die maßgebliche Stelle eine Ursprungslinie ist (n=1, n=2→obere, Yong).
    const dec = ruling.result.source === "primary" ? ruling.result.decisiveIndex : null;

    // Yong-Sonderfall: alle sechs wandeln bei Hex 1/2 → der 7. Text (Index 6).
    if (reading.allChanging && primary.lines.length > 6) {
      content.push(lineSection(primary.lines[6], cal.lines, dec === 6, L));
    } else {
      for (const pos of reading.changingPositions) {
        content.push(lineSection(primary.lines[pos - 1], cal.lines, dec === pos - 1, L));
      }
    }

    // ── Zielbild ─────────────────────────────────────────────────────────
    if (resulting) {
      content.push(`## ${L.target} — ${hexHeading(resulting, L)}`);
      content.push(hexInfoBlock(resulting, L, opts.lang, cal.hexInfo));
      content.push(section(L.judgment, resulting.judgment.trim(), cal.judgment));
      content.push(section(L.image, resulting.image.trim(), cal.image));
    }
  }

  // ── Anmerkungen (Wilhelms Fußnoten) ────────────────────────────────────
  if (opts.includeNotes && primary.notes.length > 0) {
    content.push(`## ${L.notesHead}`);
    for (const n of primary.notes) {
      content.push(section(anchorLabel(n.anchor, L), n.text.trim(), cal.notes));
    }
  }

  // ── Quellenangabe ──────────────────────────────────────────────────────
  content.push("---", L.attribution);

  // Leeres Deutungs-Marker-Paar als Anker zwischen Überblick und erstem Wurf-Abschnitt
  // (nur im Note-body, nicht in der Panel-Vorschau). insertInterpretation ersetzt später
  // idempotent dazwischen → Deutung steht unter dem Überblick, über den Wilhelm-Texten.
  const anchor = `${MARKER_START}\n${MARKER_END}`;
  return {
    title,
    frontmatter,
    body: [...head, anchor, ...content].join("\n\n") + "\n",
    previewBody: [...head.slice(1), ...content].join("\n\n") + "\n", // ohne H1-Titel, ohne Anker
  };
}
