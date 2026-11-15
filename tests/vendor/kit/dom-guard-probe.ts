// vendored from obsidian-kit@0.93.0, src/testing/dom-guard-probe.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Testbaustein für den Linkschutz-Wächter (`attachDomGuard`): die Härtungs-Fälle als Struktur im DOM, ein Aufruf statt eines lokalen Helfers je Plugin.
// Herkunft: vault-rag `tests/dom_guard_haertung.test.ts` (Gegenprobe außerhalb des Beobachters), die Fälle aus code-kit@0.73.0 `scripts/lib/link-guard-cases.mjs` (Opus-Review
// des Linkschutzes, 2026-11-12, Chromium 148 und 153; dort fährt dieselbe Liste im echten Chromium). Wer den Baustein vendort, findet ihn unter `tests/vendor/kit/`.
//
// ## Lesart für Plugins (T4)
//
// Eine Testdatei mit `// @vitest-environment happy-dom` und drei Zeilen:
//
//     import { attachDomGuard } from "../src/vendor/kit-obsidian/dom-guard";
//     import { probeDomGuard } from "./vendor/kit/dom-guard-probe";
//     it("der Wächter hält", async () => { expect((await probeDomGuard(attachDomGuard)).filter((x) => x.state !== "held")).toEqual([]); });
//
// Gemessen wird die Kopie, die das Plugin ausliefert (T1): der Baustein importiert weder `obsidian` noch `vitest` noch `dom-guard`, der Prüfling kommt als Funktion vom Aufrufer.
// Ein Helfer, der das Kit-eigene `dom-guard` importierte, prüfte im Plugin immer den neuesten Stand und könnte gegen eine alte Kopie nie rot werden.
//
// ## Was `probeDomGuard(attach, opts?)` tut (T2)
//
// Je Fall: das `html` kommt einmal per `innerHTML` in einen Behälter OHNE Wächter (Gegenprobe) und einmal in einen lebenden Behälter UNTER dem Wächter, in dem schon Text steht
// (der Strom läuft; der Wächter hängt am Behälter, bevor das HTML kommt). Nach `opts.waitMs` (Standard 50, Rahmen-Fälle `opts.frameWaitMs`, Standard 400, über der Rahmen-Frist von 250 ms)
// liest der Baustein `dangerous` und `kept`. Ergebnis je Fall `{ id, group, state, detail }`:
// - `held`: unter dem Wächter ist `dangerous` falsch und `kept` wahr.
// - `leak`: unter dem Wächter ist `dangerous` wahr oder `kept` falsch (ein Wächter, der zu viel wegnimmt, hält nicht), oder der Wächter wirft.
// - `invalid`: die Gegenprobe zeigt die Gefahr nicht (oder `dangerous` wirft): die Messung kann an dieser Stelle nicht rot werden (CORE-TEST-08). Ein Plugin-Test, der nur `held` zulässt,
//   wird davon rot, statt still nichts zu messen.
// `detail` nennt, welche Prüfung kippte, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). Behälter und Wächter werden nach jedem Fall abgebaut (`disconnect`, entfernen),
// auch bei einem Wurf, damit der nächste Fall nicht den Behälter des vorigen misst.
// Die Positivkontrolle `control-https-link` (ein `https:`-Link behält sein `href`) läuft in jedem Aufruf mit: sie fängt einen Wächter, der alles wegnimmt.
// Der Baustein liest den eingefügten Teilbaum auch dann, wenn der Wächter ihn aus dem Behälter genommen hat. Ein Wächter, der den eingefügten Knoten ganz entfernt, statt ihn zu entschärfen, wird deshalb als
// `leak` gemeldet. Das ist ein vorsichtiger Fehlalarm, kein falsches Grün (gemessen vom Kit-Master mit einem Wächter, der den Behälter leert: 36 `leak`, die Positivkontrolle `held`). Der Wächter des Kits
// entschärft nur und ist davon nicht betroffen.
//
// ## Die Fälle (T3) und was nicht übernommen ist
//
// Übernommen sind die Fälle, deren Halten sich als Struktur im DOM zeigt, mit den `id`s der Fallliste (Chromium-Messung und happy-dom-Test sprechen dieselbe Sprache):
// U1 (jedes `on*`-Attribut: sieben Fälle der Gruppe U1 und die beiden Fälle `svg-rect-onclick`, `img-onerror` der Gruppe `held`), U2 (Formulare, `formaction`, `form`-Verweis), U5 (`ping`),
// `held` (`javascript:`- und `obsidian:`-Links samt Entitäten- und Tab-Schreibweisen, `area`, `svg a`, `srcdoc`, `style`-Attribut mit `url()`, `td background`),
// N-A und N-B (`form`, `commandfor`, `command`, `popovertarget`, `label for` auf ein Element der Wirtsseite) und die Rahmen-Fälle (der wartende Rahmen ist nackt und versteckt, er ist nach der Frist weg,
// er trägt keinen Text und kein Stylesheet).
// NICHT übernommen, mit Grund:
// - die Gruppe `limit` (iframe-onload, object-onerror, img-src, link-stylesheet, style-import, object-data, embed-src, meta-refresh, shadow-link, frame-skeleton-in-the-task-of-the-pass,
//   object-style-request-at-insertion): das sind dokumentierte Grenzen, die im echten Chromium als Wirkung BEIM EINFÜGEN lecken sollen (Anfrage, Navigation); happy-dom bildet diese Wirkung nicht nach, ein
//   Strukturtest dazu sagte nichts.
// - alles, was einen Klick, eine Navigation oder eine Anfrage misst (`drive: click|hover`, `watch: req|nav`): happy-dom führt keine Handler aus und navigiert nicht. Die Fälle, die in der Fallliste nur wegen
//   dieser Wirkung messen, gelten hier über die Struktur, die sie auslöst (das Attribut oder Element, das der Wächter entfernen muss).
// - `svg-style` (ein `<style>` mit `url()` in einem `<svg>`): happy-dom verwirft beim Parsen den Text des `<style>` im SVG und das folgende `<rect>` (gemessen, happy-dom der Version dieses Repos:
//   `<svg><style>rect{fill:url(…)}</style><rect/></svg>` ergibt `<svg><style></style></svg>`); die Gegenprobe ohne Wächter zeigt die Gefahr dort nie, die Messung könnte nicht rot werden.
// - `frame-skeleton-style-rule` und `frame-skeleton-nested-style-rule` messen in Chromium die WIRKUNG einer Regel (`getComputedStyle`); hier gilt die Struktur dahinter: das wartende Gerüst trägt kein `<style>`.
//   Das ist ein Stellvertreter, kein gleicher Befund.
// Wo der Baustein bei einem Fall in happy-dom anders misst als Chromium, steht es beim Fall (`note`). Die Rahmen tragen `src="about:blank"` statt einer Adresse: happy-dom lädt eine `src` wirklich (Netzfehler im Testlauf), der Wächter entscheidet nach dem Tag.

