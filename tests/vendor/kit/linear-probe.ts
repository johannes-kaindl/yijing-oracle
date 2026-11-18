// vendored from obsidian-kit@0.95.0, src/testing/linear-probe.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Linearitätsprobe für Tests (ReDoS-Konvention). Nur in Tests (vitest, Node): importiert `node:vm`.
//
// Warum es sie gibt: zweimal wurde eine Regex mit überlinearer Laufzeit veröffentlicht (Welle 15 und 16),
// Welle 17 fand fünf quadratische Think-Regexe. Eine statische Prüfung (`recheck`) fängt die exponentielle
// Form; die **quadratische** fängt nur eine Messung. Die Probe wächst die Eingabe auf n = 1 000, 10 000 und
// 50 000 und prüft, ob die Laufzeit mitwächst.
//
// Die Eingabe: **Präfix = die Eingangsform der Regex, die sie anlaufen lässt, ohne dass sie passt** (bei
// `<think>…</think>` das Präfix `"<think>"`, bei `^(a+)+$` das Präfix `"a"` mit Suffix `"!"`). Eine Eingabe,
// die die Funktion früh verlassen lässt, misst den teuren Teil nie — ein Zweig vor der verdächtigen Stelle
// gehört in die Eingabe (LESSONS 2026-10-11).
//
// Unter Last (Welle 28, gemessen auf 18 Kernen mit `yes`-Prozessen, Load 9 bis 156): Die Zeitgrenze trägt ein Verhältnis t(50 000)/t(10 000) von 12, ein lineares Stück liegt ruhig bei 4,5 bis 7,5, ein
// quadratisches bei etwa 25: der Abstand ist nach beiden Seiten nur etwa Faktor zwei. Gemessen vor der Änderung, je Test 10 Läufe: die Regex- und Format-Proben (daily-notes, plugin-id, anthropicBaseOf, die
// quadratische Funktion von `pruefeLinear`) kippten in 0 von 10 bei Load 11 bis 19 und 0 von 10 bei Load 32 bis 72; `pruefeLinearFuzz` an `llm-json` (lineare Funktion, 150 000 Zeichen) fiel dagegen bei Load
// um 33 in 2 von 10 Läufen mit Verhältnis 12,3 durch (und einmal im Gate bei Load 45). Ursache: `bestOf` wiederholt einen Lauf über 500 ms nicht, t(50 000) ist eine Einzelmessung und fängt den Lastschub allein
// ab. Seit 0.72.0 wird ein überlinearer Befund am großen Lauf einmal nachgemessen (nur unter 4 s, sonst verdoppelten sich die Gegenproben); danach 0 von 15 bei Load 17 und 0 von 15 bei Load 74 bis 156. Eine
// Voraussetzung bleibt: eine dauerhafte Last weit über der Kernzahl hebt t(50 000) in beiden Messungen. Test-Funktionen für eine QUADRATISCHE Einheit laufen auf der Wanduhr (`spin`), nicht mit CPU-Schritten:
// deren Zeit wächst mit der Last und verschiebt das Verhältnis.
import { createContext, runInContext } from "node:vm";

/** Eingabelängen der Probe. */
export const LINEAR_PROBE_SIZES = [1_000, 10_000, 50_000] as const;

export interface LinearProbeStep { n: number; ms: number }
export interface LinearProbeResult {
  /** `t(50 000)/t(10 000) < 12` oder `t(50 000) < 50 ms`; ein Abbruch durch die Frist ist nie linear. */
  linear: boolean;
  steps: LinearProbeStep[];
  /** `t(50 000)/t(10 000)`; `Infinity` bei Abbruch. */
  ratio: number;
  /** Bei Abbruch: die Länge, bei der die Frist riss. */
  abortedAt?: number;
  /** Lesbarer Befund für `expect(r.linear, r.message)`. */
  message: string;
}

const RATIO_LIMIT = 12;
const FAST_MS = 50;

