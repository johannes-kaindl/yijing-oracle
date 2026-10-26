// vendored from obsidian-kit@0.72.0, src/obsidian/stream-area.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/**
 * Streaming-Antwortbereich (UI-STANDARD §8): der Bereich, in dem eine laufende
 * LLM-Antwort sichtbar wird — Gedankenblock, fertiger Text, laufender Absatz,
 * Statuszeile.
 *
 * ## Warum dieses Modul NUR baut und keine Tokens annimmt
 *
 * Gemessen am 2026-09-07 über das Dach: **10 Stellen in 9 Repos** stellen einen Strom
 * dar, und die **Komposition** ist dabei uniform (Reasoning-`<details>` + Tail +
 * Statuszeile + Abbruch) — vier Repos haben sie unabhängig voneinander gebaut, zwei
 * davon kennen sich nachweislich nicht. Die **Mechanik** ist es aber nicht; es gibt
 * vier Bauarten:
 *
 * 1. Push, inkrementell mit Markdown-Schnitt — `koda-agent/src/obsidian/view.ts:408`,
 *    `lingotuner/src/obsidian/view.ts:247` (`splitStable`).
 * 2. Push, append-only Rohtext — `kuro-gamification` (`appendToken`),
 *    `vault-crews/src/obsidian/panel.ts:207`, `image-to-markdown`.
 * 3. Pull per Abonnement — `markdown-presentation/src/generate-deck-view.ts:243-256`
 *    (`subscribe(snapshot)`, `setText(s.content.slice(-1200))`). **Kein Token-Callback.**
 * 4. Voll-Rerender aus dem Modell — `vault-rag/src/chat_view.ts:203-231`,
 *    `yijing-oracle`; `vim-dojo/src/result/ResultModal.tsx` als React-State.
 *
 * Eine API aus `token`/`reasoning`/`end` bediente 1 und 2 und zwänge 3, seine
 * Architektur umzudrehen. Deshalb baut dieses Modul die Hülle und gibt **Handles**
 * zurück: wer Tokens hat, hängt an (`appendReasoning`); wer einen Zustand hat, setzt
 * (`setReasoning`/`setTail`). Der inkrementelle Markdown-Schreiber für Bauart 1 sitzt
 * bewusst daneben, nicht hier.
 *
 * **Bauart 4 ist dabei KEIN Ausschluss** — das war eine zu grobe erste Lesart, korrigiert am
 * 2026-09-07. Dieses Modul ist ein Builder ohne Zustandszwang: wer je Anstrich neu baut, ruft
 * es je Anstrich neu und gibt `reasoningOpen` aus seinem Modell mit; er nutzt dann die
 * Bau-Hälfte und nicht `appendReasoning`/`reset`. Strukturell nicht konsumieren kann nur
 * `vim-dojo` (React); und
 * `vault-rag/src/chat_view.ts` passt aus einem Formgrund nicht — es zeichnet eine **Liste**
 * von Nachrichten mit je eigenem Gedankenblock, nicht einen Antwortbereich.
 *
 * ## Aus welcher Quelle welche Hälfte stammt
 *
 * Keine Referenz war überall die reichere:
 * - **Aufbau + Lebensdauer** — `koda-agent/src/obsidian/view.ts` (`streamToken`,
 *   `streamReasoning`, `endStream`).
 * - **Scroll** — `vault-rag/src/chat_view.ts:203`: dem Strom folgen, aber manuelles
 *   Hochscrollen respektieren. koda scrollt hart ans Ende (`view.ts:419`).
 * - **Gedankenblock offen + Toggle persistierbar** — `lingotuner/src/obsidian/view-render.ts:274`.
 *   koda legt ihn zugeklappt an; ein Gedanke, den man erst aufklappen muss, ist während
 *   des Streams unsichtbar — genau der am 2026-09-07 gemeldete Nutzerfehler.
 *   Der persistierbare Toggle hat zwei **unabhängige** Gründe, und der zweite kommt aus
 *   einem Repo, das gar nicht streamt: lingotuner hält die Wahl des Nutzers über Läufe
 *   hinweg, `obsidian-transmute/src/obsidian/view-render.ts:311` hält sie gegen den
 *   eigenen Anstrich („wird bei jedem Tastendruck neu gezeichnet und wuerde ein offenes
 *   `<details>` sonst zuklappen"). transmute ist damit **kein** Konsument dieses Moduls —
 *   es hat nichts zu streamen (`reasoning` ist dort ein fertiger Wert, kein Strom) —,
 *   aber es belegt, dass `reasoningOpen` als Eingabe je Anstrich gebraucht wird und nicht
 *   nur als Startwert.
 *
 ## Fallen beim Übernehmen
 *
 * 1. **Das Kit injiziert kein CSS.** `STREAM_AREA_CSS` gehört in die `styles.css` des
 *    Consumers (Muster von `COLLAPSIBLE_CSS`/`HUB_CSS`/`ENDPOINT_LIST_CSS`).
 * 2. **Der Body beansprucht den freien Platz — alles andere in derselben Flex-Spalte muss
 *    sich dagegen wehren.** `.okit-stream-body` trägt `flex: 1 1 auto` und `min-height: 0`,
 *    ist also das Einzige, was wachsen UND unter seinen Inhalt schrumpfen darf. Innerhalb
 *    des Bausteins ist das abgesichert: Statuszeile und Gedankenblock tragen ausdrücklich
 *    `flex: 0 0 auto`, statt sich auf die automatische Mindestgröße von Flex-Items zu
 *    verlassen — die verschwindet, sobald ein Element `overflow` setzt, und dann faltet die
 *    Zeile still zusammen.
 *    **Die Geschwister des Bausteins schützt das nicht.** Wer seine Aktionsleiste oder
 *    seinen Bedienblock als Nachbarn von `rootEl` in dieselbe Flex-Spalte hängt, gibt ihnen
 *    selbst `flex-shrink: 0` — sonst faltet der Block zusammen, sobald ein Ergebnis
 *    entsteht und der Body Platz fordert. Gemessen von `lingotuner` am 2026-09-08 an der
 *    eigenen (noch nicht adoptierten) Fassung: bei einer Panelbreite von 570 px blieben dem
 *    Bedienblock 70 px, bei 420 px **null** — verdeckt war nichts, die Regler waren
 *    schlicht unerreichbar. *Nicht selbst reproduziert; die Zahlen stammen aus deren Sweep.*
 */

import { setIcon } from "obsidian";
import { copyToClipboard } from "./clipboard";
import { realClock, type ClockPort } from "./clock";

/** Wie lange der Kopier-Knopf nach dem Kopieren das Häkchen zeigt. */
const COPIED_FLASH_MS = 1500;

/** Sichtbare Texte. Kein Default außer dem Knopf-Label: das Kit schreibt keine Sprache fest (UI-STANDARD §10). */
export interface StreamAreaStrings {
  /** `<summary>` des Gedankenblocks, z. B. „Denkt nach…". */
  reasoning: string;
  /** `aria-label` des Kopier-Knopfs am Gedankenblock. Default `"Copy thinking"`: der Knopf ist seit 0.63.0 immer da,
   *  eine Übersetzung kommt vom Consumer wie jeder andere Text. */
  copyReasoning?: string;
  /** Notice nach dem Kopieren. **Kein Default** — weggelassen heißt: nur die Quittung am Knopf (Icon `check`),
   *  wie bei `copyToClipboard`. */
  copiedReasoning?: string;
}

export interface StreamAreaOptions {
  strings: StreamAreaStrings;
  /** Zusätzliche Klasse an der Wurzel — der Design-Scope des Consumers. */
  cls?: string;
  /** Startzustand des Gedankenblocks. Default `true` (offen) — s. Dateikopf. */
  reasoningOpen?: boolean;
  /** Auf-/Zu-Wechsel, damit der Consumer ihn persistieren kann. Das Kit speichert nichts. */
  onReasoningToggle?: (open: boolean) => void;
  /** Dem Strom nach unten folgen. Default `true`. */
  follow?: boolean;
  /** Element, an dem `followTail` hängt. Default: der Body.
   *  **Für Wirte, die als Ganzes rollen.** Ist es gesetzt, misst `followTail` die
   *  `atBottom`-Schwelle dort und der Body hört auf, ein eigener Scroll-Container zu sein
   *  (Wurzelklasse `okit-stream--host-scroll`, Regel in `STREAM_AREA_CSS`) — sonst bräuchte
   *  so ein Wirt einen CSS-Override für etwas, das dieses Modul selbst verursacht.
   *  Anlass: `lingotuner` rollt sein Panel als Ganzes, damit auf kurzen Panels nichts
   *  verschwindet (Entscheidung 2026-09-11 nach einer 420→0-px-Messung). */
  scrollEl?: HTMLElement;
  /** Ab wie vielen Pixeln Abstand zum Ende „der Nutzer hat hochgescrollt" gilt. Default 40
   *  (Wert aus `vault-rag/src/chat_view.ts:203`). */
  followThreshold?: number;
  /** Zusatzklasse am Body, z. B. `markdown-rendered` für Obsidians eigene Markdown-Optik.
   *  Default keine — der erste Consumer (lingotuner) verlor sie bei der Übernahme still,
   *  weil sie vorher am eigenen Body-Element hing (Befund aus der ersten Adoption,
   *  2026-09-11). Kein Rezept-Satz, weil ein Satz beim nächsten Consumer wieder überlesen
   *  wird (CORE-META-17) — die Option ändert den Default nicht. */
  bodyCls?: string;
  /** Timer für die Quittung am Kopier-Knopf; Default `realClock`. Tests injizieren. */
  clock?: ClockPort;
}

export interface StreamArea {
  /** Wurzel des Bereichs — hier hängt der Consumer seine Aktionsleiste DARUNTER an. */
  readonly rootEl: HTMLElement;
  /** Scroll-Container für den fertigen Text. Consumer rendern hierhinein. */
  readonly bodyEl: HTMLElement;
  /** Der laufende Absatz. Bleibt Rohtext und liegt IM Body, am Ende. */
  readonly tailEl: HTMLElement;
  /** Statuszeile — der Consumer bestückt sie (z. B. mit dem §8-Status-Indikator). */
  readonly statusEl: HTMLElement;
  /** Woran `followTail` hängt — der Body, oder das per `scrollEl` übergebene Element. */
  readonly scrollEl: HTMLElement;
  /** Gedanken anhängen (Push-Konsumenten). Legt den Block beim ersten Aufruf an und folgt
   *  danach selbst (`followTail()`), symmetrisch zu `createStableWriter.push()`. */
  appendReasoning(text: string): void;
  /** Gedanken ersetzen (Snapshot-Konsumenten). Legt den Block beim ersten Aufruf an. */
  setReasoning(text: string): void;
  /** Aktueller Gedankentext ("" solange keiner kam). */
  reasoningText(): string;
  /** Die `<summary>`-Zeile des Gedankenblocks live fortschreiben (z. B. ein Token-Zähler
   *  „Denkt … N Token"). Erzwingt den Block NICHT — ohne einen vorherigen `appendReasoning`/
   *  `setReasoning` bleibt er lazy (s. Dateikopf); der Text wird dann für den nächsten
   *  entstehenden Block vorgemerkt. `reset()` setzt auf `strings.reasoning` zurück. */
  setReasoningSummary(text: string): void;
  /** Gedankenblock auf- oder zuklappen — zum Beispiel am Ende des Laufs zu, damit die fertige Antwort nicht von ihren Gedanken
   *  überragt wird. Ohne Block gilt der Wert für den, der später entsteht. `reset()` stellt `reasoningOpen` wieder her. Löst
   *  `onReasoningToggle` aus wie eine Handlung des Nutzers (das `toggle`-Ereignis unterscheidet nicht): wer dort die Wahl des
   *  Nutzers speichert, schaltet nicht ohne Not um. */
  setReasoningOpen(open: boolean): void;
  /** Den laufenden Absatz setzen. */
  setTail(text: string): void;
  tailText(): string;
  /** Ans Ende scrollen — aber nur, wenn der Nutzer nicht selbst hochgescrollt hat. Misst
   *  „unten?“ JETZT, also nach einem Wachstum: wuchs der Inhalt in einem Schritt um mehr als die
   *  Schwelle, gilt der Nutzer als hochgescrollt. Wer den Inhalt selbst ändert, nimmt
   *  `withFollow` (misst davor); `followTail()` bleibt für den Fall, dass nichts gewachsen ist. */
  followTail(): void;
  /** Führt `mutate` aus und folgt danach bis ans Ende — wenn der Nutzer VOR der Änderung unten
   *  war. Wer hochgescrollt hat, wird nicht gezogen. `appendReasoning`, `setReasoning`,
   *  `setTail` und `push` des `StableMarkdownWriter` laufen alle durch diese Regel; ein Absatz,
   *  eine Tabelle oder ein Codeblock, der in einem Zug kommt und höher ist als die Schwelle,
   *  reißt den Bereich damit nicht mehr vom Ende. Verschachtelt gilt die Messung der
   *  äußersten Stelle (die innere sieht bereits den gewachsenen Inhalt, folgt also nur, wenn
   *  sie ohnehin unten ist). */
  withFollow(mutate: () => void): void;
  /** Zurück auf Anfang: Body leer, Tail leer, Gedankenblock weg. Der nächste Lauf
   *  beginnt sichtbar neu, statt unter den vorigen zu schreiben. */
  reset(): void;
  /** Nur den Antworttext zurücknehmen: Body und Tail leer, Gedankenblock und seine Zusammenfassung bleiben. Für den Fall, dass
   *  sich der bisher gezeigte Text als Denken erweist (Gemma 4 ohne Öffner, `onContentReset` des Chat-Clients). */
  resetContent(): void;
}

/** Obsidians addClass wirft bei einem Leerzeichen (InvalidCharacterError) — mehrere Klassen einzeln. */
function addClasses(el: HTMLElement, cls: string | undefined): void {
  for (const c of (cls ?? "").split(/\s+/)) if (c !== "") el.addClass(c);
}

interface ReasoningBlockConfig {
  summary: string;
  copyLabel: string | undefined;
  copiedMessage: string | undefined;
  open: boolean;
  cls: string | undefined;
  onToggle: ((open: boolean) => void) | undefined;
  clock: ClockPort;
  /** Der Denktext, den der Kopier-Knopf liefert — wird beim Klick gelesen, nicht beim Bau (der Strom wächst). */
  getText: () => string;
}

/** Der Aufbau des Gedankenblocks, EINMAL: `details.okit-stream-reasoning > summary(label, Kopier-Knopf) + pre`.
 *  Der Strom-Bereich (`buildStreamArea`) und der Block nach dem Strom (`buildReasoningBlock`) bauen beide hierüber —
 *  zwei Bauplätze für dieselbe Form liefen auseinander (koda-agent hatte den zweiten, Doppelbau-Befund Runde 24). */
function createReasoningBlock(parent: HTMLElement, cfg: ReasoningBlockConfig): {
  det: HTMLDetailsElement; pre: HTMLElement; labelEl: HTMLElement; syncCopyButton: (hasText: boolean) => void; dispose: () => void;
} {
  const det = parent.createEl("details", { cls: "okit-stream-reasoning" });
  addClasses(det, cfg.cls);
  det.open = cfg.open;
  const summaryEl = det.createEl("summary");
  /** Der Text der Zusammenfassung steht in einem eigenen Span: `setText` auf dem `<summary>` selbst risse den Kopier-Knopf mit. */
  const labelEl = summaryEl.createSpan({ cls: "okit-stream-reasoning-label", text: cfg.summary });
  const pre = det.createEl("pre");
  const cb = cfg.onToggle;
  if (cb !== undefined) det.addEventListener("toggle", () => { cb(det.open); });

  let copyBtn: HTMLElement | null = null;
  let copiedTimer: number | null = null;

  const clearCopiedTimer = (): void => {
    if (copiedTimer !== null) { cfg.clock.clearTimeout(copiedTimer); copiedTimer = null; }
  };

  /** Quittung am Knopf: Häkchen statt Kopier-Symbol, dann zurück. Eine Notice ist optional (`copiedMessage`). */
  const flashCopied = (btn: HTMLElement): void => {
    clearCopiedTimer();
    setIcon(btn, "check");
    btn.addClass("is-copied");
    copiedTimer = cfg.clock.setTimeout(() => {
      copiedTimer = null;
      setIcon(btn, "copy");
      btn.removeClass("is-copied");
    }, COPIED_FLASH_MS);
  };

  /** Der Kopier-Knopf sitzt in der Zusammenfassung und erscheint erst, wenn der Block Text trägt (und verschwindet, wenn
   *  ein Snapshot den Text wieder leert). Der Klick klappt den Block nicht auf oder zu: `preventDefault` am `<summary>`-Klick. */
  const syncCopyButton = (hasText: boolean): void => {
    if (!hasText) {
      copyBtn?.remove();
      copyBtn = null;
      clearCopiedTimer();
      return;
    }
    if (copyBtn !== null) return;
    const btn = summaryEl.createEl("button", {
      cls: "clickable-icon okit-stream-reasoning-copy",
      attr: { type: "button", "aria-label": cfg.copyLabel ?? "Copy thinking" },
    });
    setIcon(btn, "copy");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const copyOpts: Parameters<typeof copyToClipboard>[1] = { onCopied: () => { flashCopied(btn); } };
      if (cfg.copiedMessage !== undefined) copyOpts.copiedMessage = cfg.copiedMessage;
      void copyToClipboard(cfg.getText(), copyOpts);
    });
    copyBtn = btn;
  };

  return { det, pre, labelEl, syncCopyButton, dispose: clearCopiedTimer };
}

