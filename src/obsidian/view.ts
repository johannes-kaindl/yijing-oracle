// Orakel-Konsole: ein einziger Sidebar-View (UI-STANDARD §4). Hält nur den aktuellen
// Wurf als Zustand und rendert bei jeder Änderung vollständig neu (DOM = Funktion des
// Zustands). Alle Orakel-Logik kommt aus dem puren Kern; dieses Modul macht nur DOM + I/O.
import {
  ButtonComponent,
  ItemView,
  MarkdownRenderer,
  Notice,
  type TFile,
  TextComponent,
  type WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { cast } from "../core/casting";
import { buildReading, reconstructReading, type Reading } from "../core/reading";
import { renderReading, type RenderedReading } from "../core/render";
import { getHexagram, type Lang, type Register } from "../core/data";
import { type FieldId } from "../core/frontmatter";
import { buildInterpretationMessages } from "../core/llm/prompt";
import { DEFAULT_SYSTEM_PROMPT } from "../core/llm/defaults";
import { t } from "../vendor/kit/i18n";
import { type OutputMode, type PluginSettings } from "./settings";
import { writeReading } from "./reading-writer";
import { ChatClient } from "./chat-client";
import { httpGet } from "./http";
import { nowStamp } from "./clock";

export const VIEW_TYPE_YIJING = "yijing-oracle-panel";

export interface OracleHost {
  settings: PluginSettings;
  resolveReadingLang(): Lang;
}

interface Interpretation {
  answer: string;
  reasoning: string;
  model: string;
}

interface CurrentCast {
  reading: Reading;
  rendered: RenderedReading;
  question: string;
  date: string;
  lang: Lang;
  /** Erzeugte KI-Deutung (oder null). */
  interpretation: Interpretation | null;
  /** Bereits gespeicherte Note zu diesem Wurf (null → noch nicht gespeichert). */
  file: TFile | null;
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
  private streaming = false;
  private abortCtrl: AbortController | null = null;
  private answerEl: HTMLElement | null = null;
  private reasoningEl: HTMLElement | null = null;

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
    this.current = { reading, rendered, question, date, lang, interpretation: null, file: null };
  }

  private async saveCurrent(mode: OutputMode): Promise<void> {
    const c = this.current;
    if (!c) return;
    const result = await writeReading(
      this.app,
      {
        rendered: c.rendered,
        date: c.date,
        question: c.question,
        hexNumber: c.reading.primaryNumber,
        resultingNumber: c.reading.resultingNumber,
        lang: c.lang,
        interpretation: c.interpretation,
        thinkingInNote: this.host.settings.llm.thinkingInNote,
        existingFile: c.file,
      },
      mode,
      this.host.settings,
    );
    if (result.file) {
      // Note merken, damit ein späteres „Deutung speichern" dieselbe Datei aktualisiert.
      if (result.mode === "note") c.file = result.file;
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

    // KI-Deutung (Button / Live-Stream / Ergebnis).
    this.renderInterpretationArea(card, c);

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

  /** Deutungs-Bereich: Auslöse-Button, Live-Stream mit Abbrechen, oder fertige Deutung. */
  private renderInterpretationArea(card: HTMLElement, c: CurrentCast): void {
    this.answerEl = null;
    this.reasoningEl = null;
    const area = card.createDiv({ cls: "yijing-interpretation" });

    if (this.streaming) {
      const det = area.createEl("details", { cls: "yijing-reasoning" });
      det.open = true;
      det.createEl("summary", { text: t("view.reasoningHead") });
      this.reasoningEl = det.createDiv({ cls: "yijing-reasoning-body" });
      this.reasoningEl.setText(c.interpretation?.reasoning ?? "");
      this.answerEl = area.createDiv({ cls: "yijing-interpretation-body" });
      this.answerEl.setText(c.interpretation?.answer ?? "");
      const row = area.createDiv({ cls: "yijing-actions" });
      new ButtonComponent(row).setButtonText(t("view.cancel")).onClick(() => this.abortCtrl?.abort());
      return;
    }

    if (c.interpretation) {
      if (c.interpretation.reasoning.trim()) {
        const det = area.createEl("details", { cls: "yijing-reasoning" });
        det.createEl("summary", { text: t("view.reasoningHead") });
        det.createDiv({ text: c.interpretation.reasoning, cls: "yijing-reasoning-body" });
      }
      const body = area.createDiv({ cls: "yijing-interpretation-body" });
      void MarkdownRenderer.render(this.app, c.interpretation.answer, body, "", this);
      const row = area.createDiv({ cls: "yijing-actions" });
      new ButtonComponent(row)
        .setButtonText(t("view.saveInterpretation"))
        .setCta()
        .onClick(() => void this.saveCurrent(this.host.settings.defaultOutput));
      return;
    }

    const row = area.createDiv({ cls: "yijing-actions" });
    new ButtonComponent(row)
      .setButtonText(t("view.interpret"))
      .onClick(() => void this.generateInterpretation());
  }

  /** Startet die Deutung: baut Messages, streamt live, hängt Ergebnis an current an. */
  private async generateInterpretation(): Promise<void> {
    const c = this.current;
    if (!c || this.streaming) return;
    const llm = this.host.settings.llm;
    const endpoint = llm.activeEndpoint.trim();
    if (!endpoint || !llm.model.trim()) {
      new Notice(t("notice.noEndpoint"));
      return;
    }

    const lang = c.lang;
    const systemPrompt = (lang === "de" ? llm.systemPromptDe : llm.systemPromptEn).trim() || DEFAULT_SYSTEM_PROMPT[lang];
    const messages = buildInterpretationMessages({ rendered: c.rendered, question: c.question, lang, systemPrompt });

    this.streaming = true;
    this.abortCtrl = new AbortController();
    c.interpretation = { answer: "", reasoning: "", model: llm.model };
    await this.render();

    const client = new ChatClient(endpoint, llm.model, httpGet);
    try {
      const res = await client.stream(
        messages,
        (tok) => {
          if (c.interpretation) { c.interpretation.answer += tok; this.updateStreamDom(c); }
        },
        (tok) => {
          if (c.interpretation) { c.interpretation.reasoning += tok; this.updateStreamDom(c); }
        },
        this.abortCtrl.signal,
        { suppressThinking: !llm.requestThinking },
      );
      if (!res.content.trim()) {
        c.interpretation = null;
        new Notice(t("notice.noInterpretation"));
      }
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      c.interpretation = null;
      if (!aborted) {
        new Notice(t("notice.llmError"));
        console.error("[yijing-oracle]", e);
      }
    } finally {
      this.streaming = false;
      this.abortCtrl = null;
      await this.render();
    }
  }

  /** Leichtes Live-Update der Stream-Container ohne vollständigen Re-Render (kein Flackern). */
  private updateStreamDom(c: CurrentCast): void {
    if (this.answerEl) this.answerEl.setText(c.interpretation?.answer ?? "");
    if (this.reasoningEl) this.reasoningEl.setText(c.interpretation?.reasoning ?? "");
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
        void this.openHistoryEntry(f);
      });
    }
  }

  /** History-Klick: Wurf aus dem Frontmatter ins Panel rekonstruieren UND die Notiz öffnen. */
  private async openHistoryEntry(f: TFile): Promise<void> {
    const restored = this.restoreFromNote(f);
    if (restored) {
      this.current = restored;
      this.questionValue = restored.question;
      await this.render();
    }
    await this.app.workspace.getLeaf(false).openFile(f);
  }

  /** Aktuell konfigurierter YAML-Key für ein Feld (Fallback: der Feld-Default-Name). */
  private fmKey(id: FieldId): string {
    return this.host.settings.frontmatterFields.find((field) => field.id === id)?.key ?? id;
  }

  /** Rekonstruiert einen CurrentCast aus dem Frontmatter — best-effort. null, wenn die
   *  Kern-Felder (Hexagramm-Nr) fehlen oder das Reading nicht baubar ist. */
  private restoreFromNote(f: TFile): CurrentCast | null {
    const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
    if (!fm) return null;

    const read = (id: FieldId): unknown => fm[this.fmKey(id)] ?? fm[id];

    const hex = read("hexagram");
    if (typeof hex !== "number") return null;

    const rawChanging = read("changing_lines");
    const changing = Array.isArray(rawChanging) ? rawChanging.filter((x): x is number => typeof x === "number") : [];

    let reading: Reading;
    try {
      reading = reconstructReading(hex, changing);
    } catch {
      return null;
    }

    const langRaw = read("language");
    const lang: Lang = langRaw === "de" || langRaw === "en" ? langRaw : this.host.resolveReadingLang();
    const regRaw = read("register");
    const register: Register = regRaw === "classic" || regRaw === "neutral" ? regRaw : this.host.settings.register;
    const qRaw = read("question");
    const question = typeof qRaw === "string" ? qRaw : "";
    const dRaw = read("date");
    const date = typeof dRaw === "string" ? dRaw : "";

    const rendered = renderReading(reading, {
      lang,
      register,
      date,
      question,
      includeFrontmatter: this.host.settings.includeFrontmatter,
      frontmatterFields: this.host.settings.frontmatterFields,
    });
    return { reading, rendered, question, date, lang, interpretation: null, file: f };
  }
}
