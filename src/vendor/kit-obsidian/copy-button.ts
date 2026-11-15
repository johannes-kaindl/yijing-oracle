// vendored from obsidian-kit@0.93.0, src/obsidian/copy-button.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Kopier-Knopf mit Quittung: ein Symbolknopf, der einen Text in die Zwischenablage legt und dann kurz einen Haken zeigt.
//
// Warum es ihn gibt (Welle 33, Auftrag F, Paket 7): dieselbe Logik (`setIcon` copy/check, 1500 ms, `is-copied`, Tippfläche am Handy) stand dreimal im Bestand,
// privat in `stream-area` (Gedankenblock), in `chat-window` (unter Antwort und Frage) und in koda-agent (`view.ts`, `answerCopyButton`, weil `chat-window` den Knopf nicht
// exportierte und Koda das Chat-Fenster nicht trägt). Die Fassungen unterschieden sich in vier Punkten, hier mit Grund entschieden:
//   1. **Zeitgeber:** `stream-area` setzte die Frist bei jedem Klick neu und räumte sie beim Abbau auf; `chat-window` ließ bei einem zweiten Klick vor Ablauf den ersten Zeitgeber
//      weiterlaufen (der Haken verschwand zu früh), räumte aber beim Abbau auf; koda tat keins von beidem und nahm die echte Uhr statt einer injizierten. Übernommen: ein Zeitgeber je Knopf,
//      neu gesetzt bei jedem Klick, aufgeräumt in `dispose`, Uhr injizierbar (`clock`, Vorgabe `realClock`).
//   2. **Wann quittiert wird:** `chat-window` quittierte nur bei Erfolg und nicht mehr nach dem Abbau (`destroyed`); `stream-area` und koda über `onCopied` von `copyToClipboard`, das nur bei Erfolg
//      läuft. Übernommen: nur bei Erfolg, nie nach `dispose`.
//   3. **Kopierer:** `chat-window` lässt den Kopierer des Plugins ersetzen (`copy`, etwa für Tests); die anderen rufen `copyToClipboard`. Übernommen als Option `copy`, Vorgabe `copyToClipboard`
//      mit `copiedMessage` als Notice (fehlt der Text oder ist er leer, gibt es keine).
//   4. **Klick im `<summary>`:** nur der Knopf des Gedankenblocks sitzt in einem `<summary>` und darf ihn nicht auf- oder zuklappen (`preventDefault`, `stopPropagation`): Option `stopClick`, sonst aus.
// Maße (aus koda-agent, am iPhone von Johannes bestanden: treffbar, ohne die Zeile darüber zu erwischen): Symbol `--icon-xs`, am Desktop wie bisher, auf Mobil eine unsichtbare Tippfläche von
// 44 px (`::after`, drei Klassen tief, damit Obsidians Mobilregeln sie nicht überstimmen). Das Kit-Chat-Fenster maß dort vorher 26 × 22 px (Befund kit-w29).
//
// Der Knopf trägt `okit-copy-button` und optional die Klasse des Konsumenten (`cls`), die als Griff für Tests und Treiber bleibt (`okit-chat-copy`, `okit-stream-reasoning-copy`, `koda-copy`).

import { setIcon } from "obsidian";
import { realClock, type ClockPort } from "./clock";
import { copyToClipboard } from "./clipboard";

/** Wie lange der Haken steht, bevor das Kopier-Symbol zurückkommt. */
export const COPY_BUTTON_FLASH_MS = 1500;