export interface ReasoningBlockOptions {
  /** Der gespeicherte Denktext. Er steht unverändert im `<pre>` und ist das, was der Kopier-Knopf kopiert. */
  text: string;
  /** Dieselben Strings wie im Strom; `strings.reasoning` heißt hier `summary`, weil die Zeile nach dem Strom meist anders
   *  lautet als „Denkt nach…" (z. B. „Gedacht"). */
  strings: { summary: string; copyReasoning?: string; copiedReasoning?: string };
  /** Startzustand. Default `false` (zugeklappt): der Block gehört zu einer fertigen Antwort, nicht zu einem laufenden Strom. */
  open?: boolean;
  /** Zusätzliche Klassen am `<details>`, durch Leerraum getrennt — der Design-Scope des Consumers. */
  cls?: string;
  /** Auf-/Zu-Wechsel, damit der Consumer ihn persistieren kann. Das Kit speichert nichts. */
  onToggle?: (open: boolean) => void;
  /** Timer für die Quittung am Kopier-Knopf; Default `realClock`. Tests injizieren. */
  clock?: ClockPort;
}

/** Der Denkblock einer FERTIGEN Antwort aus gespeichertem Text — für alle, die einen Verlauf neu zeichnen, wenn die
 *  Stream-Blase längst weg ist. Gleiche DOM-Form, gleiche Klassen (`okit-stream-reasoning*`, CSS in `STREAM_AREA_CSS`) und
 *  derselbe Kopier-Knopf wie im Strom, sodass beide Zustände gleich aussehen. Gibt das `<details>` zurück.
 *  Wer keinen Gedanken hat, ruft die Funktion nicht auf: ein leerer Block ist Ballast (der Strom legt ihn deshalb lazy an). */
