# Note-Struktur, Zhu-Xi-Ruling-Hinweis & Panel-Kasten-Höhe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Note bekommt einen roten Faden (Frage → Überblick → Deutung → Ursprungsbild mit wandelnden Linien → Zielbild → Anmerkungen), den klassischen „maßgeblich"-Hinweis (Note + Panel + LLM-Prompt) und gedeckelte, intern scrollende Panel-Kästen.

**Architecture:** Neue pure `core/ruling.ts` (Port von `web/ruling.js` + DE/EN-Texte) speist Note (`render.ts`), Panel (`view.ts`) und — automatisch über `rendered.body` — den LLM-Prompt. `render.ts` wird umstrukturiert. Zwei neue Callout-Sektionen (`overview`, `question`). CSS deckelt die Deutungs-/Reasoning-Kästen.

**Tech Stack:** TypeScript, esbuild, Obsidian Plugin API, vitest.

## Global Constraints

- `src/core/**` importiert **nie** `obsidian` (`check:pure`-gated). `ruling.ts` gehört dazu.
- Nur Obsidian-Theme-CSS-Variablen, keine Hardcoded-Farbwerte (UI-STANDARD).
- Ruling-Texte + Sektions-Labels hängen an der **Reading-Sprache**, nicht an der UI-Sprache (wie `render.ts`-`LABELS`).
- Gate muss grün bleiben: `npm run gate` (= lint + typecheck + typecheck:test + test + check:pure + check:bundle).
- `ruling.ts` ist ein Port: Regel-Ergebnisse müssen mit `/Users/Shared/code/yijing/web/ruling.js` übereinstimmen (Parity-Referenz).
- Commit-Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: `core/ruling.ts` — Zhu-Xi-Regel-Port + Texte

**Files:**
- Create: `src/core/ruling.ts`
- Test: `tests/ruling.test.ts`

**Interfaces:**
- Consumes: `Lang` aus `src/core/data.ts`, `Reading` aus `src/core/reading.ts`.
- Produces:
  - `type RulingRule = "judgment-primary" | "line-primary" | "lines-primary" | "judgments-both" | "lines-resulting" | "line-resulting" | "judgment-resulting" | "special-qian-kun"`
  - `interface RulingResult { rule: RulingRule; lineIndices: number[]; decisiveIndex: number | null; source: "primary" | "resulting" | "both" }`
  - `function rulingText(input: { primaryNumber: number; changingIndices: number[] }): RulingResult` — 0-basierte Indizes, Index 0 = unterste Linie.
  - `function rulingSentence(reading: Reading, lang: Lang): { label: string; text: string; result: RulingResult }` — konvertiert `reading.changingPositions` (1-basiert) → 0-basiert, liefert fertige Texte.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ruling.test.ts
import { describe, it, expect } from "vitest";
import { rulingText, rulingSentence } from "../src/core/ruling";
import { buildReading } from "../src/core/reading";
import { type Line } from "../src/core/casting";

const L = (...values: number[]): Line[] => values.map((value) => ({ value }));