/** Der Prüfling: hängt einen Wächter an `el` (vor dem Rendern) und gibt ein Handle mit `disconnect` zurück. Das `attachDomGuard` des Plugins passt. */
export type AttachGuard = (el: HTMLElement) => { disconnect(): void };

export interface ProbeCase {
  /** Name aus `link-guard-cases.mjs` (code-kit); dieselbe `id` in der Chromium-Messung. */
  id: string;
  group: "U1" | "U2" | "U5" | "held" | "N-A" | "N-B" | "control";
  /** Was ein Renderer im Behälter hinterlässt. */
  html: string;
  /** Was die Gefahr ist, in Worten (für `detail`). */
  danger: string;
  /** Ist die Gefahr im Behälter `root` noch da? Ohne Wächter muss das wahr sein, sonst ist die Messung ungültig (`invalid`). */
  dangerous(root: Element): boolean;
  /** Was bleiben muss (Gegenprobe gegen einen Wächter, der alles wegnimmt); fehlt es, wird nichts verlangt. */
  kept?(root: Element): boolean;
  /** Was `kept` verlangt, in Worten. */
  keeps?: string;
  /** Der Fall wartet die Rahmen-Frist ab (`opts.frameWaitMs`) statt `opts.waitMs`. */
  frameDelay?: boolean;
  /** Positivkontrolle: es gibt keine Gefahr (`dangerous` ist immer falsch), sie prüft nur `kept`. */
  control?: boolean;
  /** Wo happy-dom anders misst als Chromium. */
  note?: string;
}