function verdict(steps: LinearProbeStep[], abortedAt: number | undefined): LinearProbeResult {
  const table = steps.map((s) => `n=${s.n}: ${s.ms.toFixed(1)} ms`).join(", ");
  if (abortedAt !== undefined) {
    return { linear: false, steps, ratio: Infinity, abortedAt, message: `Frist bei n=${abortedAt} gerissen (${table})` };
  }
  const at = (n: number): number => steps.find((s) => s.n === n)?.ms ?? 0;
  const t10 = at(10_000);
  const t50 = at(50_000);
  const ratio = t10 > 0 ? t50 / t10 : t50 > 0 ? Infinity : 0;
  const linear = t50 < FAST_MS || ratio < RATIO_LIMIT;
  return { linear, steps, ratio, message: `${linear ? "linear" : "überlinear"}: ${table}, t(50 000)/t(10 000) = ${ratio.toFixed(1)}` };
}

/** Bester von bis zu drei Läufen (Rauschen drücken); ein Lauf über 500 ms wird nicht wiederholt. */
function bestOf(run: () => void): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    run();
    const ms = performance.now() - t0;
    best = Math.min(best, ms);
    if (ms > 500) break;
  }
  return best;
}

/** Ab dieser Laufzeit bei n = 50 000 wird ein überlinearer Befund nicht nachgemessen: eine echt quadratische Funktion braucht dort sechs bis vierzehn Sekunden, das Nachmessen verdoppelte die Gegenproben. */
const RETRY_MAX_MS = 4_000;

/** Das Urteil, mit einer Nachmessung des GROSSEN Laufs: `bestOf` wiederholt einen Lauf über 500 ms nicht, t(50 000) ist also eine Einzelmessung, t(10 000) dagegen der Beste von drei. Unter Last
 *  (gemessen Welle 28, Load über 30 auf 18 Kernen) verschiebt das das Verhältnis nach oben: eine lineare Funktion (`llm-json`, 150 000 Zeichen) fiel in 2 von 10 Läufen mit 12,3 über die Grenze 12 (ruhig 4,5 bis 7,5).
 *  Ist das Urteil überlinear und der große Lauf kürzer als {@link RETRY_MAX_MS}, wird er einmal wiederholt und der bessere zählt; eine echt quadratische Funktion bleibt beim zweiten Lauf überlinear. */
function verdictMitNachmessung(steps: LinearProbeStep[], nachmessen: () => number): LinearProbeResult {
  const v = verdict(steps, undefined);
  const t50 = steps.find((s) => s.n === 50_000)?.ms ?? 0;
  if (v.linear || t50 >= RETRY_MAX_MS) return v;
  const nochmal = nachmessen();
  if (nochmal >= t50) return v;
  return verdict(steps.map((s) => (s.n === 50_000 ? { n: s.n, ms: nochmal } : s)), undefined);
}

/** Misst `re.test(praefix.repeat(n) + suffix)` für n ∈ {1 000, 10 000, 50 000} in einem `node:vm`-Kontext mit
 *  Frist je Lauf (`timeoutMs`, Default 2 000): eine exponentielle Regex hängt sonst den Testlauf, und in einen
 *  Worker ließe sich die Regex nicht schicken (nicht klonbar). Ein Abbruch ist `linear: false`. */
export function pruefeLinearRegex(re: RegExp, praefix: string, suffix = "", opts?: { timeoutMs?: number }): LinearProbeResult {
  const timeout = opts?.timeoutMs ?? 2_000;
  const steps: LinearProbeStep[] = [];
  for (const n of LINEAR_PROBE_SIZES) {
    const ctx = createContext({ re, input: praefix.repeat(n) + suffix });
    try {
      const ms = bestOf(() => { runInContext("re.lastIndex = 0; re.test(input);", ctx, { timeout }); });
      steps.push({ n, ms });
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return verdict(steps, n);
      throw e;
    }
  }
  return verdict(steps, undefined);
}

/** Misst `fn(eingabe(n))` im Thread für n ∈ {1 000, 10 000, 50 000} — für die quadratische Form in beliebigem
 *  Code. `eingabe` ist ein Text, der n-mal wiederholt wird, oder eine Funktion `n → Argument`. **Ohne Frist:**
 *  eine exponentielle Regex gehört in `pruefeLinearRegex`, sonst hängt der Lauf. */