describe("rulingText", () => {
  it("0 wandelnde Linien → Ursprungs-Urteil", () => {
    expect(rulingText({ primaryNumber: 63, changingIndices: [] }))
      .toEqual({ rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" });
  });
  it("1 wandelnde Linie → deren Text, sie entscheidet", () => {
    expect(rulingText({ primaryNumber: 10, changingIndices: [2] }))
      .toEqual({ rule: "line-primary", lineIndices: [2], decisiveIndex: 2, source: "primary" });
  });
  it("2 wandelnde Linien → beide, obere (höherer Index) entscheidet", () => {
    expect(rulingText({ primaryNumber: 10, changingIndices: [1, 4] }))
      .toEqual({ rule: "lines-primary", lineIndices: [1, 4], decisiveIndex: 4, source: "primary" });
  });
  it("3 wandelnde Linien → beide Urteile, Ursprung führt", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 2, 4] });
    expect(r.rule).toBe("judgments-both");
    expect(r.source).toBe("both");
    expect(r.decisiveIndex).toBeNull();
  });
  it("4 wandelnde Linien → ruhende Zielbild-Linien, untere entscheidet", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 1, 2, 3] });
    expect(r).toEqual({ rule: "lines-resulting", lineIndices: [4, 5], decisiveIndex: 4, source: "resulting" });
  });
  it("5 wandelnde Linien → eine ruhende Zielbild-Linie", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 1, 2, 3, 4] });
    expect(r).toEqual({ rule: "line-resulting", lineIndices: [5], decisiveIndex: 5, source: "resulting" });
  });
  it("6 wandelnde Linien, normal → Zielbild-Urteil", () => {
    const r = rulingText({ primaryNumber: 10, changingIndices: [0, 1, 2, 3, 4, 5] });
    expect(r).toEqual({ rule: "judgment-resulting", lineIndices: [], decisiveIndex: null, source: "resulting" });
  });
  it("6 wandelnde Linien bei Qian (1) → Sonderspruch, Yong-Index 6", () => {
    const r = rulingText({ primaryNumber: 1, changingIndices: [0, 1, 2, 3, 4, 5] });
    expect(r).toEqual({ rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" });
  });
  it("6 wandelnde Linien bei Kun (2) → Sonderspruch", () => {
    expect(rulingText({ primaryNumber: 2, changingIndices: [0, 1, 2, 3, 4, 5] }).rule).toBe("special-qian-kun");
  });
});

