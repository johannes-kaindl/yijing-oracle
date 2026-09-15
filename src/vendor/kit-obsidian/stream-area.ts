// vendored from obsidian-kit@0.35.0, src/obsidian/stream-area.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
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

/** Sichtbare Texte. Kein Default: das Kit schreibt keine Sprache fest (UI-STANDARD §10). */
export interface StreamAreaStrings {
  /** `<summary>` des Gedankenblocks, z. B. „Denkt nach…". */
  reasoning: string;
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
  /** Gedanken anhängen (Push-Konsumenten). Legt den Block beim ersten Aufruf an. */
  appendReasoning(text: string): void;
  /** Gedanken ersetzen (Snapshot-Konsumenten). Legt den Block beim ersten Aufruf an. */
  setReasoning(text: string): void;
  /** Aktueller Gedankentext ("" solange keiner kam). */
  reasoningText(): string;
  /** Den laufenden Absatz setzen. */
  setTail(text: string): void;
  tailText(): string;
  /** Ans Ende scrollen — aber nur, wenn der Nutzer nicht selbst hochgescrollt hat. */
  followTail(): void;
  /** Zurück auf Anfang: Body leer, Tail leer, Gedankenblock weg. Der nächste Lauf
   *  beginnt sichtbar neu, statt unter den vorigen zu schreiben. */
  reset(): void;
}

export function buildStreamArea(parent: HTMLElement, opts: StreamAreaOptions): StreamArea {
  const follow = opts.follow ?? true;
  const threshold = opts.followThreshold ?? 40;
  const openByDefault = opts.reasoningOpen ?? true;

  const rootEl = parent.createDiv({ cls: "okit-stream" });
  if (opts.cls !== undefined && opts.cls !== "") rootEl.addClass(opts.cls);

  // Reihenfolge ist Teil des Vertrags: Gedanken über dem Text, Status unter beidem.
  // Der Gedankenblock entsteht erst beim ersten Gedanken — sein PLATZ steht aber schon
  // jetzt fest. Ein leerer Slot ist billiger als ein späteres `insertBefore`: die
  // Reihenfolge wird damit zur Bauform statt zur Einfügereihenfolge, und `reset` räumt
  // ihn per `empty()`, statt sich auf den Elternbezug eines Einzelknotens zu verlassen.
  const reasonSlot = rootEl.createDiv({ cls: "okit-stream-reasoning-slot" });
  const bodyEl = rootEl.createDiv({ cls: "okit-stream-body" });
  const scrollEl = opts.scrollEl ?? bodyEl;
  if (scrollEl !== bodyEl) rootEl.addClass("okit-stream--host-scroll");
  const tailEl = bodyEl.createDiv({ cls: "okit-stream-tail" });
  const statusEl = rootEl.createDiv({ cls: "okit-stream-status" });

  let reasonPre: HTMLElement | null = null;
  let reasonRaw = "";

  /** Legt den Gedankenblock einmalig an. Lazy, weil ein leeres `<details>` vor dem ersten
   *  Gedanken sichtbarer Ballast ist. */
  const ensureReasoning = (): HTMLElement => {
    if (reasonPre !== null) return reasonPre;
    const det = reasonSlot.createEl("details", { cls: "okit-stream-reasoning" });
    det.open = openByDefault;
    det.createEl("summary", { text: opts.strings.reasoning });
    reasonPre = det.createEl("pre");
    const cb = opts.onReasoningToggle;
    if (cb !== undefined) det.addEventListener("toggle", () => { cb(det.open); });
    return reasonPre;
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
      const pre = ensureReasoning();
      reasonRaw += text;
      pre.setText(reasonRaw);
    },
    setReasoning(text: string): void {
      const pre = ensureReasoning();
      reasonRaw = text;
      pre.setText(reasonRaw);
    },
    reasoningText(): string { return reasonRaw; },

    setTail(text: string): void { tailEl.setText(text); },
    tailText(): string { return tailEl.textContent ?? ""; },

    followTail(): void {
      if (!follow) return;
      if (!atBottom()) return;
      scrollEl.scrollTop = scrollEl.scrollHeight ?? 0;
    },

    reset(): void {
      // Der Tail wird GELEERT und neu eingehängt, nicht weggeworfen: Consumer halten eine
      // Referenz darauf (koda-agent tut es), die sonst ins Leere zeigte.
      bodyEl.empty();
      tailEl.setText("");
      bodyEl.appendChild(tailEl);
      reasonSlot.empty();
      reasonPre = null;
      reasonRaw = "";
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
.okit-stream-tail { white-space: pre-wrap; color: var(--text-muted); }
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
.okit-stream-reasoning > pre {
  max-height: 12em; overflow-y: auto; white-space: pre-wrap;
  background: var(--background-secondary); padding: var(--size-4-2);
}
`;