export function buildReasoningBlock(parent: HTMLElement, opts: ReasoningBlockOptions): HTMLElement {
  const { det, pre, syncCopyButton } = createReasoningBlock(parent, {
    summary: opts.strings.summary,
    copyLabel: opts.strings.copyReasoning,
    copiedMessage: opts.strings.copiedReasoning,
    open: opts.open ?? false,
    cls: opts.cls,
    onToggle: opts.onToggle,
    clock: opts.clock ?? realClock,
    getText: () => opts.text,
  });
  pre.setText(opts.text);
  syncCopyButton(opts.text !== "");
  return det;
}

export function buildStreamArea(parent: HTMLElement, opts: StreamAreaOptions): StreamArea {
  const follow = opts.follow ?? true;
  const threshold = opts.followThreshold ?? 40;
  const openByDefault = opts.reasoningOpen ?? true;
  /** Wie der nächste Gedankenblock beginnt; `setReasoningOpen` verstellt es, `reset()` stellt `openByDefault` wieder her. */
  let openNow = openByDefault;

  const rootEl = parent.createDiv({ cls: "okit-stream" });
  addClasses(rootEl, opts.cls);

  // Reihenfolge ist Teil des Vertrags: Gedanken über dem Text, Status unter beidem.
  // Der Gedankenblock entsteht erst beim ersten Gedanken — sein PLATZ steht aber schon
  // jetzt fest. Ein leerer Slot ist billiger als ein späteres `insertBefore`: die
  // Reihenfolge wird damit zur Bauform statt zur Einfügereihenfolge, und `reset` räumt
  // ihn per `empty()`, statt sich auf den Elternbezug eines Einzelknotens zu verlassen.
  const reasonSlot = rootEl.createDiv({ cls: "okit-stream-reasoning-slot" });
  const bodyEl = rootEl.createDiv({ cls: "okit-stream-body" });
  addClasses(bodyEl, opts.bodyCls);
  const scrollEl = opts.scrollEl ?? bodyEl;
  if (scrollEl !== bodyEl) rootEl.addClass("okit-stream--host-scroll");
  const tailEl = bodyEl.createDiv({ cls: "okit-stream-tail" });
  const statusEl = rootEl.createDiv({ cls: "okit-stream-status" });

  let reasonBlock: ReturnType<typeof createReasoningBlock> | null = null;
  let reasonRaw = "";
  let reasonSummaryText = opts.strings.reasoning;
  const clock = opts.clock ?? realClock;

  /** Legt den Gedankenblock einmalig an. Lazy, weil ein leeres `<details>` vor dem ersten
   *  Gedanken sichtbarer Ballast ist. */
  const ensureReasoning = (): ReturnType<typeof createReasoningBlock> => {
    reasonBlock ??= createReasoningBlock(reasonSlot, {
      summary: reasonSummaryText,
      copyLabel: opts.strings.copyReasoning,
      copiedMessage: opts.strings.copiedReasoning,
      open: openNow,
      cls: undefined,
      onToggle: opts.onReasoningToggle,
      clock,
      getText: () => reasonRaw,
    });
    return reasonBlock;
  };

  const atBottom = (): boolean => {
    // Fehlende Maße (frisches Element, kein Layout) ergeben 0 — und 0 < threshold heißt
    // „folgen". Das ist der gewollte Ausgang: der allererste Token soll sichtbar werden.
    const h = scrollEl.scrollHeight ?? 0;
    const t = scrollEl.scrollTop ?? 0;
    const c = scrollEl.clientHeight ?? 0;
    return h - t - c < threshold;
  };

  return {
    rootEl, bodyEl, tailEl, statusEl, scrollEl,

    appendReasoning(text: string): void {
      // Folgt selbst, symmetrisch zu push() im StableMarkdownWriter — sonst schiebt ein lange
      // denkendes Modell den Strom unter die Kante, ohne dass etwas folgt (Befund aus der
      // ersten Adoption, 2026-09-11: lingotuner rief followTail() bisher selbst nach
      // appendReasoning auf). „Unten?“ wird VOR dem Wachsen gemessen (Welle 20, kuro).
      this.withFollow(() => {
        const block = ensureReasoning();
        reasonRaw += text;
        block.pre.setText(reasonRaw);
        block.syncCopyButton(reasonRaw !== "");
      });
    },
    setReasoning(text: string): void {
      this.withFollow(() => {
        const block = ensureReasoning();
        reasonRaw = text;
        block.pre.setText(reasonRaw);
        block.syncCopyButton(reasonRaw !== "");
      });
    },
    reasoningText(): string { return reasonRaw; },
    setReasoningSummary(text: string): void {
      reasonSummaryText = text;
      reasonBlock?.labelEl.setText(text);
    },

    setTail(text: string): void { this.withFollow(() => { tailEl.setText(text); }); },
    tailText(): string { return tailEl.textContent ?? ""; },

    followTail(): void {
      if (!follow) return;
      if (!atBottom()) return;
      scrollEl.scrollTop = scrollEl.scrollHeight ?? 0;
    },

    withFollow(mutate: () => void): void {
      const war = follow && atBottom();
      mutate();
      if (war) scrollEl.scrollTop = scrollEl.scrollHeight ?? 0;
    },

    setReasoningOpen(open: boolean): void {
      openNow = open;
      if (reasonBlock !== null) reasonBlock.det.open = open;
    },

    resetContent(): void {
      // Der Tail wird GELEERT und neu eingehängt, nicht weggeworfen: Consumer halten eine
      // Referenz darauf (koda-agent tut es), die sonst ins Leere zeigte.
      bodyEl.empty();
      tailEl.setText("");
      bodyEl.appendChild(tailEl);
    },

    reset(): void {
      this.resetContent();
      reasonSlot.empty();
      reasonBlock?.dispose();
      reasonBlock = null;
      reasonRaw = "";
      reasonSummaryText = opts.strings.reasoning;
      openNow = openByDefault;
    },
  };
}

