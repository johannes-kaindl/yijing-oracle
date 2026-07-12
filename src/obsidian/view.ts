// Orakel-Konsole: ein einziger Sidebar-View (UI-STANDARD §4). Hält nur den aktuellen
// Wurf als Zustand und rendert bei jeder Änderung vollständig neu (DOM = Funktion des
// Zustands). Alle Orakel-Logik kommt aus dem puren Kern; dieses Modul macht nur DOM + I/O.
import {
  ButtonComponent,
  ItemView,
  MarkdownRenderer,
  Notice,
  TextComponent,
  type WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { cast } from "../core/casting";
import { buildReading, type Reading } from "../core/reading";
import { renderReading, type RenderedReading } from "../core/render";
import { getHexagram, type Lang } from "../core/data";
import { t } from "../vendor/kit/i18n";
import { type OutputMode, type PluginSettings } from "./settings";
import { writeReading } from "./reading-writer";
import { nowStamp } from "./clock";

export const VIEW_TYPE_YIJING = "yijing-oracle-panel";

export interface OracleHost {
  settings: PluginSettings;
  resolveReadingLang(): Lang;
}

interface CurrentCast {
  reading: Reading;
  rendered: RenderedReading;
  question: string;
  date: string;
}

/** Sechs Linien als Hexagramm-Figur, oben = Linie 6. { solid, changing } je Zeile. */
function figureRows(reading: Reading): { yang: boolean; changing: boolean }[] {
  return reading.lines
    .map((l) => {
      const yang = l.value === 7 || l.value === 9;
      const changing = l.value === 6 || l.value === 9;
      return { yang, changing };
    })
    .reverse();
}

export class OracleView extends ItemView {
  private current: CurrentCast | null = null;
  private questionValue = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: OracleHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_YIJING;
  }
  getDisplayText(): string {
    return t("view.title");
  }
  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }
  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** Von außen aufrufbar (Command), um im Panel zu werfen und anzuzeigen. */
  async castAndShow(question?: string): Promise<void> {
    if (question !== undefined) this.questionValue = question;
    this.doCast();
    await this.render();
  }

  private doCast(): void {
    const lang = this.host.resolveReadingLang();
    const register = this.host.settings.register;
    const question = this.questionValue.trim();
    const date = nowStamp();
    const reading = buildReading(cast());
    const rendered = renderReading(reading, {
      lang,
      register,
      date,
      question,
      includeFrontmatter: this.host.settings.includeFrontmatter,
      frontmatterFields: this.host.settings.frontmatterFields,
    });
    this.current = { reading, rendered, question, date };
  }

  private async saveCurrent(mode: OutputMode): Promise<void> {
    if (!this.current) return;
    const { rendered, reading, question, date } = this.current;
    const result = await writeReading(
      this.app,
      {
        rendered,
        date,
        question,
        hexNumber: reading.primaryNumber,
        resultingNumber: reading.resultingNumber,
      },
      mode,
      this.host.settings,
    );
    if (result.file) {
      new Notice(t("notice.saved", result.file.basename));
      if (result.mode === "note" && this.host.settings.openAfterCreate) {
        await this.app.workspace.getLeaf(false).openFile(result.file);
      }
    }
    await this.render();
  }

  private async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("yijing-oracle");

    root.createEl("h2", { text: t("view.title"), cls: "yijing-title" });

    // ── Frage-Eingabe ──────────────────────────────────────────────────────
    const q = new TextComponent(root);
    q.setPlaceholder(t("view.questionPlaceholder"));
    q.setValue(this.questionValue);
    q.onChange((v) => (this.questionValue = v));
    q.inputEl.addClass("yijing-question");

    // ── Wurf-Button ────────────────────────────────────────────────────────
    const castRow = root.createDiv({ cls: "yijing-actions" });
    new ButtonComponent(castRow)
      .setButtonText(this.current ? t("view.recast") : t("view.cast"))
      .setCta()
      .onClick(() => {
        this.doCast();
        void this.render();
      });

    if (this.current) this.renderCurrent(root);

    this.renderHistory(root);
  }

  private renderCurrent(root: HTMLElement): void {
    const c = this.current;
    if (!c) return;
    const lang = this.host.resolveReadingLang();
    const register = this.host.settings.register;
    const primary = getHexagram(c.reading.primaryNumber, lang, register);

    const card = root.createDiv({ cls: "yijing-reading" });

    // Hexagramm-Figur + Kopf.
    const head = card.createDiv({ cls: "yijing-figure-head" });
    const fig = head.createDiv({ cls: "yijing-figure" });
    for (const row of figureRows(c.reading)) {
      const line = fig.createDiv({ cls: "yijing-line" });
      line.toggleClass("is-yang", row.yang);
      line.toggleClass("is-yin", !row.yang);
      line.toggleClass("is-changing", row.changing);
    }
    const label = head.createDiv({ cls: "yijing-figure-label" });
    label.createDiv({
      text: `${primary.unicode} ${primary.number} · ${primary.nameLocal}`,
      cls: "yijing-glyph",
    });
    const sub = [primary.nameLatin, primary.nameChinese, primary.pinyin].filter(Boolean).join(" · ");
    if (sub) label.createDiv({ text: sub, cls: "yijing-name" });
    if (c.reading.resultingNumber !== null) {
      const resulting = getHexagram(c.reading.resultingNumber, lang, register);
      label.createDiv({
        text: t("view.becomes", `${resulting.unicode} ${resulting.number} · ${resulting.nameLocal}`),
        cls: "yijing-becomes",
      });
    }

    // Markdown-Vorschau OHNE H1/Untertitel — die Kopfzeile oben trägt den Titel bereits.
    const preview = card.createDiv({ cls: "yijing-preview" });
    void MarkdownRenderer.render(this.app, c.rendered.previewBody, preview, "", this);

    // Speicher-Aktionen — beide Ausgabe-Modi als Buttons (Spec: beides wählbar).
    const actions = card.createDiv({ cls: "yijing-actions" });
    const primaryMode = this.host.settings.defaultOutput;
    const noteBtn = new ButtonComponent(actions)
      .setButtonText(t("view.saveNote"))
      .onClick(() => void this.saveCurrent("note"));
    const cursorBtn = new ButtonComponent(actions)
      .setButtonText(t("view.insertCursor"))
      .onClick(() => void this.saveCurrent("cursor"));
    (primaryMode === "cursor" ? cursorBtn : noteBtn).setCta();
  }

  private renderHistory(root: HTMLElement): void {
    const section = root.createDiv({ cls: "yijing-history" });
    section.createEl("h3", { text: t("view.historyHead") });

    const folder = normalizePath(this.host.settings.readingsFolder);
    const prefix = folder + "/";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix))
      .filter((f) => this.app.metadataCache.getFileCache(f)?.frontmatter?.yijing_reading === true)
      .sort((a, b) => b.stat.ctime - a.stat.ctime)
      .slice(0, 30);

    if (files.length === 0) {
      section.createEl("p", { text: t("view.historyEmpty"), cls: "yijing-empty" });
      return;
    }

    const list = section.createEl("ul", { cls: "yijing-history-list" });
    for (const f of files) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const hex = typeof fm?.hexagram === "number" ? `${fm.hexagram} · ` : "";
      const li = list.createEl("li");
      const a = li.createEl("a", { text: `${hex}${f.basename}`, cls: "yijing-history-link" });
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(f);
      });
    }
  }
}
