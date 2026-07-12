// Schreibt ein gerendertes Reading in den Vault — als neue Note ODER an den Cursor der
// aktiven Note. Einzige Stelle mit Datei-I/O; render.ts bleibt rein.
import { type App, MarkdownView, Notice, type TFile, normalizePath } from "obsidian";
import { type RenderedReading } from "../core/render";
import { buildFilename } from "../core/filename";
import { t } from "../vendor/kit/i18n";
import { type OutputMode, type PluginSettings } from "./settings";

export interface WriteResult {
  file: TFile | null;
  /** Der tatsächlich verwendete Modus (kann bei fehlendem Editor von "cursor" auf "note" fallen). */
  mode: OutputMode;
}

/** Zerlegt die ISO-nahe Zeitmarke "2026-07-12T10:34" in Datums- und HHMM-Teil. */
function splitStamp(stamp: string): { date: string; time: string } {
  const [date, time = ""] = stamp.split("T");
  return { date, time: time.replace(":", "") };
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
  resultingNumber: number | null;
}

/** Legt die Reading-Note an — mit Frontmatter-Zäunen nur, wenn welches vorhanden ist. */
async function createReadingNote(app: App, input: WriteInput, settings: PluginSettings): Promise<TFile> {
  const { rendered } = input;
  await ensureFolder(app, settings.readingsFolder);
  const { date, time } = splitStamp(input.date);
  const base = buildFilename(settings.filenameTemplate, {
    date,
    time,
    hexagram: input.hexNumber,
    resulting: input.resultingNumber,
    question: input.question,
  });
  const path = uniquePath(app, settings.readingsFolder, base);
  const content = rendered.frontmatter
    ? `---\n${rendered.frontmatter}\n---\n\n${rendered.body}`
    : rendered.body;
  return app.vault.create(path, content);
}

/** Beide Modi legen eine Note an. "cursor" fügt zusätzlich einen Link darauf an der
 *  Cursor-Position der aktiven Note ein (nicht-destruktiv — ersetzt keine Selektion,
 *  überschreibt nie die Notiz). Ohne aktive Note bleibt es bei der reinen Note. */
export async function writeReading(
  app: App,
  input: WriteInput,
  mode: OutputMode,
  settings: PluginSettings,
): Promise<WriteResult> {
  const file = await createReadingNote(app, input, settings);

  if (mode === "cursor") {
    // NICHT getActiveViewOfType: beim Klick auf den Panel-Button ist das Sidebar-Panel
    // die aktive Ansicht → keine „aktive" Notiz. Stattdessen die zuletzt genutzte Notiz
    // im Hauptbereich (rootSplit ignoriert die Sidebars).
    const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    const view = leaf?.view instanceof MarkdownView ? leaf.view : null;
    if (view?.editor && view.file) {
      const link = app.fileManager.generateMarkdownLink(file, view.file.path);
      view.editor.replaceRange(link, view.editor.getCursor("to"));
      return { file, mode: "cursor" };
    }
    new Notice(t("notice.noEditor"));
  }

  return { file, mode: "note" };
}