export function pruefeLinear<T>(fn: (eingabe: T) => unknown, eingabe: string | ((n: number) => T)): LinearProbeResult {
  const make = typeof eingabe === "string" ? (n: number): T => eingabe.repeat(n) as T : eingabe;
  const steps: LinearProbeStep[] = [];
  let groß: T | undefined;
  for (const n of LINEAR_PROBE_SIZES) {
    const arg = make(n);
    if (n === 50_000) groß = arg;
    steps.push({ n, ms: bestOf(() => { fn(arg); }) });
  }
  return verdictMitNachmessung(steps, () => bestOf(() => { fn(groß as T); }));
}

/** Ein Befund von {@link pruefeLinearFuzz}. */
export interface LinearFuzzSuspect {
  /** Die Einheit, die `n`-mal wiederholt wurde — bei `"verschachtelt"` die Anzeigeform `öffner…mitte…schließer`. */
  einheit: string;
  form: "wiederholt" | "verschachtelt";
  /** Lesbarer Befund mit den Messwerten, für `expect(…, message)`. */
  message: string;
}

export interface LinearFuzzOptions {
  /** Die Zeichen, aus denen die Einheiten gebaut werden: ein Text (zerlegt nach Codepunkten) oder eine Liste (ein Eintrag darf mehrere
   *  Zeichen haben, etwa `"<think>"`). */
  alphabet: string | readonly string[];
  /** Längste Einheit in Alphabet-Einträgen. Default 3. Die Zahl der Einheiten wächst mit `alphabet.length ** maxLaenge`. */
  maxLaenge?: number;
  /** Zusätzlich je Paar (öffner, schließer) die Form `öffner.repeat(n) + mitte + schließer.repeat(n)` — die verschachtelte Familie, die
   *  eine wiederholte Einheit nie erzeugt. Default `true`. */
  verschachtelt?: boolean;
  /** Einen Verdacht vor der Meldung einmal frisch nachmessen (Leiter von vorn) und nur melden, wenn er bleibt. Default `true`. */
  nachmessen?: boolean;
  /** Das Zeichen zwischen Öffner und Schließer. Default `"x"`. */
  mitte?: string;
}

export interface LinearFuzzResult {
  /** `true`, wenn kein Verdacht übrig blieb. */
  linear: boolean;
  verdaechtig: LinearFuzzSuspect[];
  /** Wie viele Eingaben gemessen wurden (Einheiten plus Paare). */
  gemessen: number;
}

/** Ab dieser Zeit bei n = 10 000 UND dem Faktor gegen n = 1 000 gilt eine Einheit schon als überlinear — 50 000 wird dann nie gefahren. */
const FUZZ_EARLY_MS = 150;
const FUZZ_EARLY_FACTOR = 30;

/** Die Leiter für EINE Eingabeform: 1 000 und 10 000 zuerst; reißt t(10 000) die Grenze von {@link FUZZ_EARLY_MS} und ist der Faktor gegen
 *  t(1 000) größer als {@link FUZZ_EARLY_FACTOR}, ist es überlinear und 50 000 entfällt (eine quadratische Funktion hängt dort 6–14 s).
 *  Sonst das Urteil von {@link pruefeLinear}. Ein Wurf der Funktion beendet den gemessenen Lauf und zählt als dessen Zeit. */
function leiter(fn: (eingabe: string) => unknown, make: (n: number) => string, label: string): { linear: boolean; message: string } {
  const lauf = (n: number): LinearProbeStep => {
    const arg = make(n);
    return { n, ms: bestOf(() => { try { fn(arg); } catch { /* gemessen wird die Zeit, nicht die Gültigkeit der Eingabe */ } }) };
  };
  const s1 = lauf(1_000);
  const s10 = lauf(10_000);
  if (s10.ms > FUZZ_EARLY_MS && s10.ms / Math.max(s1.ms, 0.05) > FUZZ_EARLY_FACTOR) {
    return {
      linear: false,
      message: `${label}: überlinear — n=1000: ${s1.ms.toFixed(1)} ms, n=10000: ${s10.ms.toFixed(1)} ms (Faktor ${(s10.ms / Math.max(s1.ms, 0.05)).toFixed(0)}), 50 000 nicht gefahren`,
    };
  }
  const v = verdictMitNachmessung([s1, s10, lauf(50_000)], () => lauf(50_000).ms);
  return { linear: v.linear, message: `${label}: ${v.message}` };
}