/** Gehört in die `styles.css` des Consumers — das Kit injiziert kein CSS.
 *  Nur Theme-Variablen, keine harten Farben oder Größen (UI-STANDARD). */
export const STREAM_AREA_CSS = `
.okit-stream { display: flex; flex-direction: column; min-height: 0; gap: var(--size-4-2); }
.okit-stream-body {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  font-size: var(--font-ui-small); line-height: var(--line-height-normal);
}
/* Rollt der Wirt selbst, ist der Body KEIN eigener Scroll-Container — sonst entstuende
   ein zweiter Rollbereich im ersten. Wird per Wurzelklasse geschaltet, nicht vom Consumer. */
.okit-stream--host-scroll .okit-stream-body { flex: 0 0 auto; min-height: auto; overflow-y: visible; }
.okit-stream-block > :first-child { margin-top: 0; }
.okit-stream-block > :last-child { margin-bottom: 0; }
/* Ein gekappter Link (der Wächter hat das href entfernt, Klasse und Pfeil-Icon blieben) sieht nicht mehr nach Link aus: Textfarbe, kein Unterstrich, kein Zeiger, kein Icon. Beide Selektoren
   tragen :not([href]), ein Link mit href ändert sich nicht (gemessen in Welle 28, Pilot link-schutz P13: berechnete Werte mit und ohne die Regel, ohne !important). */
.okit-stream-body a:not([href]) { color: inherit; text-decoration: none; cursor: inherit; }
.okit-stream-body a.external-link:not([href]) { background-image: none; padding-right: 0; }
/* overflow-wrap: eine lange Zeile ohne Leerzeichen (JSON im Antwort-Tail) lief rechts aus dem Panel (3d-codeblocks, Welle 23). */
.okit-stream-tail { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-muted); }
.okit-stream-status {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: var(--size-4-1);
  font-size: var(--font-ui-smaller); color: var(--text-muted);
}
.okit-stream-reasoning {
  flex: 0 0 auto;
  font-size: var(--font-ui-smaller); color: var(--text-muted);
}
.okit-stream-reasoning > summary { cursor: var(--cursor); color: var(--text-faint); }
/* Der Kopier-Knopf sitzt IN der Zusammenfassung, bleibt inline und nimmt der Zeile keine Höhe. */
.okit-stream-reasoning-copy {
  display: inline-flex; vertical-align: middle; margin-inline-start: var(--size-4-2);
  height: auto; padding: var(--size-2-1) var(--size-2-2);
  color: var(--text-faint);
}
.okit-stream-reasoning-copy.is-copied { color: var(--text-success); }
.okit-stream-reasoning-copy .svg-icon { width: var(--icon-xs); height: var(--icon-xs); }
.okit-stream-reasoning > pre {
  max-height: 12em; overflow-y: auto; white-space: pre-wrap;
  background: var(--background-secondary); padding: var(--size-4-2);
}
/* Ein leerer Slot bleibt Flex-Item und kostet einen gap — spürbar bei einem Wirt, der die
   Statuszeile nicht nutzt (Befund aus der ersten Adoption, 2026-09-11). */
.okit-stream-status:empty, .okit-stream-reasoning-slot:empty { display: none; }
`;