export type ProbeState = "held" | "leak" | "invalid";
export interface ProbeResult { id: string; group: ProbeCase["group"]; state: ProbeState; detail: string }

export interface ProbeOptions {
  /** Das DOM, in dem gemessen wird (Standard: das globale `document`, also happy-dom). */
  doc?: Document;
  /** Wartezeit nach dem Einsetzen, bevor gelesen wird (Standard 50 ms; der Wächter arbeitet in einem Beobachter). */
  waitMs?: number;
  /** Wartezeit der Fälle mit Rahmen-Frist (Standard 400 ms, die Frist ist 250 ms). */
  frameWaitMs?: number;
  /** Eigene Fallliste statt `DOM_GUARD_PROBE_CASES` (für Tests des Bausteins). */
  cases?: readonly ProbeCase[];
}

const all = (root: Element): Element[] => Array.from(root.querySelectorAll("*"));
const names = (el: Element): string[] => el.getAttributeNames().map((n) => n.toLowerCase());
const anyAttr = (root: Element, test: (name: string) => boolean): boolean => all(root).some((el) => names(el).some(test));
/** Wert ohne Steuerzeichen und Leerraum, kleingeschrieben: so liest der Browser ein Link-Ziel, das mit Tabs und Zeilenumbrüchen getarnt ist. */
const flat = (v: string | null): string => Array.from(v ?? "").filter((ch) => ch.charCodeAt(0) > 32).join("").toLowerCase();
const linkSchemes = (root: Element): string[] => all(root).flatMap((el) => [flat(el.getAttribute("href")), flat(el.getAttribute("xlink:href"))]);
const hasHandler = (root: Element): boolean => anyAttr(root, (n) => n.startsWith("on"));
const frames = (root: Element): Element[] => all(root).filter((el) => ["iframe", "object", "embed", "frame"].includes(el.localName));

const U1 = (id: string, group: "U1" | "held", html: string, note?: string): ProbeCase =>
  ({ id, group, html, danger: "ein on*-Attribut bleibt stehen", dangerous: hasHandler, ...(note ? { note } : {}) });
const FORMS = (root: Element): boolean => all(root).some((el) => el.localName === "form") || anyAttr(root, (n) => n === "formaction" || n === "form");
const U2 = (id: string, html: string): ProbeCase => ({ id, group: "U2", html, danger: "ein Formular, formaction oder form=\"id\" bleibt stehen", dangerous: FORMS });
const JS = "javascript:void(top.__pwn=(top.__pwn||0)+1)";