export interface CopyButtonOptions {
  /** `aria-label` des Knopfs (in der Sprache des Konsumenten). */
  label: string;
  /** Der Text, der kopiert wird; eine Funktion wird bei jedem Klick frisch gelesen (der Text kann sich seit dem Bau geändert haben). */
  text: string | (() => string);
  /** Zusatzklasse neben `okit-copy-button`: der Griff des Konsumenten für Tests, Treiber und eigene Regeln. */
  cls?: string;
  /** Läuft nach der Quittung, nur bei Erfolg. */
  onCopied?: () => void;
  /** Text der Notice nach dem Kopieren; fehlt er oder ist er leer, gibt es keine Notice (die Quittung steht am Knopf). Gilt nur mit dem Standard-Kopierer. */
  copiedMessage?: string;
  /** Eigener Kopierer statt `copyToClipboard`: `true` heißt kopiert. */
  copy?: (text: string) => Promise<boolean>;
  /** Ein Wurf des eigenen Kopierers (`copy`); ohne den Haken geht er verloren. */
  onError?: (error: unknown) => void;
  /** `preventDefault` und `stopPropagation` am Klick: nötig, wenn der Knopf in einem `<summary>` sitzt. Vorgabe aus. */
  stopClick?: boolean;
  /** Zeitgeber für die Quittung; Vorgabe `realClock`. */
  clock?: ClockPort;
}

export interface CopyButton {
  el: HTMLElement;
  /** Räumt den Zeitgeber der Quittung auf; danach quittiert der Knopf nicht mehr. Das Element bleibt Sache des Elternelements. */
  dispose(): void;
}

export function createCopyButton(parent: HTMLElement, o: CopyButtonOptions): CopyButton {
  const clock = o.clock ?? realClock;
  const el = parent.createEl("button", {
    cls: o.cls === undefined || o.cls === "" ? "clickable-icon okit-copy-button" : `clickable-icon okit-copy-button ${o.cls}`,
    attr: { type: "button", "aria-label": o.label },
  });
  setIcon(el, "copy");
  let timer: number | null = null;
  let disposed = false;
  const clearTimer = (): void => {
    if (timer !== null) { clock.clearTimeout(timer); timer = null; }
  };
  const flash = (): void => {
    if (disposed) return;
    clearTimer();
    setIcon(el, "check");
    el.addClass("is-copied");
    timer = clock.setTimeout(() => {
      timer = null;
      setIcon(el, "copy");
      el.removeClass("is-copied");
    }, COPY_BUTTON_FLASH_MS);
    o.onCopied?.();
  };
  el.addEventListener("click", (ev) => {
    if (o.stopClick === true) { ev.preventDefault(); ev.stopPropagation(); }
    const value = typeof o.text === "function" ? o.text() : o.text;
    if (o.copy !== undefined) {
      o.copy(value).then((ok) => { if (ok) flash(); }).catch((e: unknown) => { o.onError?.(e); });
      return;
    }
    void copyToClipboard(value, { ...(o.copiedMessage !== undefined && o.copiedMessage !== "" ? { copiedMessage: o.copiedMessage } : {}), onCopied: flash });
  });
  return { el, dispose: () => { disposed = true; clearTimer(); } };
}

/** Regeln des Kopier-Knopfs. Seit 0.89.0 setzen `CHAT_WINDOW_CSS` und `STREAM_AREA_CSS` sie nicht mehr ein (eine Einsetzung landete als Rohtext in der `styles.css` der Konsumenten): wer das Chat-Fenster, den Stream-Bereich oder den Knopf allein nutzt, kopiert diese Konstante einmal in seine `styles.css`, zusätzlich zu den anderen.
 *  Die Tippfläche von 44 px (`calc(var(--size-4-10) + var(--size-4-1))`) gilt nur auf Mobil; die Regel nennt die Klasse zweimal tief, weil Obsidians Mobilregeln eine einfache Klasse überstimmen. */
export const COPY_BUTTON_CSS = `
.okit-copy-button { color: var(--text-faint); height: auto; padding: var(--size-2-1) var(--size-2-2); }
.okit-copy-button.is-copied { color: var(--text-success); }
.okit-copy-button .svg-icon { width: var(--icon-xs); height: var(--icon-xs); }
.is-mobile .okit-copy-button { position: relative; }
.is-mobile .okit-copy-button::after { content: ""; position: absolute; top: 50%; left: 50%; width: calc(var(--size-4-10) + var(--size-4-1)); height: calc(var(--size-4-10) + var(--size-4-1)); transform: translate(-50%, -50%); }
`;