describe("rulingSentence", () => {
  it("liefert Label + Satz in der Reading-Sprache (DE)", () => {
    const r = buildReading(L(6, 7, 7, 7, 7, 7)); // 1 wandelnde Linie (Position 1)
    const s = rulingSentence(r, "de");
    expect(s.label).toBe("Maßgeblich nach Tradition");
    expect(s.text).toBe("Eine wandelnde Linie — ihr Text ist maßgeblich.");
    expect(s.result.decisiveIndex).toBe(0);
  });
  it("liefert englischen Satz", () => {
    const r = buildReading(L(6, 7, 7, 7, 7, 7));
    expect(rulingSentence(r, "en").text).toBe("One moving line — its text is decisive.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ruling.test.ts`
Expected: FAIL — `Cannot find module '../src/core/ruling'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/ruling.ts
// Zhu-Xi-Linienregeln (Wilhelm/Baynes „Über die Befragung des Orakels").
// Port von /Users/Shared/code/yijing/web/ruling.js — pure, KEIN obsidian-Import.
// changingIndices: 0-basiert, Index 0 = unterste Linie. primaryNumber = King-Wen-Nr.
import { type Lang } from "./data";
import { type Reading } from "./reading";

export type RulingRule =
  | "judgment-primary" | "line-primary" | "lines-primary" | "judgments-both"
  | "lines-resulting" | "line-resulting" | "judgment-resulting" | "special-qian-kun";

export interface RulingResult {
  rule: RulingRule;
  lineIndices: number[];
  decisiveIndex: number | null;
  source: "primary" | "resulting" | "both";
}

export function rulingText({ primaryNumber, changingIndices }: { primaryNumber: number; changingIndices: number[] }): RulingResult {
  const idx = [...(changingIndices || [])].sort((a, b) => a - b);
  const n = idx.length;
  const nonChanging = [0, 1, 2, 3, 4, 5].filter((i) => !idx.includes(i));
  switch (n) {
    case 0: return { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" };
    case 1: return { rule: "line-primary", lineIndices: [idx[0]], decisiveIndex: idx[0], source: "primary" };
    case 2: return { rule: "lines-primary", lineIndices: idx, decisiveIndex: idx[1], source: "primary" };
    case 3: return { rule: "judgments-both", lineIndices: [], decisiveIndex: null, source: "both" };
    case 4: return { rule: "lines-resulting", lineIndices: nonChanging, decisiveIndex: nonChanging[0], source: "resulting" };
    case 5: return { rule: "line-resulting", lineIndices: nonChanging, decisiveIndex: nonChanging[0], source: "resulting" };
    case 6:
      if (primaryNumber === 1 || primaryNumber === 2)
        return { rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" };
      return { rule: "judgment-resulting", lineIndices: [], decisiveIndex: null, source: "resulting" };
    default: return { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" };
  }
}

interface RulingStrings { label: string; rules: Record<RulingRule, string>; }

const RULING_TEXT: Record<Lang, RulingStrings> = {
  de: {
    label: "Maßgeblich nach Tradition",
    rules: {
      "judgment-primary": "Keine wandelnde Linie — das Urteil des Hexagramms ist maßgeblich.",
      "line-primary": "Eine wandelnde Linie — ihr Text ist maßgeblich.",
      "lines-primary": "Zwei wandelnde Linien — beide gelten, die obere entscheidet.",
      "judgments-both": "Drei wandelnde Linien — die Urteile von Ursprungs- und Zielbild gelten, das Ursprungsurteil führt.",
      "lines-resulting": "Vier wandelnde Linien — die beiden ruhenden Linien des Zielbilds gelten, die untere entscheidet.",
      "line-resulting": "Fünf wandelnde Linien — die eine ruhende Linie des Zielbilds ist maßgeblich.",
      "judgment-resulting": "Sechs wandelnde Linien — das Urteil des Zielbilds ist maßgeblich.",
      "special-qian-kun": "Sechs wandelnde Linien — es gilt der Sonderspruch zur Anwendung der Neun bzw. der Sechs.",
    },
  },
  en: {
    label: "Decisive by tradition",
    rules: {
      "judgment-primary": "No moving line — the hexagram's judgment is decisive.",
      "line-primary": "One moving line — its text is decisive.",
      "lines-primary": "Two moving lines — both apply; the upper one decides.",
      "judgments-both": "Three moving lines — the judgments of the primary and resulting hexagrams apply; the primary leads.",
      "lines-resulting": "Four moving lines — the two resting lines of the resulting hexagram apply; the lower decides.",
      "line-resulting": "Five moving lines — the single resting line of the resulting hexagram is decisive.",
      "judgment-resulting": "Six moving lines — the judgment of the resulting hexagram is decisive.",
      "special-qian-kun": "Six moving lines — the special text “use of the nine/six” applies.",
    },
  },
};

export function rulingSentence(reading: Reading, lang: Lang): { label: string; text: string; result: RulingResult } {
  const result = rulingText({
    primaryNumber: reading.primaryNumber,
    changingIndices: reading.changingPositions.map((p) => p - 1),
  });
  const s = RULING_TEXT[lang];
  return { label: s.label, text: s.rules[result.rule], result };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ruling.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify purity**

Run: `npm run check:pure`
Expected: PASS (no `obsidian` import in `core/`).

- [ ] **Step 6: Commit**

```bash
git add src/core/ruling.ts tests/ruling.test.ts
git commit -m "feat(ruling): Zhu-Xi-Regel-Port als pure core/ruling.ts (DE/EN)"
```

---

## Task 2: Panel-Kästen deckeln (CSS)

**Files:**
- Modify: `styles.css` (nach `.yijing-interpretation-body`, `.yijing-reasoning-body`)

**Interfaces:** keine (CSS-only).

- [ ] **Step 1: Deckel setzen**

In `styles.css` die bestehenden Regeln ergänzen:

```css
.yijing-interpretation-body {
  margin: var(--size-2-3) 0;
  max-height: 44vh;
  overflow-y: auto;
}
```

und bei `.yijing-reasoning-body` ergänzen:

```css
.yijing-reasoning-body {
  white-space: pre-wrap;
  margin-top: var(--size-2-2);
  padding-left: var(--size-4-2);
  border-left: 2px solid var(--background-modifier-border);
  max-height: 30vh;
  overflow-y: auto;
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run check:bundle`
Expected: PASS (styles.css wird mitgebündelt, kein Fehler).

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "fix(ui): Deutungs-/Reasoning-Kasten deckeln (max-height + intern scrollen)"
```

---

## Task 3: Callout-Sektionen `overview` + `question`

**Files:**
- Modify: `src/core/note-callouts.ts`
- Modify: `src/i18n/strings.ts` (DE- und EN-Block: `set.callout.overview`, `set.callout.question`)
- Test: `tests/callout.test.ts` (bestehend erweitern, falls es `CALLOUT_SECTIONS`/`mergeCallouts` prüft)

**Interfaces:**
- Produces: `CalloutSection` erweitert um `"overview" | "question"`; `DEFAULT_CALLOUTS.overview = { enabled: true, type: "note" }`, `DEFAULT_CALLOUTS.question = { enabled: true, type: "question" }`.

- [ ] **Step 1: Write the failing test**

In `tests/callout.test.ts` ergänzen (oder neu, falls nicht vorhanden):

```typescript
import { CALLOUT_SECTIONS, DEFAULT_CALLOUTS, mergeCallouts } from "../src/core/note-callouts";

it("kennt overview + question mit sinnvollen Defaults", () => {
  expect(CALLOUT_SECTIONS).toContain("overview");
  expect(CALLOUT_SECTIONS).toContain("question");
  expect(DEFAULT_CALLOUTS.overview).toEqual({ enabled: true, type: "note" });
  expect(DEFAULT_CALLOUTS.question).toEqual({ enabled: true, type: "question" });
});

it("mergeCallouts füllt neue Sektionen aus Defaults auf", () => {
  const merged = mergeCallouts({ judgment: { enabled: false } });
  expect(merged.overview).toEqual({ enabled: true, type: "note" });
  expect(merged.question).toEqual({ enabled: true, type: "question" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/callout.test.ts`
Expected: FAIL — `overview`/`question` fehlen.

- [ ] **Step 3: Implement**

In `src/core/note-callouts.ts`:

```typescript
export type CalloutSection = "overview" | "question" | "hexInfo" | "judgment" | "image" | "meaning" | "lines" | "notes";

export const CALLOUT_SECTIONS: CalloutSection[] = ["overview", "question", "hexInfo", "judgment", "image", "meaning", "lines", "notes"];

export const DEFAULT_CALLOUTS: CalloutConfig = {
  overview: { enabled: true, type: "note" },
  question: { enabled: true, type: "question" },
  hexInfo: { enabled: true, type: "quote" },
  judgment: { enabled: true, type: "quote" },
  image: { enabled: true, type: "quote" },
  meaning: { enabled: true, type: "quote" },
  lines: { enabled: true, type: "quote" },
  notes: { enabled: true, type: "quote" },
};
```

In `src/i18n/strings.ts` im **EN-Block** bei den `set.callout.*` ergänzen:

```typescript
      "set.callout.overview": "Overview (hexagram pair + decisive rule)",
      "set.callout.question": "Question",
```

und im **DE-Block**:

```typescript
      "set.callout.overview": "Überblick (Hexagramm-Paar + maßgebliche Regel)",
      "set.callout.question": "Frage",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/callout.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (Config-Vollständigkeit)**

Run: `npm run typecheck`
Expected: PASS — `CalloutConfig` (= `Record<CalloutSection, …>`) ist vollständig; `settings.ts` iteriert `CALLOUT_SECTIONS` automatisch.

- [ ] **Step 6: Commit**

```bash
git add src/core/note-callouts.ts src/i18n/strings.ts tests/callout.test.ts
git commit -m "feat(callouts): Sektionen overview + question (Defaults note/question)"
```

---

## Task 4: `render.ts` — neue Struktur + Ruling-Hinweis + decisive-Marker

**Files:**
- Modify: `src/core/render.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: `rulingSentence` aus Task 1; `DEFAULT_CALLOUTS.overview/question` aus Task 3.
- Produces: unveränderte `RenderedReading`-Signatur; neue Body-Reihenfolge.

Ziel-Reihenfolge im `body`:
`# Titel` · Untertitel · Frage-Callout · `## Überblick`-Callout · Deutungs-Anker · `## Ursprungsbild — …` (Trigramme, Urteil, Bild, Bedeutung, `### Wandelnde Linien` mit `####`-Linien inkl. `· maßgeblich`) · `## Zielbild — …` · `## Anmerkungen` · `--- Attribution`.

- [ ] **Step 1: Write the failing tests**

In `tests/render.test.ts` ergänzen:

```typescript
import { rulingSentence } from "../src/core/ruling";

it("neue Struktur: Frage-Callout → Überblick → Anker → Ursprungsbild", () => {
  const r = buildReading(L(6, 8, 7, 8, 7, 8)); // 1 wandelnde Linie (Position 1)
  const out = renderReading(r, opts({ question: "Soll ich starten?" }));
  const body = out.body;
  // Reihenfolge über indexOf
  const iQ = body.indexOf("[!question]");
  const iOv = body.indexOf("## Überblick");
  const iAnchor = body.indexOf(MARKER_START);
  const iOrigin = body.indexOf("## Ursprungsbild");
  expect(iQ).toBeGreaterThan(-1);
  expect(iOv).toBeGreaterThan(iQ);
  expect(iAnchor).toBeGreaterThan(iOv);
  expect(iOrigin).toBeGreaterThan(iAnchor);
});

it("Überblick enthält den maßgeblich-Satz", () => {
  const r = buildReading(L(6, 8, 7, 8, 7, 8));
  const out = renderReading(r, opts());
  expect(out.body).toContain("Maßgeblich nach Tradition");
  expect(out.body).toContain(rulingSentence(r, "de").text);
});

it("wandelnde Linien sind Unterabschnitt (####) des Ursprungsbilds, nicht Top-Level", () => {
  const r = buildReading(L(6, 6, 7, 8, 7, 8)); // 2 wandelnde Linien (Pos 1,2)
  const out = renderReading(r, opts({ callouts: allOff }));
  expect(out.body).toContain("### Wandelnde Linien");
  expect(out.body).not.toMatch(/^## Wandelnde Linien/m);
  // die maßgebliche (obere = Pos 2) Linie ist markiert
  expect(out.body).toContain("· maßgeblich");
});

it("stabiler Wurf: kein Überblick-Pfeil, Ruling = Urteil maßgeblich", () => {
  const r = buildReading(L(7, 8, 7, 8, 7, 8)); // stabil
  const out = renderReading(r, opts());
  expect(out.body).toContain("Keine wandelnde Linie");
  expect(out.body).not.toContain("→");
});
```

Bestehende Struktur-Assertions anpassen: `expect(out.body).toContain("## Wandelnde Linien")` → `"### Wandelnde Linien"`; falls ein Test die alte Reihenfolge (Anker ganz oben) prüft, auf neue Position aktualisieren.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL (neue Reihenfolge/Strings fehlen).

- [ ] **Step 3: Implement `render.ts`**

Änderungen in `src/core/render.ts`:

(a) Import ergänzen:
```typescript
import { rulingSentence } from "./ruling";
```

(b) In `Labels` ein Feld `overview` + `decisive` ergänzen und in `LABELS.de`/`LABELS.en` füllen:
```typescript
// interface Labels: zusätzlich
  overview: string;
  decisive: string;
// de:
  overview: "Überblick",
  decisive: "maßgeblich",
// en:
  overview: "Overview",
  decisive: "decisive",
```

(c) `hexInfoBlock` entschlacken — nur noch Trigramm-Bullets (der Name steht in der H2):
```typescript
function hexInfoBlock(h: HexagramData, L: Labels, lang: Lang, cfg: CalloutOption): string {
  const bullets = [trigramLine(L.upperTrigram, h.trigrams.above, lang), trigramLine(L.lowerTrigram, h.trigrams.below, lang)].join("\n");
  return cfg.enabled ? wrapCallout(L.upperTrigram, bullets, cfg.type, false) : bullets;
}
```
Hinweis: den fetten Header entfernen; `hexHeading(h)` (neu) baut den H2-Text.

(d) Neuer Helper für den H2-Hexagramm-Titel:
```typescript
function hexHeading(h: HexagramData, L: Labels): string {
  return `${h.unicode} ${L.no} ${h.number} — ${h.nameChinese} ${h.pinyin} · ${h.nameLatin} — ${h.nameLocal}`;
}
```

(e) `lineSection` bekommt einen optionalen `decisive`-Marker und tiefere Ebene (`####`):
```typescript
function lineSection(line: HexLine, cfg: CalloutOption, decisive: boolean, L: Labels): string {
  const title = decisive ? `${line.position} · ${L.decisive}` : line.position;
  const body = [line.text.trim(), line.interpretation?.trim()].filter(Boolean).join("\n\n");
  return cfg.enabled ? wrapCallout(title, body, cfg.type, false) : `#### ${title}\n\n${body}`;
}
```

(f) Neuer Helper für den Überblick-Block:
```typescript
function overviewBlock(reading: Reading, primary: HexagramData, resulting: HexagramData | null, L: Labels, ruling: { label: string; text: string }, cfg: CalloutOption): string {
  const pair = resulting
    ? `${primary.unicode} ${L.no} ${primary.number} ${primary.nameLocal}  →  ${resulting.unicode} ${L.no} ${resulting.number} ${resulting.nameLocal}`
    : `${primary.unicode} ${L.no} ${primary.number} ${primary.nameLocal}`;
  const lines = [pair];
  if (reading.changingPositions.length > 0) lines.push(`**${L.changes}:** ${reading.changingPositions.join(", ")}`);
  lines.push(`**${ruling.label}:** ${ruling.text}`);
  const body = lines.join("\n");
  return cfg.enabled ? wrapCallout(pair, lines.slice(1).join("\n"), cfg.type, false) : `### ${L.overview}\n\n${body}`;
}
```
(Bei Callout: der Hexagramm-Paar-Text wird zum Callout-Titel, die restlichen Zeilen zum Body — hält den Callout kompakt.)

(g) `renderReading` neu zusammensetzen. Kern-Reihenfolge:
```typescript
  const L = LABELS[opts.lang];
  const primary = getHexagram(reading.primaryNumber, opts.lang, opts.register);
  const resulting = reading.resultingNumber !== null ? getHexagram(reading.resultingNumber, opts.lang, opts.register) : null;
  const cal = opts.callouts ?? DEFAULT_CALLOUTS;
  const ruling = rulingSentence(reading, opts.lang);
  const question = opts.question?.trim() ?? "";

  const titleLine = `# ${title}`;
  const subtitleLine = `> ${[primary.nameLatin, primary.nameChinese, primary.pinyin].filter(Boolean).join(" · ")}`;

  const head: string[] = [titleLine, subtitleLine];
  if (question) {
    head.push(cal.question.enabled ? wrapCallout(L.question, question, cal.question.type, true) : `**${L.question}:** ${question}`);
  }
  head.push(overviewBlock(reading, primary, resulting, L, ruling, cal.overview));

  const content: string[] = [];
  // Ursprungsbild
  content.push(`## ${L.origin} — ${hexHeading(primary, L)}`);
  content.push(hexInfoBlock(primary, L, opts.lang, cal.hexInfo));
  content.push(section(L.judgment, primary.judgment.trim(), cal.judgment));
  content.push(section(L.image, primary.image.trim(), cal.image));
  if (primary.meaning.trim()) content.push(section(L.meaning, primary.meaning.trim(), cal.meaning));

  // Wandelnde Linien als Unterabschnitt
  if (reading.changingPositions.length > 0) {
    content.push(`### ${L.changes}`);
    const dec = ruling.result.source === "primary" ? ruling.result.decisiveIndex : null;
    if (reading.allChanging && primary.lines.length > 6) {
      content.push(lineSection(primary.lines[6], cal.lines, dec === 6, L));
    } else {
      for (const pos of reading.changingPositions) {
        content.push(lineSection(primary.lines[pos - 1], cal.lines, dec === pos - 1, L));
      }
    }
    // Zielbild
    if (resulting) {
      content.push(`## ${L.target} — ${hexHeading(resulting, L)}`);
      content.push(hexInfoBlock(resulting, L, opts.lang, cal.hexInfo));
      content.push(section(L.judgment, resulting.judgment.trim(), cal.judgment));
      content.push(section(L.image, resulting.image.trim(), cal.image));
    }
  }

  // Anmerkungen
  if (opts.includeNotes && primary.notes.length > 0) {
    content.push(`## ${L.notesHead}`);
    for (const n of primary.notes) content.push(section(anchorLabel(n.anchor, L), n.text.trim(), cal.notes));
  }
  content.push("---", L.attribution);

  const anchor = `${MARKER_START}\n${MARKER_END}`;
  return {
    title,
    frontmatter,
    body: [...head, anchor, ...content].join("\n\n") + "\n",
    previewBody: [...head.slice(1), ...content].join("\n\n") + "\n", // ohne H1-Titel
  };
```
Anmerkungen:
- `section()`, `trigramLine()`, `anchorLabel()`, `heading()`, `buildFrontmatter`-Block bleiben unverändert (Frontmatter-Block wie gehabt oben berechnen).
- `previewBody` beginnt ab dem Untertitel (`head.slice(1)`) — die Panel-Kopfzeile trägt Figur+Titel bereits; enthält jetzt Frage + Überblick + Inhalt, aber **keinen** Deutungs-Anker (der ist nur im Note-`body`).
- Der alte `metaLine`-Mechanismus entfällt vollständig (Frage → eigener Callout, wandelnde Linien → Überblick).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS. Falls alte Assertions brechen, an neue Struktur anpassen (nicht die neue Struktur an alte Tests).

- [ ] **Step 5: Full test + pure gate**

Run: `npm run test && npm run check:pure`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/render.ts tests/render.test.ts
git commit -m "feat(note): roter-Faden-Struktur + Ruling-Überblick + decisive-Marker"
```

---

## Task 5: Ruling-Hinweis im Panel

**Files:**
- Modify: `src/obsidian/view.ts` (nach dem Untertitel-`sub`-Div, ~Zeile 217)
- Modify: `styles.css` (`.yijing-ruling`)

**Interfaces:**
- Consumes: `rulingSentence` aus Task 1.

- [ ] **Step 1: Import + Panel-Zeile**

In `src/obsidian/view.ts` Import ergänzen:
```typescript
import { rulingSentence } from "../core/ruling";
```
Direkt nach dem Untertitel-Div (nach `if (sub) head.createDiv({ text: sub, cls: "yijing-name" });`, ~Zeile 217) einfügen:
```typescript
    const ruling = rulingSentence(c.reading, lang);
    head.createDiv({ text: `${ruling.label}: ${ruling.text}`, cls: "yijing-ruling" });
```

- [ ] **Step 2: CSS**

In `styles.css` ergänzen:
```css
.yijing-ruling {
  color: var(--text-muted);
  font-size: var(--font-ui-small);
  margin-top: var(--size-2-2);
}
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run typecheck && npm run check:bundle`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/obsidian/view.ts styles.css
git commit -m "feat(panel): maßgeblich-Hinweis unter der Hexagramm-Figur"
```

---

## Task 6: Gate + Deploy + Smoke

**Files:** keine.

- [ ] **Step 1: Volles Gate**

Run: `npm run gate`
Expected: PASS (lint, typecheck, typecheck:test, test, check:pure, check:bundle).

- [ ] **Step 2: Deploy in den Smoke-Vault**

Run: `npm run deploy`
Expected: Build + Copy in `yijing-oracle-smoke/.obsidian/plugins/yijing-oracle/` ohne Fehler.

- [ ] **Step 3: Manueller Smoke (Johannes / lokaler LLM)**

Würfe mit 0, 1, 2, 4 und 6 wandelnden Linien prüfen:
- Note-Struktur folgt dem roten Faden (Frage → Überblick → Deutung → Ursprungsbild mit `####`-Linien → Zielbild → Anmerkungen).
- „Maßgeblich nach Tradition"-Satz stimmt je Fall; bei 1/2 Linien ist die richtige Linie mit `· maßgeblich` markiert.
- Panel zeigt die Ruling-Zeile unter der Figur.
- Lange Deutung: Deutungs-Kasten scrollt intern, schiebt nichts aus dem Bild.

- [ ] **Step 4: Kein Commit nötig** (nur Verifikation). Bei Fund → zurück zur betroffenen Task.

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** Baustein 1 (ruling.ts) → Task 1; Baustein 2 (CSS-Höhe) → Task 2; Baustein 3 (render-Struktur) → Task 4; Baustein 4 (Panel-Ruling) → Task 5; Baustein 5 (LLM-Prompt) → automatisch (Ruling ist im `body`, Task 4 — kein eigener Task nötig); Callout-Optionen → Task 3.
- **Platzhalter:** keine — alle Code-Schritte mit vollständigem Code.
- **Typ-Konsistenz:** `rulingText`/`rulingSentence`/`RulingResult`/`RulingRule` durchgängig gleich benannt; `decisiveIndex` 0-basiert, Konvertierung `pos - 1`/`dec === pos - 1` konsistent; `CalloutSection` in Task 3 definiert, in Task 4 via `cal.overview`/`cal.question` genutzt.
- **LLM-Prompt:** kein Umbau — `buildInterpretationMessages` schickt `rendered.body`, der den Überblick-Callout inkl. Ruling enthält.
