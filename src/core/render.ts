// Reines Rendering: Reading + Hexagramm-Daten → Frontmatter + Markdown-Body.
// Berührt NIE eine Datei (das macht reading-writer.ts) und nutzt NICHT die globale
// UI-i18n — die Sektions-Labels hängen an der SPRACHE DES READINGS (kann von der
// UI-Sprache abweichen), darum ein eigenes, kleines Label-Set hier.
import { type Reading } from "./reading";
import { getHexagram, type HexLine, type Lang, type Register } from "./data";
import { type FrontmatterField, buildFrontmatter } from "./frontmatter";
import { MARKER_START, MARKER_END } from "./llm/insert";

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
  judgment: string;
  image: string;
  changes: string;
  becomes: string;
  question: string;
  changingLines: string;
}

const LABELS: Record<Lang, Labels> = {
  de: {
    judgment: "Das Urteil",
    image: "Das Bild",
    changes: "Die Wandlungen",
    becomes: "Wird zu",
    question: "Frage",
    changingLines: "wandelnde Linien",
  },
  en: {
    judgment: "The Judgment",
    image: "The Image",
    changes: "The Changing Lines",
    becomes: "Becomes",
    question: "Question",
    changingLines: "changing lines",
  },
};

function heading(unicode: string, number: number, nameLocal: string): string {
  return `${unicode} ${number} · ${nameLocal}`;
}

function renderLine(line: HexLine): string {
  const parts = [`**${line.position}**`, line.text.trim()];
  if (line.interpretation?.trim()) parts.push(line.interpretation.trim());
  return parts.join("\n\n");
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

  // Inhalt ab dem Frage-/Meta-Block — ohne Titel/Untertitel (die trägt in der Vorschau
  // die Kopfzeile). Für die Note wird der Titel oben wieder vorangestellt.
  const content: string[] = [];
  if (meta.length > 0) content.push(`> ${meta.join("   ·   ")}`);

  content.push(`## ${L.judgment}`, primary.judgment.trim());
  content.push(`## ${L.image}`, primary.image.trim());

  if (reading.changingPositions.length > 0) {
    const headingText =
      reading.changingPositions.length === 6
        ? `## ${L.changes}`
        : `## ${L.changes} (${reading.changingPositions.join(", ")})`;
    content.push(headingText);

    // Yong-Sonderfall: alle sechs wandeln bei Hex 1/2 → der 7. Text (Index 6).
    if (reading.allChanging && primary.lines.length > 6) {
      content.push(renderLine(primary.lines[6]));
    } else {
      for (const pos of reading.changingPositions) {
        content.push(renderLine(primary.lines[pos - 1]));
      }
    }

    if (reading.resultingNumber !== null) {
      const resulting = getHexagram(reading.resultingNumber, opts.lang, opts.register);
      content.push(`## ${L.becomes} → ${heading(resulting.unicode, resulting.number, resulting.nameLocal)}`);
      content.push(resulting.judgment.trim());
    }
  }

  // Leeres Deutungs-Marker-Paar als Anker VOR dem ersten Wurf-Abschnitt (nur im Note-body,
  // nicht in der Panel-Vorschau). insertInterpretation ersetzt später idempotent dazwischen.
  const anchor = `${MARKER_START}\n${MARKER_END}`;
  return {
    title,
    frontmatter,
    body: [titleLine, subtitleLine, anchor, ...content].join("\n\n") + "\n",
    previewBody: content.join("\n\n") + "\n",
  };
}