/** Erschöpfender Fuzz für die Linearität (CORE-TEST-26 (b)): misst `fn` für JEDE Einheit aus `alphabet` bis `maxLaenge` Zeichen,
 *  `n`-mal wiederholt, und — mit `verschachtelt` — für jedes Paar `öffner.repeat(n) + mitte + schließer.repeat(n)`. Handgewählte Eingaben
 *  erreichen nur die Stellen, die ihr Autor schon verdächtigt; dieser Lauf findet den Rest (am JSON-Leser aus 3d-codeblocks fand er zwei
 *  quadratische Familien, die kein handgeschriebener Test hatte).
 *
 *  Je Eingabe die Leiter von {@link pruefeLinear}, aber mit Abkürzung: 1 000 und 10 000 zuerst, **50 000 nur ohne Verdacht**. Ein Verdacht
 *  wird vor der Meldung **einmal frisch nachgemessen** (`nachmessen`): Rauschen bei großen Eingaben meldete der erste Prototyp als Befund
 *  (`{]x` am JSON-Leser — alt und neu linear, Quotient 4,9 und 5,8).
 *
 *  Ein Wurf von `fn` bricht den Fuzz nicht ab: gemessen wird die Laufzeit, nicht die Gültigkeit der Eingabe.
 *
 *  ⚠️ **Testlaufzeit.** Rund 110 ms je Eingabe (Zeichenketten bis 150 kB aufbauen, Bester von drei). Ein Alphabet von 8 Zeichen mit
 *  `maxLaenge` 3 sind 584 Einheiten plus 64 Paare und kostet je Funktion 72–90 s; 6 Zeichen etwa 30 s. Das sprengt vitests 5-s-Standard:
 *  `it(…, 180_000)` setzen und im Kit-Test ein kleines Alphabet wählen. Ein Lauf unter hoher Last wird langsamer, nicht falsch.
 *
 *  @example
 *  const r = pruefeLinearFuzz((s) => extractJson(s), { alphabet: ["[", "]", '"', "\\", "x"] }); // it(…, 180_000)
 *  expect(r.verdaechtig, JSON.stringify(r.verdaechtig)).toEqual([]);
 */
export function pruefeLinearFuzz(fn: (eingabe: string) => unknown, opts: LinearFuzzOptions): LinearFuzzResult {
  const alphabet = typeof opts.alphabet === "string" ? Array.from(opts.alphabet) : [...opts.alphabet];
  if (alphabet.length === 0) throw new Error("pruefeLinearFuzz: alphabet ist leer");
  const maxLaenge = opts.maxLaenge ?? 3;
  if (!Number.isInteger(maxLaenge) || maxLaenge < 1) throw new Error(`pruefeLinearFuzz: maxLaenge muss eine ganze Zahl ≥ 1 sein, ist ${String(maxLaenge)}`);
  const verschachtelt = opts.verschachtelt ?? true;
  const nachmessen = opts.nachmessen ?? true;
  const mitte = opts.mitte ?? "x";

  const verdaechtig: LinearFuzzSuspect[] = [];
  let gemessen = 0;
  const pruefe = (einheit: string, form: LinearFuzzSuspect["form"], make: (n: number) => string): void => {
    gemessen += 1;
    let r = leiter(fn, make, einheit);
    if (!r.linear && nachmessen) r = leiter(fn, make, einheit);
    if (!r.linear) verdaechtig.push({ einheit, form, message: r.message });
  };

  // Einheiten nach Länge: erst alle einzelnen Zeichen, dann alle Paare, … — ein Befund kurzer Einheiten steht vorn.
  let stufe: string[] = [""];
  for (let laenge = 1; laenge <= maxLaenge; laenge++) {
    const naechste: string[] = [];
    for (const vorn of stufe) for (const z of alphabet) naechste.push(vorn + z);
    for (const einheit of naechste) pruefe(einheit, "wiederholt", (n) => einheit.repeat(n));
    stufe = naechste;
  }
  if (verschachtelt) {
    for (const o of alphabet) for (const c of alphabet) pruefe(`${o}…${mitte}…${c}`, "verschachtelt", (n) => o.repeat(n) + mitte + c.repeat(n));
  }
  return { linear: verdaechtig.length === 0, verdaechtig, gemessen };
}
