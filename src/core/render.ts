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
  no: string;
  upperTrigram: string;
  lowerTrigram: string;
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
    no: "Nr.",
    upperTrigram: "Oberes Trigramm",
    lowerTrigram: "Unteres Trigramm",
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
    no: "No.",
    upperTrigram: "Upper trigram",
    lowerTrigram: "Lower trigram",
    attribution: "*Text: Richard Wilhelm — I Ching, The Book of Changes.*",
  },
};

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

/** Kopf-Block eines Hexagramms: fetter Titel + obere/untere Trigramm-Zeile. */
function hexInfoBlock(h: HexagramData, L: Labels, lang: Lang, cfg: CalloutOption): string {
  const header = `**${h.unicode} ${L.no} ${h.number} — ${h.nameChinese} ${h.pinyin} · ${h.nameLatin} — ${h.nameLocal}**`;
  const bullets = [trigramLine(L.upperTrigram, h.trigrams.above, lang), trigramLine(L.lowerTrigram, h.trigrams.below, lang)].join("\n");
  return cfg.enabled ? wrapCallout(header, bullets, cfg.type, false) : `${header}\n\n${bullets}`;
}

/** Eine wandelnde Linie als Abschnitt: Positions-Titel + Text (+ Deutung). */
function lineSection(line: HexLine, cfg: CalloutOption): string {
  const body = [line.text.trim(), line.interpretation?.trim()].filter(Boolean).join("\n\n");
  return section(line.position, body, cfg);
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
  const titleLine = `# ${title}`;
  const subtitleLine = `> ${[primary.nameLatin, primary.nameChinese, primary.pinyin].filter(Boolean).join(" · ")}`;

  const meta: string[] = [];
  if (question) meta.push(`**${L.question}:** ${question}`);
  if (reading.changingPositions.length > 0) {
    meta.push(`${L.changingLines}: ${reading.changingPositions.join(", ")}`);
  }

  // Meta-/Frage-Zeile gehört zum Kopf (bleibt über der Deutung); die Wurf-Abschnitte
  // (## Urteil …) stehen darunter. Der Deutungs-Anker liegt dazwischen.
  const metaLine = meta.length > 0 ? `> ${meta.join("   ·   ")}` : null;

  const cal = opts.callouts ?? DEFAULT_CALLOUTS;
  const content: string[] = [];

  // ── Ursprungsbild ──────────────────────────────────────────────────────
  content.push(`## ${L.origin}`);
  content.push(hexInfoBlock(primary, L, opts.lang, cal.hexInfo));
  content.push(section(L.judgment, primary.judgment.trim(), cal.judgment));
  content.push(section(L.image, primary.image.trim(), cal.image));
  if (primary.meaning.trim()) content.push(section(L.meaning, primary.meaning.trim(), cal.meaning));

  // ── Wandelnde Linien ───────────────────────────────────────────────────
  if (reading.changingPositions.length > 0) {
    content.push(
      reading.changingPositions.length === 6
        ? `## ${L.changes}`
        : `## ${L.changes} (${reading.changingPositions.join(", ")})`,
    );

    // Yong-Sonderfall: alle sechs wandeln bei Hex 1/2 → der 7. Text (Index 6).
    if (reading.allChanging && primary.lines.length > 6) {
      content.push(lineSection(primary.lines[6], cal.lines));
    } else {
      for (const pos of reading.changingPositions) {
        content.push(lineSection(primary.lines[pos - 1], cal.lines));
      }
    }

    // ── Zielbild ─────────────────────────────────────────────────────────
    if (reading.resultingNumber !== null) {
      const resulting = getHexagram(reading.resultingNumber, opts.lang, opts.register);
      content.push(`## ${L.target}`);
      content.push(hexInfoBlock(resulting, L, opts.lang, cal.hexInfo));
      content.push(section(L.judgment, resulting.judgment.trim(), cal.judgment));
      content.push(section(L.image, resulting.image.trim(), cal.image));
    }
  }

  // ── Quellenangabe ──────────────────────────────────────────────────────
  content.push("---", L.attribution);

  // Leeres Deutungs-Marker-Paar als Anker zwischen Meta-Zeile und erstem Wurf-Abschnitt
  // (nur im Note-body, nicht in der Panel-Vorschau). insertInterpretation ersetzt später
  // idempotent dazwischen → Deutung steht über den Wilhelm-Texten, aber unter der Frage.
  const anchor = `${MARKER_START}\n${MARKER_END}`;
  const head = metaLine ? [titleLine, subtitleLine, metaLine] : [titleLine, subtitleLine];
  const preview = metaLine ? [metaLine, ...content] : content;
  return {
    title,
    frontmatter,
    body: [...head, anchor, ...content].join("\n\n") + "\n",
    previewBody: preview.join("\n\n") + "\n",
  };
}
