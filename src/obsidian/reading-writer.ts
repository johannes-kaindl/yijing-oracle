// Schreibt ein gerendertes Reading in den Vault — als neue Note ODER an den Cursor der
// aktiven Note. Einzige Stelle mit Datei-I/O; render.ts bleibt rein.
import { type App, MarkdownView, Notice, type TFile, normalizePath } from "obsidian";
import { type RenderedReading } from "../core/render";
import { t } from "../vendor/kit/i18n";
import { type OutputMode, type PluginSettings } from "./settings";

export interface WriteResult {
  file: TFile | null;
  /** Der tatsächlich verwendete Modus (kann bei fehlendem Editor von "cursor" auf "note" fallen). */
  mode: OutputMode;
}

/** Ungültige Datei-Zeichen entfernen, Whitespace normalisieren, auf ~48 Zeichen kürzen. */
function slugify(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 48 ? cleaned.slice(0, 48).trim() : cleaned;
}

/** Dateiname-Basis: "YYYY-MM-DD HHMM slug|hexN" (ohne .md). */
function fileBase(rendered: RenderedReading, date: string, question: string, hexNumber: number): string {
  const stamp = date.replace("T", " ").replace(":", "");
  const tail = slugify(question) || `hex${hexNumber}`;
  return `${stamp} ${tail}`;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const path = normalizePath(folder);
  if (!path || path === "/") return;
  if (!(await app.vault.adapter.exists(path))) {
    await app.vault.createFolder(path).catch(() => {
      /* Race/exists — beim Schreiben ohnehin abgesichert. */
    });
  }
}

/** Freien Pfad finden: bei Kollision " (2)", " (3)" … anhängen. */
function uniquePath(app: App, folder: string, base: string): string {
  const dir = normalizePath(folder);
  const make = (name: string) => normalizePath(`${dir}/${name}.md`);
  let candidate = make(base);
  let n = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = make(`${base} (${n})`);
    n++;
  }
  return candidate;
}

export interface WriteInput {
  rendered: RenderedReading;
  date: string;
  question: string;
  hexNumber: number;
}

export async function writeReading(
  app: App,
  input: WriteInput,
  mode: OutputMode,
  settings: PluginSettings,
): Promise<WriteResult> {
  const { rendered } = input;

  if (mode === "cursor") {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) {
      view.editor.replaceSelection(rendered.body.trimEnd() + "\n");
      return { file: view.file, mode: "cursor" };
    }
    new Notice(t("notice.noEditor"));
    // Fallthrough auf note-Modus.
  }

  await ensureFolder(app, settings.readingsFolder);
  const base = fileBase(rendered, input.date, input.question, input.hexNumber);
  const path = uniquePath(app, settings.readingsFolder, base);
  const content = `---\n${rendered.frontmatter}\n---\n\n${rendered.body}`;
  const file = await app.vault.create(path, content);
  return { file, mode: "note" };
}