/** Die Fälle des Bausteins (T3). Die Reihenfolge folgt der Fallliste. */
export const DOM_GUARD_PROBE_CASES: readonly ProbeCase[] = [
  // U1: Ereignis-Attribute an jedem Element
  U1("details-ontoggle", "U1", `<details open ontoggle="window.__x=1"><summary>s</summary>t</details>`),
  U1("div-onanimationstart", "U1", `<div style="animation:okfade 10ms" onanimationstart="window.__x=1">a</div>`),
  U1("input-autofocus-onfocus", "U1", `<input autofocus onfocus="window.__x=1">`),
  U1("p-onmouseover", "U1", `<p onmouseover="window.__x=1">hover</p>`),
  { ...U1("a-http-onclick", "U1", `<a href="https://example.invalid/ok.html" onclick="window.__x=1;return false">x</a>`), keeps: "der https-Link behält sein href",
    kept: (root) => root.querySelector("a")?.getAttribute("href") === "https://example.invalid/ok.html" },
  U1("style-onload", "U1", `<style onload="window.__x=1">p{}</style>`),
  U1("video-source-onerror", "U1", `<video><source src="nope.mp4" onerror="window.__x=1"></video>`),
  U1("svg-rect-onclick", "held", `<svg width="10" height="10"><rect onclick="window.__x=1" width="10" height="10"/></svg>`),
  U1("img-onerror", "held", `<img src="nope" onerror="window.__x=1">`),

  // U2: Formulare navigieren oder führen Code aus, egal was die Schalter sagen
  U2("form-action-js", `<form action="${JS}"><button>go</button></form>`),
  U2("form-formaction-js", `<form><button formaction="${JS}">go</button></form>`),
  U2("form-submit-formaction-js", `<form><input type="submit" formaction="${JS}"></form>`),
  U2("form-image-formaction-js", `<form><input type="image" formaction="${JS}" alt="go"></form>`),
  U2("button-form-attr-js", `<form id="f9"></form><button form="f9" formaction="${JS}">go</button>`),
  U2("form-action-obsidian", `<form action="obsidian://open"><input type="hidden" name="vault" value="other"><button>go</button></form>`),
  U2("form-action-evil-get", `<form action="https://example.invalid/form.html"><input name="q" value="secret"><button>go</button></form>`),

  // U5: ping schickt einen POST an eine Adresse, die der Leser nicht sieht; das Ziel des Links bleibt erlaubt
  { id: "a-http-ping", group: "U5", html: `<a href="https://example.invalid/ok.html" ping="https://example.invalid/ping">x</a>`, danger: "ein ping-Attribut bleibt stehen",
    dangerous: (root) => anyAttr(root, (n) => n === "ping"), keeps: "der https-Link behält sein href", kept: (root) => root.querySelector("a")?.getAttribute("href") === "https://example.invalid/ok.html" },

  // gehalten vorher und nachher: Links
  { id: "a-js", group: "held", html: `<a href="${JS}">x</a>`, danger: "ein javascript:-Ziel bleibt stehen", dangerous: (root) => linkSchemes(root).some((v) => v.startsWith("javascript:")) },
  { id: "a-js-entity", group: "held", html: `<a href="&#106;avascript&colon;void(top.__pwn=1)">x</a>`, danger: "ein javascript:-Ziel (Entitäten) bleibt stehen", dangerous: (root) => linkSchemes(root).some((v) => v.startsWith("javascript:")) },
  { id: "a-js-tab-inner", group: "held", html: `<a href="java&#x09;scr&#x0A;ipt:void(top.__pwn=1)">x</a>`, danger: "ein javascript:-Ziel (Tab und Zeilenumbruch mitten im Wort) bleibt stehen", dangerous: (root) => linkSchemes(root).some((v) => v.startsWith("javascript:")) },
  { id: "area-js", group: "held", html: `<map name="m"><area shape="default" href="${JS}"></map>`, danger: "ein javascript:-Ziel an einem area bleibt stehen", dangerous: (root) => linkSchemes(root).some((v) => v.startsWith("javascript:")) },
  { id: "a-obsidian", group: "held", html: `<a href="obsidian://open?vault=other">x</a>`, danger: "ein obsidian:-Ziel bleibt stehen (der Schalter allowObsidianLinks ist aus)", dangerous: (root) => linkSchemes(root).some((v) => v.startsWith("obsidian:")) },
  { id: "svg-a-js", group: "held", html: `<svg width="20" height="20"><a href="${JS}"><rect width="20" height="20"/></a></svg>`, danger: "ein javascript:-Ziel an einem svg-a bleibt stehen", dangerous: (root) => linkSchemes(root).some((v) => v.startsWith("javascript:")) },
  // gehalten vorher und nachher: Code und Ressourcen, die die Durchgänge in jedem Arm fangen
  { id: "iframe-srcdoc", group: "held", html: `<iframe srcdoc="<script>parent.__pwn=1</script>"></iframe>`, danger: "ein srcdoc-Attribut bleibt stehen", dangerous: (root) => anyAttr(root, (n) => n === "srcdoc") },
  { id: "style-attr-bg", group: "held", html: `<p style="background-image:url('https://example.invalid/abg.gif')">x</p>`, danger: "ein style-Attribut mit url() bleibt stehen",
    dangerous: (root) => all(root).some((el) => /url\(/i.test(el.getAttribute("style") ?? "")) },
  { id: "td-background", group: "held", html: `<table><tr><td background="https://example.invalid/tdb.gif">x</td></tr></table>`, danger: "ein background-Attribut bleibt stehen", dangerous: (root) => anyAttr(root, (n) => n === "background") },

  // N-A und N-B: Attribute, die ein Element der Wirtsseite beim Namen nennen (die Wirtsseite selbst gehört nicht zum Behälter)
  { id: "button-form-hostform", group: "N-A", html: `<button form="hostform">go</button>`, danger: "ein form-Verweis auf die Wirtsseite bleibt stehen", dangerous: (root) => anyAttr(root, (n) => n === "form"),
    keeps: "der Knopf bleibt", kept: (root) => root.querySelector("button") !== null },
  { id: "button-form-host-formaction", group: "N-A", html: `<button form="hostformjs" formaction="https://example.invalid/fa.html">go</button>`, danger: "ein form-Verweis auf die Wirtsseite bleibt stehen",
    dangerous: (root) => anyAttr(root, (n) => n === "form"), keeps: "ein formaction mit https-Ziel bleibt (Regel wie beim href)",
    kept: (root) => root.querySelector("button")?.getAttribute("formaction") === "https://example.invalid/fa.html" },
  { id: "button-commandfor-host-dialog", group: "N-B", html: `<button commandfor="hostdlg" command="show-modal">go</button>`, danger: "commandfor oder command bleibt stehen",
    dangerous: (root) => anyAttr(root, (n) => n === "commandfor" || n === "command") },
  { id: "button-popovertarget-host", group: "N-B", html: `<button popovertarget="hostpop">go</button>`, danger: "popovertarget bleibt stehen", dangerous: (root) => anyAttr(root, (n) => n === "popovertarget" || n === "popovertargetaction") },
  { id: "label-for-host-checkbox", group: "N-B", html: `<label for="hostcb">x</label>`, danger: "ein for-Attribut am label bleibt stehen",
    dangerous: (root) => all(root).some((el) => el.localName === "label" && el.hasAttribute("for")), keeps: "das label bleibt", kept: (root) => root.querySelector("label") !== null },

  // Rahmen: ein Rahmen, der das lebende Dokument verlässt, geht verzögert (Obsidians Hauptprozess wirft, wenn er im Zug seines Einfügens verschwindet)
  { id: "frame-skeleton-is-bare-and-hidden", group: "held", html: `<iframe src="about:blank" name="n" onload="1"></iframe>`, danger: "der wartende Rahmen trägt Attribute (mehr als hidden) oder ist nicht versteckt",
    dangerous: (root) => frames(root).some((f) => f.attributes.length !== 1 || !f.hasAttribute("hidden")) },
  { id: "frame-gone-after-the-delay", group: "held", html: `<iframe src="about:blank"></iframe><object data="nope.bin" type="text/html"></object><embed src="nope.bin" type="text/html">`,
    danger: "ein Rahmen (iframe, object, embed) ist nach der Rahmen-Frist noch da", dangerous: (root) => frames(root).length > 0, frameDelay: true },
  { id: "frame-skeleton-keeps-no-text", group: "held", html: `<object data="nope.bin">fallback <b>text</b></object>`, danger: "der wartende Rahmen trägt noch Text", dangerous: (root) => (root.textContent ?? "") !== "" },
  { id: "frame-skeleton-style-rule", group: "held", html: `<object data="nope.bin"><style>body{--okit-probe:1}</style></object>`, danger: "der wartende Rahmen trägt ein style-Element",
    dangerous: (root) => all(root).some((el) => el.localName === "style"), note: "Chromium misst die Wirkung der Regel (getComputedStyle), hier die Struktur dahinter" },
  { id: "frame-skeleton-nested-style-rule", group: "held", html: `<object data="nope.bin"><div><svg width="10" height="10"><style>body{--okit-probe2:1}</style></svg></div></object>`, danger: "der wartende Rahmen trägt ein style-Element tiefer im Teilbaum",
    dangerous: (root) => all(root).some((el) => el.localName === "style"), note: "Chromium misst die Wirkung der Regel (getComputedStyle), hier die Struktur dahinter" },

  // Positivkontrolle: ein https:-Link behält sein href. Ohne sie bestünde ein Wächter, der alles wegnimmt.
  { id: "control-https-link", group: "control", html: `<a href="https://example.org/ok">x</a>`, danger: "(keine: Positivkontrolle)", dangerous: () => false, control: true,
    keeps: "der https-Link behält sein href", kept: (root) => root.querySelector("a")?.getAttribute("href") === "https://example.org/ok" },
];

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Liest ein Prädikat; ein Wurf ist ein Befund des Falls, kein Absturz des Laufs. */
function read(f: () => boolean): { value: boolean; error?: string } {
  try { return { value: f() }; } catch (error) { return { value: false, error: String(error) }; }
}

async function probeOne(attach: AttachGuard, c: ProbeCase, doc: Document, waitMs: number): Promise<ProbeResult> {
  const base = { id: c.id, group: c.group };
  // Gegenprobe: dasselbe HTML ohne Wächter. Zeigt sie die Gefahr nicht, kann die Messung unter dem Wächter nie rot werden.
  const outside = doc.body.appendChild(doc.createElement("div"));
  try {
    const innerOut = outside.appendChild(doc.createElement("div"));
    innerOut.innerHTML = c.html;
    const danger = read(() => c.dangerous(innerOut));
    if (danger.error !== undefined) return { ...base, state: "invalid", detail: `die Gegenprobe wirft beim Lesen von „${c.danger}“: ${danger.error}` };
    if (!c.control && !danger.value) return { ...base, state: "invalid", detail: `die Gegenprobe ohne Wächter zeigt „${c.danger}“ nicht: die Messung kann hier nicht rot werden` };
    if (c.kept) {
      const keptOut = read(() => c.kept?.(innerOut) ?? true);
      if (!keptOut.value) return { ...base, state: "invalid", detail: `die Gegenprobe ohne Wächter erfüllt „${c.keeps ?? "kept"}“ nicht: die Messung kann hier nicht grün werden` };
    }
  } finally {
    outside.remove();
  }
  const host = doc.body.appendChild(doc.createElement("div"));
  let handle: { disconnect(): void } | null = null;
  try {
    try { handle = attach(host); } catch (error) { return { ...base, state: "leak", detail: `der Wächter wirft beim Anhängen: ${String(error)}` }; }
    // Der Strom läuft: Text steht schon im Behälter, das rohe HTML kommt danach.
    host.appendChild(doc.createElement("p")).textContent = "Strom läuft";
    const inner = host.appendChild(doc.createElement("div"));
    inner.innerHTML = c.html;
    await sleep(waitMs);
    const danger = read(() => c.dangerous(inner));
    if (danger.error !== undefined) return { ...base, state: "leak", detail: `das Lesen von „${c.danger}“ wirft unter dem Wächter: ${danger.error}` };
    if (danger.value) return { ...base, state: "leak", detail: `unter dem Wächter: ${c.danger}` };
    if (c.kept) {
      const k = read(() => c.kept?.(inner) ?? true);
      if (!k.value) return { ...base, state: "leak", detail: `unter dem Wächter fehlt, was bleiben muss: ${c.keeps ?? "kept"}${k.error ? ` (${k.error})` : ""}` };
    }
    return { ...base, state: "held", detail: c.control ? `Positivkontrolle: ${c.keeps ?? "bleibt"}` : "gehalten" };
  } finally {
    try { handle?.disconnect(); } catch { /* ein Wächter, der beim Abbau wirft, hält den Lauf nicht an */ }
    host.remove();
  }
}

/** Fährt die Fälle gegen den Wächter `attach` (siehe Kopf). Wirft nie; die Fälle laufen nacheinander, jeder in einem frischen Behälter. */
export async function probeDomGuard(attach: AttachGuard, opts: ProbeOptions = {}): Promise<ProbeResult[]> {
  const doc = opts.doc ?? document;
  const waitMs = opts.waitMs ?? 50;
  const frameWaitMs = opts.frameWaitMs ?? 400;
  const out: ProbeResult[] = [];
  for (const c of opts.cases ?? DOM_GUARD_PROBE_CASES) out.push(await probeOne(attach, c, doc, c.frameDelay ? frameWaitMs : waitMs));
  return out;
}
