// Orakel-Konsole: ein einziger Sidebar-View (UI-STANDARD §4). Hält nur den aktuellen
// Wurf als Zustand und rendert bei jeder Änderung vollständig neu (DOM = Funktion des
// Zustands). Alle Orakel-Logik kommt aus dem puren Kern; dieses Modul macht nur DOM + I/O.
import {
  ButtonComponent,
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  TextComponent,
  type WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { cast } from "../core/casting";
import { buildReading, reconstructReading, type Reading } from "../core/reading";
import { renderReading, type RenderedReading } from "../core/render";
import { rulingSentence } from "../core/ruling";
import { getHexagram, type Lang, type Register } from "../core/data";
import { type FieldId } from "../core/frontmatter";
import { buildInterpretationMessages } from "../core/llm/prompt";
import { DEFAULT_SYSTEM_PROMPT } from "../core/llm/defaults";
import { effectiveModel } from "../core/llm/settings-defaults";
import { t } from "../vendor/kit/i18n";
import { buildSdPrompt, composeImageRequest } from "../core/image-scene";
import { type OutputMode, type PluginSettings } from "./settings";
import { writeReading } from "./reading-writer";
import { type LlmConnection } from "../vendor/kit-obsidian/llm-connection";
import { neutralizeModelMarkdown } from "../vendor/kit/safe-markdown";
import { readImageGenApi } from "./image-gen";
import { buildStreamArea, type StreamArea } from "../vendor/kit-obsidian/stream-area";
import { nowStamp } from "./clock";

export const VIEW_TYPE_YIJING = "yijing-oracle-panel";

export interface OracleHost {
  settings: PluginSettings;
  resolveReadingLang(): Lang;
  /** Die LLM-Verbindung (Kit): Quelle, Modellliste, Anfrage-Parameter, Client, Sitzung. */
  llm: LlmConnection;
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
  /** Generiertes Meditationsbild (oder null): die Datei im Vault, die local-image-generator geschrieben hat. `saved` heißt:
   *  die Reading-Note verweist darauf — dann gehört die Datei der Note und wird nie weggeräumt. */
  artwork: { path: string; scene: string; saved: boolean } | null;
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
  /** Zwischen Klick und Streambeginn (Aufloesen, Modell-Liste): sperrt einen zweiten Start. */
  private starting = false;
  private generatingImage = false;
  private abortCtrl: AbortController | null = null;
  /** Streaming-Antwortbereich aus obsidian-kit (UI-STANDARD §8, `buildStreamArea`). Wird
   *  bei jedem Anstrich in {@link renderInterpretationArea} waehrend `this.streaming` neu
   *  gebaut (Bauart 4, Voll-Rerender) — {@link updateStreamDom} patcht ihn danach ohne
   *  Re-Render, bis der naechste volle Anstrich kommt. */
  private streamArea: StreamArea | null = null;
  /** Klapp-Zustand des Gedankenblocks — ueberlebt den Re-Render, damit ein Nutzer, der ihn
   *  zuklappt, ihn nicht bei jedem Token wieder aufklappen sieht. */
  private reasoningOpen = true;
  /** Klapp-Zustände der Kästen (überleben Re-Render). */
  private readingOpen = true;
  private interpretationOpen = true;
  private historyOpen = false;

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
      callouts: this.host.settings.callouts,
      includeNotes: this.host.settings.showNotes,
    });
    this.discardArtwork(this.current);
    this.current = { reading, rendered, question, date, lang, interpretation: null, artwork: null, file: null };
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
        artwork: c.artwork && !c.artwork.saved ? c.artwork : null,
        thinkingInNote: this.host.settings.llm.thinkingInNote,
        existingFile: c.file,
      },
      mode,
      this.host.settings,
    );
    if (result.file) {
      // Note merken, damit ein späteres „Deutung speichern" dieselbe Datei aktualisiert.
      if (result.mode === "note") c.file = result.file;
      if (c.artwork) c.artwork.saved = true;
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
        // Frage ist im Wurf erfasst → Feld leeren, damit kein alter Text stehen bleibt.
        this.questionValue = "";
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

    // ── Weissagung: eigener, einklappbarer Kasten ──────────────────────────
    const readingBox = root.createEl("details", { cls: "yijing-reading" });
    readingBox.open = this.readingOpen;
    readingBox.addEventListener("toggle", () => {
      this.readingOpen = readingBox.open;
    });
    const summary = readingBox.createEl("summary", { cls: "yijing-reading-summary" });
    let summaryText = `${primary.unicode} ${primary.number} · ${primary.nameLocal}`;
    if (c.reading.resultingNumber !== null) {
      const resulting = getHexagram(c.reading.resultingNumber, lang, register);
      summaryText += ` → ${resulting.unicode} ${resulting.number} · ${resulting.nameLocal}`;
    }
    summary.setText(summaryText);

    // Hexagramm-Figur + Untertitel + Vorschau (im Klapp-Körper).
    const head = readingBox.createDiv({ cls: "yijing-figure-head" });
    const fig = head.createDiv({ cls: "yijing-figure" });
    for (const row of figureRows(c.reading)) {
      const line = fig.createDiv({ cls: "yijing-line" });
      line.toggleClass("is-yang", row.yang);
      line.toggleClass("is-yin", !row.yang);
      line.toggleClass("is-changing", row.changing);
    }
    const sub = [primary.nameLatin, primary.nameChinese, primary.pinyin].filter(Boolean).join(" · ");
    if (sub) head.createDiv({ text: sub, cls: "yijing-name" });

    // Maßgeblich-nach-Tradition-Hinweis (dieselbe Quelle wie in der Note) — volle
    // Zeile unter dem Figur-Kopf, vor der Vorschau.
    const ruling = rulingSentence(c.reading, lang);
    readingBox.createDiv({ text: `${ruling.label}: ${ruling.text}`, cls: "yijing-ruling" });

    // Markdown-Vorschau OHNE H1/Untertitel — die Kopfzeile oben trägt den Titel bereits.
    const preview = readingBox.createDiv({ cls: "yijing-preview" });
    void MarkdownRenderer.render(this.app, c.rendered.previewBody, preview, "", this);

    // ── KI-Deutung: eigener Kasten ─────────────────────────────────────────
    this.renderInterpretationArea(root, c);

    // ── Bildmeditation: eigener Kasten ─────────────────────────────────────
    this.renderArtworkArea(root, c);

    // Speicher-Aktionen — beide Ausgabe-Modi als Buttons (Spec: beides wählbar).
    const actions = root.createDiv({ cls: "yijing-actions" });
    const primaryMode = this.host.settings.defaultOutput;
    const noteBtn = new ButtonComponent(actions)
      .setButtonText(t("view.saveNote"))
      .onClick(() => void this.saveCurrent("note"));
    const cursorBtn = new ButtonComponent(actions)
      .setButtonText(t("view.insertCursor"))
      .onClick(() => void this.saveCurrent("cursor"));
    (primaryMode === "cursor" ? cursorBtn : noteBtn).setCta();
  }

  /** Deutungs-Bereich: eigener Klapp-Kasten mit Auslöse-Button, Live-Stream oder Ergebnis. */
  private renderInterpretationArea(root: HTMLElement, c: CurrentCast): void {
    this.streamArea = null;
    const box = root.createEl("details", { cls: "yijing-interpretation" });
    box.open = this.interpretationOpen;
    box.addEventListener("toggle", () => {
      this.interpretationOpen = box.open;
    });
    box.createEl("summary", { text: t("view.interpretationHead"), cls: "yijing-box-summary" });
    const area = box.createDiv({ cls: "yijing-interpretation-inner" });

    if (this.streaming) {
      // Baut je Anstrich neu (Bauart 4) — `reasoningOpen` kommt aus dem Modell, nicht aus
      // einem Startwert des Bausteins selbst (UI-STANDARD §8, Streaming-Antwortbereich).
      const streamArea = buildStreamArea(area, {
        strings: { reasoning: t("view.reasoningHead") },
        cls: "yijing-stream",
        // Der Wirt scrollt (die ganze Ansicht), nicht der Bereich: ohne `scrollEl` hat der Body keine begrenzte Höhe, `followTail`
        // bewegt nichts und die wachsende Deutung läuft unter den Rand (Befund Welle 20, gemessen im GUI-Smoke).
        scrollEl: this.contentEl,
        reasoningOpen: this.reasoningOpen,
        onReasoningToggle: (open) => {
          this.reasoningOpen = open;
        },
      });
      if (c.interpretation?.reasoning) streamArea.setReasoning(c.interpretation.reasoning);
      streamArea.setTail(c.interpretation?.answer ?? "");
      this.streamArea = streamArea;
      const row = area.createDiv({ cls: "yijing-actions" });
      new ButtonComponent(row).setButtonText(t("view.cancel")).onClick(() => this.abortCtrl?.abort());
      return;
    }

    if (c.interpretation) {
      if (c.interpretation.reasoning.trim()) {
        // Dasselbe Markup wie der Streaming-Bereich (Kit `okit-stream-reasoning`): vorher kam nach dem Stream
        // eine zweite, anders gestaltete Darstellung derselben Gedanken.
        const det = area.createEl("details", { cls: "okit-stream-reasoning" });
        det.open = this.reasoningOpen;
        det.addEventListener("toggle", () => {
          this.reasoningOpen = det.open;
        });
        det.createEl("summary", { text: t("view.reasoningHead") });
        det.createEl("pre", { text: c.interpretation.reasoning });
      }
      const body = area.createDiv({ cls: "yijing-interpretation-body" });
      void MarkdownRenderer.render(this.app, neutralizeModelMarkdown(c.interpretation.answer), body, "", this);
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

  /** Bildmeditations-Bereich: Kasten nur, wenn local-image-generator da ist (Kit-Vertrag `image-gen-provider`);
   *  Button → Vorschau; „Neu generieren“ unter dem Bild. */
  private renderArtworkArea(root: HTMLElement, c: CurrentCast): void {
    if (readImageGenApi(this.app) === null) return;
    const box = root.createEl("details", { cls: "yijing-artwork" });
    box.open = true;
    box.createEl("summary", { text: t("view.artworkHead"), cls: "yijing-box-summary" });
    const area = box.createDiv({ cls: "yijing-artwork-inner" });

    if (this.generatingImage) {
      area.createEl("p", { text: t("view.generatingImage"), cls: "yijing-empty" });
      return;
    }

    if (c.artwork) {
      const file = this.app.vault.getAbstractFileByPath(c.artwork.path);
      if (file instanceof TFile) {
        const imgEl = area.createEl("img", { cls: "yijing-artwork-img" });
        imgEl.src = this.app.vault.getResourcePath(file);
      } else {
        area.createEl("p", { text: t("view.imageMissing"), cls: "yijing-empty" });
      }
      area.createDiv({ text: c.artwork.scene, cls: "yijing-artwork-scene" });
      const row = area.createDiv({ cls: "yijing-actions" });
      new ButtonComponent(row)
        .setButtonText(t("view.regenerate"))
        .onClick(() => void this.generateArtwork());
      return;
    }

    const row = area.createDiv({ cls: "yijing-actions" });
    new ButtonComponent(row)
      .setButtonText(t("view.generateImage"))
      .onClick(() => void this.generateArtwork());
  }

  /** Startet die Deutung: baut Messages, streamt live, hängt Ergebnis an current an. */
  private async generateInterpretation(): Promise<void> {
    const c = this.current;
    if (!c || this.streaming || this.starting) return;
    // Aufloesen, Modell-Liste und Persistieren dauern (bis 5 s je toter Zeile): ein zweiter Klick wuerde
    // sonst einen parallelen Lauf starten, bevor `streaming` gesetzt ist.
    this.starting = true;
    try {
      await this.generateInterpretationNow(c);
    } finally {
      this.starting = false;
    }
  }

  private async generateInterpretationNow(c: CurrentCast): Promise<void> {
    const llm = this.host.settings.llm;
    // Die Verbindung loest Quelle (Manager zuerst, sonst die lokale Liste), Familie, Backend und
    // Sampling-Profil selbst auf und merkt sich die Aufloesung bis zur naechsten Aenderung.
    // `force`: die Verbindung merkt sich auch eine FEHLGESCHLAGENE Aufloesung. Ohne das bliebe „kein Endpunkt“
    // nach dem Start des Servers (oder ein toter erster Eintrag nach einem Netzwechsel) bis zur naechsten
    // Einstellungsaenderung stehen; geprueft wird wie vor dem Tausch bei jedem Klick.
    const resolved = await this.host.llm.resolve({ force: true });
    if (!resolved.config) {
      // Ein Fehlschlag mit installiertem Manager verweist auf DESSEN Einstellungen, nicht auf
      // die (dann evtl. leere/irrelevante) lokale Liste — der Manager entscheidet, es gibt
      // keinen lokalen Rueckfall bei "kein Endpunkt".
      new Notice(t(resolved.kind === "manager" ? "notice.noEndpointManaged" : "notice.noEndpoint"));
      return;
    }

    // Modell: das aufgeloeste (choice.model bzw. Modell der Zeile) gewinnt; ist keins gesetzt, das erste
    // der Live-Liste — deckt den Fall ab, dass die Zeile nie ein Modell bekam. Lokal merkt es
    // `setModel` in der aktiven Zeile; beim Manager entscheidet er, dort wird nichts geschrieben.
    let model = resolved.model.trim();
    let fallbackModel: string | undefined;
    if (!model) {
      const listed = await this.host.llm.models();
      model = effectiveModel("", listed.models);
      if (model) {
        fallbackModel = model;
        if (resolved.kind !== "manager") await this.host.llm.setModel(model);
      }
    }
    if (!model) {
      new Notice(t(resolved.kind === "manager" ? "notice.noEndpointManaged" : "notice.noEndpoint"));
      return;
    }

    const lang = c.lang;
    const systemPrompt = (lang === "de" ? llm.systemPromptDe : llm.systemPromptEn).trim() || DEFAULT_SYSTEM_PROMPT[lang];
    const messages = buildInterpretationMessages({ rendered: c.rendered, question: c.question, lang, systemPrompt });

    this.streaming = true;
    this.abortCtrl = new AbortController();
    c.interpretation = { answer: "", reasoning: "", model };
    await this.render();

    try {
      const res = await this.host.llm.complete({ messages }, {
        ...(fallbackModel !== undefined ? { model: fallbackModel } : {}),
        onToken: (tok) => {
          if (c.interpretation) { c.interpretation.answer += tok; this.updateStreamDom(c); }
        },
        onReasoning: (tok) => {
          if (c.interpretation) { c.interpretation.reasoning += tok; this.updateStreamDom(c); }
        },
        // Gemma schreibt sein Denken ohne Öffner in den Antworttext und meldet es erst mit `<channel|>`: bis dahin gesammelter Text ist Denken.
        onContentReset: () => {
          if (c.interpretation) { c.interpretation.answer = ""; this.streamArea?.resetContent(); this.updateStreamDom(c); }
        },
        signal: this.abortCtrl.signal,
      });
      if (!res.ok) {
        c.interpretation = null;
        if (res.kind === "no-endpoint") {
          new Notice(t(res.source.kind === "manager" ? "notice.noEndpointManaged" : "notice.noEndpoint"));
        } else if (res.kind !== "aborted") {
          // Der Servergrund (`detail`) steht hinter dem eigenen Satz, nicht an seiner Stelle.
          new Notice(`${t("notice.llmError")} ${res.detail}`);
          console.error("[yijing-oracle]", res.kind, res.detail);
        }
      } else if (!res.content.trim()) {
        c.interpretation = null;
        new Notice(t("notice.noInterpretation"));
      }
    } catch (e) {
      // Die Verbindung wirft nicht; das hier faengt nur Fehler in den eigenen Callbacks.
      c.interpretation = null;
      new Notice(t("notice.llmError"));
      console.error("[yijing-oracle]", e);
    } finally {
      this.streaming = false;
      this.abortCtrl = null;
      await this.render();
    }
  }

  /** Ordner für das Bild: der Anhänge-Ordner, den Obsidian für eine Note im Lese-Ordner wählen würde (die Note gibt es noch
   *  nicht, das Bild entsteht vor ihr). */
  private async imageTargetFolder(): Promise<string> {
    const probe = await this.app.fileManager.getAvailablePathForAttachment("yijing-image.png", `${normalizePath(this.host.settings.readingsFolder)}/x.md`);
    const slash = probe.lastIndexOf("/");
    return slash === -1 ? "" : probe.slice(0, slash);
  }

  /** Ein noch nicht in eine Note übernommenes Bild ist Wegwerfware dieser Ansicht: weg damit, wenn ein neues kommt oder der
   *  Wurf wechselt. Ein gespeichertes gehört der Note und bleibt. */
  private discardArtwork(c: CurrentCast | null): void {
    const a = c?.artwork;
    if (!a || a.saved) return;
    const f = this.app.vault.getAbstractFileByPath(a.path);
    if (f instanceof TFile) void this.app.fileManager.trashFile(f).catch((e: unknown) => { console.error("[yijing-oracle]", e); });
  }

  /** Baut Szene+Prompt deterministisch aus dem Wurf und lässt das Bild von local-image-generator erzeugen. */
  private async generateArtwork(): Promise<void> {
    const c = this.current;
    if (!c || this.generatingImage) return;
    const api = readImageGenApi(this.app);
    if (api === null) {
      new Notice(t("notice.imageNoProvider"));
      return;
    }
    const img = this.host.settings.image;

    const register = this.host.settings.register;
    const primary = getHexagram(c.reading.primaryNumber, c.lang, register);
    const resulting = c.reading.resultingNumber !== null ? getHexagram(c.reading.resultingNumber, c.lang, register) : null;
    const { scene } = composeImageRequest({
      primaryMotif: primary.imageAssociation,
      resultingMotif: resulting?.imageAssociation ?? "",
      question: c.question,
      primaryNumber: c.reading.primaryNumber,
    });

    this.generatingImage = true;
    await this.render();

    try {
      const prompt = buildSdPrompt(scene, img.styleSuffix);
      const res = await api.generateImage(prompt, { targetFolder: await this.imageTargetFolder() });
      if (typeof res !== "string") {
        new Notice(t("notice.imageError", res.message));
        console.error("[yijing-oracle]", res.error, res.message);
      } else {
        this.discardArtwork(c);
        c.artwork = { path: res, scene, saved: false };
      }
    } catch (e) {
      // Der Vertrag wirft nicht; das hier fängt einen Anbieter, der es trotzdem tut.
      new Notice(t("notice.imageError", String((e as Error)?.message ?? e)));
      console.error("[yijing-oracle]", e);
    } finally {
      this.generatingImage = false;
      await this.render();
    }
  }

  /** Leichtes Live-Update des Stream-Bereichs ohne vollständigen Re-Render (kein Flackern).
   *  Verhaltenswechsel gegenüber dem Eigenbau (CHANGELOG Unreleased): der Scroll folgt nur,
   *  wenn der Nutzer nicht selbst hochgescrollt hat (`followTail`, Default-Schwelle 40 px). */
  private updateStreamDom(c: CurrentCast): void {
    if (!this.streamArea) return;
    if (c.interpretation?.reasoning) this.streamArea.setReasoning(c.interpretation.reasoning);
    this.streamArea.setTail(c.interpretation?.answer ?? "");
    this.streamArea.followTail();
  }

  private renderHistory(root: HTMLElement): void {
    const section = root.createEl("details", { cls: "yijing-history" });
    section.open = this.historyOpen;
    section.addEventListener("toggle", () => {
      this.historyOpen = section.open;
    });
    section.createEl("summary", { text: t("view.historyHead"), cls: "yijing-box-summary" });

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
      callouts: this.host.settings.callouts,
      includeNotes: this.host.settings.showNotes,
    });
    return { reading, rendered, question, date, lang, interpretation: null, artwork: null, file: f };
  }
}
