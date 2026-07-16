# Settings-UI auf Dach-Standard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Settings-Tab bekommt einklappbare Sektionen und einen KI-Bereich mit den
Quality-of-Life-Bausteinen aus dem obsidian-kit (Zeilen-Editor mit Per-Zeile-Test, Presets,
Eingabe-Warnungen, Kontextlänge, Always-on-Thinker-Erkennung); die Bild-Sektion bekommt einen
Verbindungstest.

**Architecture:** Drei Schichten. Entscheidungslogik wandert in pure, `check:pure`-gepinnte Module
unter `src/core/settings/` (TDD, node-testbar ohne DOM). Kit-Module werden vendored — pure nach
`src/vendor/kit/`, obsidian-gekoppelte nach `src/vendor/kit-obsidian/`. Die Render-Schicht wird von
einer 447-Zeilen-Klasse zum Verzeichnis `src/obsidian/settings/` mit dünnen, `createEl`-only-Dateien.

**Tech Stack:** TypeScript · esbuild · Obsidian Plugin API · vitest · obsidian-kit (vendored)

**Spec:** `docs/superpowers/specs/2026-07-16-settings-ui-standard-design.md`

## Global Constraints

- **UI-STANDARD.md ist verbindlich** (Dach-Repo, `/Users/Shared/code/obsidian-plugins/UI-STANDARD.md`).
  Insbesondere: Sektionen via `setHeading()` (nie manuelles `<h2>`/`<h3>`), Sentence case für alle
  UI-Texte, DOM nur via `createEl`/`createDiv`/`createSpan` (nie `innerHTML`), nur
  Obsidian-Theme-Variablen (keine `#…`/`rgb()`), kein `!important`, Klassen-Präfix `yijing-`.
- **Icon-only-Buttons tragen immer ein Label** (`aria-label` / `setTooltip` / `title`).
- **Status-Indikator:** Form UND Farbe UND `is-ok`/`is-error`/`is-checking`-Klasse UND `aria-label`
  — Farbe nie allein (WCAG 1.4.1). Feste Icon-Vokabel: `loader` / `circle-check` / `circle-x` /
  `alert-triangle`.
- **Zweisprachig:** jeder neue UI-String bekommt einen Key in `src/i18n/strings.ts` — **beide**
  Dicts (`en` und `de`). EN ist kanonisch. Key-Präfix dieses Repos ist `set.…` (nicht
  `settings.…` wie in vault-crews).
- **`check:pure`:** `src/core` und `src/vendor/kit` dürfen **nie** `from 'obsidian'` enthalten.
- **Gate nach jedem Task grün:** `npm run gate` (lint · typecheck · typecheck:test · test ·
  check:pure · check:bundle).
- **Commit-Sprache:** deutsche Commit-Messages im Stil der Repo-Historie (`feat(settings): …`).
- **Kit-Header-Konvention:** jede vendored Datei startet mit
  `// vendored from obsidian-kit#<version>, <quellpfad>`.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/vendor/kit-obsidian/collapsible.ts` | **neu** — vendored Kit @0.13.0, obsidian-gekoppelt (`setIcon`) |
| `src/vendor/kit/model-context.ts` | **neu** — vendored Kit @0.7.0, pure |
| `src/core/settings/endpoint-editor-model.ts` | **neu** — pure Zeilen-Editor-Logik |
| `src/core/settings/migrate.ts` | **neu** — pure Migration Textarea-String → `string[]` |
| `src/core/settings.ts` | **neu** — `PluginSettings`/`DEFAULT_SETTINGS`/`resolveReadingLang` (Umzug) |
| `src/obsidian/settings/index.ts` | **neu** — `SettingsTab`, Sektionsgerüst, Re-Exporte |
| `src/obsidian/settings/endpoint-list.ts` | **neu** — Zeilen-Editor-Render |
| `src/obsidian/settings/llm-section.ts` | **neu** — KI-Deutung |
| `src/obsidian/settings/image-section.ts` | **neu** — Bildmeditation |
| `src/obsidian/settings/note-section.ts` | **neu** — Notiz & Ablage + Notiz-Inhalt |
| `src/obsidian/settings.ts` | **gelöscht** (Inhalt verteilt) |
| `src/core/llm/settings-defaults.ts` | geändert — `endpoints: string[]`, `activeEndpoint` entfällt |
| `src/obsidian/http.ts` | geändert — `probeImageEndpoint` ergänzt |
| `src/main.ts` | geändert — Migration, Import-Pfade |
| `src/i18n/strings.ts` | geändert — neue Keys (EN + DE) |
| `styles.css` | geändert — `COLLAPSIBLE_CSS` + Status-/Warn-Klassen |
| `package.json` | geändert — `check:pure`-Pfad |

---

### Task 1: Kit-Module vendoren + `check:pure`-Rand

Grund für die eigene Ablage: `collapsible.ts` importiert `setIcon` aus `obsidian`. `check:pure`
prüft heute `src/core src/vendor` **rekursiv** — die Datei unter `src/vendor/kit/` würde das Gate
brechen. Das Kit trennt intern `src/pure/` von `src/obsidian/`; die Vendor-Ablage spiegelt das.

**Files:**
- Create: `src/vendor/kit-obsidian/collapsible.ts`
- Create: `src/vendor/kit/model-context.ts`
- Modify: `package.json` (`check:pure`)
- Modify: `styles.css` (Ende anhängen)

**Interfaces:**
- Consumes: nichts
- Produces: `collapsibleSection(containerEl, opts) → HTMLElement` (gibt den Body-Container zurück),
  `resolveCollapsed(key, defaultCollapsed, storage) → boolean`,
  `interface CollapsibleStorage { getCollapsed(key: string): boolean | undefined; setCollapsed(key: string, collapsed: boolean): void }`,
  `interface CollapsibleOptions { title: string; defaultCollapsed?: boolean; key?: string; storage?: CollapsibleStorage }`,
  `COLLAPSIBLE_CSS: string`;
  `parseLmStudioContext(json: unknown, model: string) → ModelContext | null`,
  `parseOllamaContext(json: unknown) → ModelContext | null`,
  `interface ModelContext { maxContextLength?: number; loadedContextLength?: number }`

- [ ] **Step 1: Kit-Module kopieren**

```bash
cd /Users/Shared/code/obsidian-plugins/yijing-oracle
mkdir -p src/vendor/kit-obsidian
cp ../obsidian-kit/src/obsidian/collapsible.ts src/vendor/kit-obsidian/collapsible.ts
cp ../obsidian-kit/src/pure/model-context.ts src/vendor/kit/model-context.ts
```

- [ ] **Step 2: Vendor-Header setzen**

Erste Zeile von `src/vendor/kit-obsidian/collapsible.ts` (die Datei hat noch keinen Header —
`import { setIcon } from "obsidian";` steht dort in Zeile 1):

```ts
// vendored from obsidian-kit#0.13.0, src/obsidian/collapsible.ts
// Obsidian-gekoppelt (setIcon) → liegt bewusst NICHT unter src/vendor/kit/, das check:pure prüft.
import { setIcon } from "obsidian";
```

Erste Zeile von `src/vendor/kit/model-context.ts`:

```ts
// vendored from obsidian-kit#0.7.0, src/pure/model-context.ts
```

- [ ] **Step 3: `check:pure` auf die neue Ablage umstellen**

In `package.json` das Script ersetzen (`src/vendor` → `src/vendor/kit`):

```json
"check:pure": "sh -c \"! grep -rl \\\"from 'obsidian'\\\" src/core src/vendor/kit 2>/dev/null\"",
```

- [ ] **Step 4: `check:pure` verifizieren**

Run: `npm run check:pure`
Expected: Exit 0, keine Ausgabe. (Gegenprobe: `grep -rl "from 'obsidian'" src/vendor/kit-obsidian`
findet `collapsible.ts` — die Datei ist bewusst außerhalb des Gates.)

- [ ] **Step 5: `COLLAPSIBLE_CSS` + Status-/Warn-Klassen nach `styles.css`**

Ans Ende von `styles.css` anhängen. Die `.okit-*`-Klassen kommen 1:1 aus `COLLAPSIBLE_CSS` (der
Kit-Export ist nur ein String zum Kopieren — das Kit injiziert bewusst kein CSS). Die
`.yijing-ep-*`-Klassen tragen das Repo-Präfix:

```css

/* ── Einklappbare Settings-Sektionen (obsidian-kit#0.13.0, COLLAPSIBLE_CSS) ────── */
.okit-collapsible-header {
  display: flex; align-items: center; gap: var(--size-4-2);
  cursor: pointer; padding: var(--size-4-2) 0;
  font-weight: var(--font-semibold); color: var(--text-normal);
  border-bottom: 1px solid var(--background-modifier-border);
}
.okit-collapsible-header:hover { color: var(--text-accent); }
.okit-collapsible-header:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
  border-radius: var(--radius-s);
}
.okit-collapsible-chevron { display: inline-flex; color: var(--text-muted); }
.okit-collapsible-body { padding-top: var(--size-4-2); }
.okit-collapsible-body.is-collapsed { display: none; }

/* ── Endpunkt-Status + Eingabe-Warnungen ──────────────────────────────────────── */
.yijing-ep-status {
  display: inline-flex;
  align-items: center;
  margin-right: var(--size-4-2);
  color: var(--text-muted);
}
.yijing-ep-status.is-ok { color: var(--text-success); }
.yijing-ep-status.is-error { color: var(--text-error); }
.yijing-ep-status.is-active { color: var(--text-accent); }
.yijing-ep-warn {
  display: inline-flex;
  align-items: center;
  margin-right: var(--size-4-2);
  color: var(--text-warning);
}
```

- [ ] **Step 6: Gate**

Run: `npm run gate`
Expected: alles grün (die neuen Module sind noch ungenutzt — `lint` darf sie nicht als unused
melden, da es keine Aufrufer-Prüfung über Modulgrenzen macht; `check:bundle` unverändert).

- [ ] **Step 7: Commit**

```bash
git add src/vendor/kit-obsidian/collapsible.ts src/vendor/kit/model-context.ts package.json styles.css
git commit -m "chore(vendor): collapsible@0.13.0 + model-context@0.7.0 aus dem Kit

Obsidian-gekoppelte Kit-Module bekommen eine eigene Ablage
(src/vendor/kit-obsidian/), weil check:pure src/vendor rekursiv prueft und
collapsible.ts setIcon importiert. check:pure prueft jetzt src/vendor/kit."
```

---

### Task 2: Pure Zeilen-Editor-Logik (TDD)

Portiert nach dem `vault-crews`-Schnitt (`vault-crews/src/obsidian/endpoint-editor-model.ts`), aber
unter `src/core/` statt `src/obsidian/` — dadurch greift `check:pure` automatisch, ohne die Datei
einzeln im Script listen zu müssen (crews muss genau das tun).

**Nicht portiert:** `modelFieldMode` aus crews — die Funktion ignoriert ihren `saved`-Parameter
vollständig und ist dort toter Code. yijing hat für denselben Zweck bereits `effectiveModel`.

**Files:**
- Create: `src/core/settings/endpoint-editor-model.ts`
- Test: `tests/endpoint-editor-model.test.ts`

**Interfaces:**
- Consumes: `EndpointStatusKind` aus `src/vendor/kit/endpoint_diagnostics.ts`
  (`"ok" | "refused" | "unknown-host" | "timeout" | "not-an-llm-api" | "unknown"`)
- Produces:
  - `applyEndpointEdit(list: string[], index: number, value: string, isAdder: boolean) → string[]`
  - `activeIndexFromStatuses(statuses: (EndpointStatusKind | null)[]) → number` (**-1** wenn keiner ok — `findIndex`-Semantik, nicht `null`)
  - `statusKindKey(kind: EndpointStatusKind) → string` → `"set.ep.status.<kind>"`
  - `warnRuleKey(rule: string) → string` → `"set.ep.warn.<rule>"`

- [ ] **Step 1: Failing test schreiben**

`tests/endpoint-editor-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  activeIndexFromStatuses,
  applyEndpointEdit,
  statusKindKey,
  warnRuleKey,
} from "../src/core/settings/endpoint-editor-model";

describe("applyEndpointEdit", () => {
  it("hängt einen nicht-leeren Wert aus der Adder-Zeile an", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "http://b:2", true)).toEqual([
      "http://a:1",
      "http://b:2",
    ]);
  });

  it("ist ein No-Op, wenn die Adder-Zeile leer bleibt", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "   ", true)).toEqual(["http://a:1"]);
  });

  it("ersetzt eine bestehende Zeile an ihrer Stelle", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "http://c:3", false)).toEqual([
      "http://c:3",
      "http://b:2",
    ]);
  });

  it("entfernt eine bestehende Zeile, die geleert wurde", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "", false)).toEqual(["http://b:2"]);
  });

  it("trimmt den Wert", () => {
    expect(applyEndpointEdit([], 0, "  http://a:1  ", true)).toEqual(["http://a:1"]);
  });

  it("filtert Leereinträge aus der Liste heraus", () => {
    expect(applyEndpointEdit(["", "http://a:1"], 1, "http://a:1", false)).toEqual(["http://a:1"]);
  });

  it("mutiert die Eingabeliste nicht", () => {
    const list = ["http://a:1"];
    applyEndpointEdit(list, 0, "http://c:3", false);
    expect(list).toEqual(["http://a:1"]);
  });
});

describe("activeIndexFromStatuses", () => {
  it("liefert den ersten erreichbaren Index (resolveActiveEndpoint-Semantik)", () => {
    expect(activeIndexFromStatuses(["refused", "ok", "ok"])).toBe(1);
  });

  it("liefert -1, wenn keiner erreichbar ist", () => {
    expect(activeIndexFromStatuses(["refused", "timeout"])).toBe(-1);
  });

  it("liefert -1, solange noch nichts geprobt wurde", () => {
    expect(activeIndexFromStatuses([null, null])).toBe(-1);
  });

  it("überspringt noch nicht geprobte Zeilen vor einem erreichbaren", () => {
    expect(activeIndexFromStatuses([null, "ok"])).toBe(1);
  });
});

describe("i18n-Key-Ableitung", () => {
  it("bildet Status-Kinds auf set.ep.status.* ab", () => {
    expect(statusKindKey("not-an-llm-api")).toBe("set.ep.status.not-an-llm-api");
    expect(statusKindKey("ok")).toBe("set.ep.status.ok");
  });

  it("bildet Warn-Regeln auf set.ep.warn.* ab", () => {
    expect(warnRuleKey("placeholder-ip")).toBe("set.ep.warn.placeholder-ip");
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/endpoint-editor-model.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/settings/endpoint-editor-model"`

- [ ] **Step 3: Minimale Implementierung**

`src/core/settings/endpoint-editor-model.ts`:

```ts
// Pure Logik des Endpunkt-Zeilen-Editors (UI-STANDARD §6): obsidian-/DOM-frei, node-testbar,
// von check:pure erfasst (liegt unter src/core). Die Render-Schicht (obsidian/settings/) ruft
// diese Funktionen und bleibt dünn. Schnitt übernommen von vault-crews/src/obsidian/
// endpoint-editor-model.ts — dort liegt sie unter obsidian/ und muss einzeln ins Gate-Script.
import type { EndpointStatusKind } from "../../vendor/kit/endpoint_diagnostics";

/** Wendet eine Zeilen-Editor-Änderung auf die Endpunkt-Liste an.
 *  - trimmt den Wert;
 *  - `isAdder` (letzte Leerzeile) hängt einen nicht-leeren Wert an, ein leerer Wert ist No-Op;
 *  - eine bestehende Zeile mit geleertem Wert wird entfernt, sonst an ihrer Stelle ersetzt;
 *  - am Ende werden Leereinträge herausgefiltert (nie leere Zeilen persistieren).
 *  Mutiert `list` nie. */
export function applyEndpointEdit(
  list: string[],
  index: number,
  value: string,
  isAdder: boolean,
): string[] {
  const v = value.trim();
  let next: string[];
  if (isAdder) {
    next = v ? [...list, v] : [...list];
  } else {
    next = [...list];
    if (v) next[index] = v;
    else next.splice(index, 1);
  }
  return next.filter((e) => e.trim().length > 0);
}

/** Index der ersten erreichbaren Zeile (= aktiver Endpunkt, exakt die
 *  `resolveActiveEndpoint`-Semantik: erster erreichbarer gewinnt), sonst -1.
 *  `null` in der Liste = diese Zeile wurde noch nicht geprobt. */
export function activeIndexFromStatuses(statuses: (EndpointStatusKind | null)[]): number {
  return statuses.findIndex((s) => s === "ok");
}

/** i18n-Key für einen Endpunkt-Status (Render-Schicht ruft `t(key)`). Eigene Keys statt
 *  `EndpointStatus.klartext` — das Kit-Feld ist hart deutsch, yijing ist zweisprachig. */
export function statusKindKey(kind: EndpointStatusKind): string {
  return `set.ep.status.${kind}`;
}

/** i18n-Key für eine Eingabe-Warn-Regel von `validateEndpointInput`
 *  (scheme · malformed · port · placeholder-ip). */
export function warnRuleKey(rule: string): string {
  return `set.ep.warn.${rule}`;
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run tests/endpoint-editor-model.test.ts`
Expected: PASS, 12 Tests

- [ ] **Step 5: Gate + Commit**

```bash
npm run gate
git add src/core/settings/endpoint-editor-model.ts tests/endpoint-editor-model.test.ts
git commit -m "feat(settings): pure Zeilen-Editor-Logik (TDD)

Schnitt von vault-crews uebernommen, aber unter src/core statt src/obsidian —
damit greift check:pure automatisch. modelFieldMode bewusst nicht portiert
(ignoriert dort seinen saved-Parameter, toter Code; yijing hat effectiveModel)."
```

---

### Task 3: Migration + Datenmodell (TDD)

`LlmSettings.endpoints` wird von `string` (Textarea-Text) zu `string[]`; `activeEndpoint` entfällt,
weil „aktiv" künftig abgeleitet wird (erster erreichbarer). Bestehende `data.json` müssen lautlos
überleben.

**Files:**
- Create: `src/core/settings/migrate.ts`
- Test: `tests/settings-migrate.test.ts`
- Modify: `src/core/llm/settings-defaults.ts`
- Modify: `src/main.ts:38-39`

**Interfaces:**
- Consumes: `parseEndpointList(text: string) → string[]` aus `src/vendor/kit/endpoint.ts`
- Produces:
  - `migrateEndpointList(raw: string | string[] | undefined) → string[]`
  - geändertes `interface LlmSettings` — `endpoints: string[]`, **kein** `activeEndpoint` mehr
  - `DEFAULT_LLM_SETTINGS.endpoints = ["http://localhost:1234"]`

- [ ] **Step 1: Failing test schreiben**

`tests/settings-migrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { migrateEndpointList } from "../src/core/settings/migrate";

describe("migrateEndpointList", () => {
  it("parst den alten Textarea-String zeilenweise (Bestands-data.json)", () => {
    expect(migrateEndpointList("http://a:1\nhttp://b:2")).toEqual(["http://a:1", "http://b:2"]);
  });

  it("trimmt und wirft Leerzeilen weg", () => {
    expect(migrateEndpointList("  http://a:1  \n\n\nhttp://b:2")).toEqual([
      "http://a:1",
      "http://b:2",
    ]);
  });

  it("dedupliziert (parseEndpointList-Semantik)", () => {
    expect(migrateEndpointList("http://a:1\nhttp://a:1")).toEqual(["http://a:1"]);
  });

  it("lässt eine bereits migrierte Liste unverändert", () => {
    expect(migrateEndpointList(["http://a:1", "http://b:2"])).toEqual([
      "http://a:1",
      "http://b:2",
    ]);
  });

  it("filtert Leereinträge aus einer bestehenden Liste", () => {
    expect(migrateEndpointList(["http://a:1", "", "  "])).toEqual(["http://a:1"]);
  });

  it("liefert [] für undefined (Feld fehlt in data.json)", () => {
    expect(migrateEndpointList(undefined)).toEqual([]);
  });

  it("liefert [] für einen leeren String", () => {
    expect(migrateEndpointList("")).toEqual([]);
  });

  it("liefert [] für eine leere Liste", () => {
    expect(migrateEndpointList([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/settings-migrate.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/settings/migrate"`

- [ ] **Step 3: Implementierung**

`src/core/settings/migrate.ts`:

```ts
// Migration der Bestands-Settings. Pure — von check:pure erfasst.
import { parseEndpointList } from "../../vendor/kit/endpoint";

/** Endpunkt-Liste aus einer Bestands-`data.json` normalisieren.
 *
 *  Bis 0.2.0 war `llm.endpoints` ein Textarea-**String** (eine URL pro Zeile) plus ein
 *  separates `activeEndpoint`-Feld. Ab jetzt ist es `string[]`, und „aktiv" wird abgeleitet
 *  (erster erreichbarer). mergeSettings ist shallow, deshalb kann nach dem llm-Spread in
 *  main.ts noch der alte String im Feld stehen — diese Funktion nimmt beide Formen.
 *
 *  Abweichung von vault-rags `migrateEndpointList(single, list)`: dort war der Altbestand ein
 *  Single-Endpoint-Feld, hier ein mehrzeiliger String → ein Union-Parameter statt zweier.
 *
 *  @example migrateEndpointList("http://a:1\nhttp://b:2") // → ["http://a:1", "http://b:2"]
 *  @example migrateEndpointList(["http://a:1"])           // → ["http://a:1"]
 *  @example migrateEndpointList(undefined)                // → [] */
export function migrateEndpointList(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return raw.filter((e) => e && e.trim().length > 0);
  if (typeof raw === "string") return parseEndpointList(raw);
  return [];
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run tests/settings-migrate.test.ts`
Expected: PASS, 8 Tests

- [ ] **Step 5: `LlmSettings` umstellen**

In `src/core/llm/settings-defaults.ts` das Interface-Feld und den Default ersetzen. Vorher:

```ts
  /** Textarea, eine Endpunkt-URL pro Zeile. */
  endpoints: string;
  /** Aktive Endpunkt-URL (eine der Zeilen; wird beim Aufruf normalisiert). */
  activeEndpoint: string;
```

Nachher:

```ts
  /** Geordnete Endpunkt-Liste. Die Reihenfolge IST die Priorität: der erste erreichbare
   *  gewinnt (resolveActiveEndpoint). Ein separates activeEndpoint-Feld gibt es bewusst
   *  nicht mehr — der Nutzer sortiert um, statt auszuwählen. */
  endpoints: string[];
```

Und in `DEFAULT_LLM_SETTINGS` vorher:

```ts
  endpoints: "http://localhost:1234",
  activeEndpoint: "http://localhost:1234",
```

Nachher:

```ts
  endpoints: ["http://localhost:1234"],
```

- [ ] **Step 6: Migration in `main.ts` einhängen**

In `src/main.ts` Zeile 38-39 ersetzen. Vorher:

```ts
    // mergeSettings ist shallow — das llm-Objekt separat gegen neue Defaults auffüllen.
    this.settings.llm = { ...DEFAULT_LLM_SETTINGS, ...(this.settings.llm ?? {}) };
```

Nachher:

```ts
    // mergeSettings ist shallow — das llm-Objekt separat gegen neue Defaults auffüllen.
    this.settings.llm = { ...DEFAULT_LLM_SETTINGS, ...(this.settings.llm ?? {}) };
    // Nach dem Spread steht in `endpoints` entweder noch der alte Textarea-String
    // (Bestands-data.json bis 0.2.0) oder bereits string[]. migrateEndpointList nimmt beides.
    // Das alte `activeEndpoint` wird ignoriert und verschwindet beim naechsten saveData.
    this.settings.llm.endpoints = migrateEndpointList(
      this.settings.llm.endpoints as unknown as string | string[] | undefined,
    );
```

Import in `src/main.ts` ergänzen (zu den bestehenden `./core/`-Imports):

```ts
import { migrateEndpointList } from "./core/settings/migrate";
```

- [ ] **Step 7: Alle Aufrufer von `activeEndpoint` finden**

Run: `grep -rn "activeEndpoint\|llm.endpoints" src tests`
Expected: Treffer in `src/obsidian/settings.ts` (Task 5/6 baut die Datei ohnehin neu) und ggf.
`src/obsidian/view.ts`. **Jeder Treffer außerhalb von `src/obsidian/settings.ts` muss jetzt auf
`resolveActiveEndpoint(llm.endpoints, ping)` umgestellt werden** — die View kann nicht mehr auf ein
gespeichertes Feld zugreifen. Falls `view.ts` betroffen ist: dort `resolveActiveEndpoint` aus
`src/vendor/kit/endpoint.ts` nutzen, mit `ping: async (ep) => (await probeEndpoint(ep)).reachable`.

- [ ] **Step 8: Gate**

Run: `npm run gate`
Expected: `typecheck` schlägt zunächst in `src/obsidian/settings.ts` fehl (nutzt noch
`llm.endpoints` als String und `llm.activeEndpoint`). Das ist erwartet und wird in Task 5/6
aufgelöst. **Um den Task grün abzuschließen:** die betroffenen Stellen in `settings.ts` minimal
anpassen — `parseEndpointList(llm.endpoints)` → `llm.endpoints`, und das Aktiv-Dropdown vorläufig
auf `llm.endpoints[0]` setzen. Die Datei wird in Task 5/6 ersetzt; hier zählt nur, dass das Gate
grün bleibt.

- [ ] **Step 9: Commit**

```bash
git add src/core/settings/migrate.ts tests/settings-migrate.test.ts src/core/llm/settings-defaults.ts src/main.ts src/obsidian/settings.ts
git commit -m "feat(settings): endpoints als Liste + Migration der Bestands-data.json

endpoints: string (Textarea) -> string[]; activeEndpoint entfaellt, aktiv wird
abgeleitet (erster erreichbarer, resolveActiveEndpoint-Semantik) wie in allen
drei Nachbar-Plugins. migrateEndpointList nimmt beide Formen — Bestands-Vaults
migrieren lautlos ohne Nutzeraktion."
```

---

### Task 4: Settings-Datei aufteilen (reiner Umzug, kein Verhaltenswechsel)

Dieser Task ändert **kein** Verhalten. Er trennt nur, damit die folgenden Tasks in dünne Dateien
schreiben statt in eine 447-Zeilen-Klasse. Ein Reviewer kann ihn isoliert prüfen: das Gate ist
grün und die Settings sehen exakt aus wie vorher.

**Files:**
- Create: `src/core/settings.ts`
- Create: `src/obsidian/settings/index.ts`
- Create: `src/obsidian/settings/note-section.ts`
- Create: `src/obsidian/settings/llm-section.ts`
- Create: `src/obsidian/settings/image-section.ts`
- Delete: `src/obsidian/settings.ts`

**Interfaces:**
- Consumes: alles aus dem bisherigen `src/obsidian/settings.ts`
- Produces:
  - `src/core/settings.ts`: `interface PluginSettings`, `DEFAULT_SETTINGS`, `type OutputMode`,
    `resolveReadingLang(settings, uiLocale?) → Lang`, `interface SettingsHost`
  - `src/obsidian/settings/index.ts`: `class SettingsTab`, plus Re-Export von allem oben
    (damit `main.ts`/`view.ts`-Importe unverändert bleiben)
  - `renderNoteSections(containerEl, ctx)`, `renderLlmSection(containerEl, ctx)`,
    `renderImageSection(containerEl, ctx)` — jeweils
    `ctx: { host: SettingsHost; rerender: () => void }`

- [ ] **Step 1: Pure Typen nach `src/core/settings.ts` verschieben**

Neue Datei `src/core/settings.ts` — Inhalt sind die Zeilen 19-67 des bisherigen
`src/obsidian/settings.ts` (`OutputMode`, `PluginSettings`, `DEFAULT_SETTINGS`,
`resolveReadingLang`, `SettingsHost`), **ohne** den `obsidian`-Import. `pickLang` kommt aus
`../vendor/kit/i18n` (pure, unproblematisch). Kopfkommentar:

```ts
// Settings-Typen + Defaults. Pure (kein obsidian-Import) — von check:pure erfasst. Die
// Render-Schicht lebt in obsidian/settings/ und re-exportiert diese Symbole, damit die
// bestehenden Import-Pfade (main.ts, view.ts) unveraendert bleiben.
```

Das neue Feld für Task 5 gleich mit aufnehmen — in `PluginSettings`:

```ts
  /** Auf-/Zu-Zustand der einklappbaren Settings-Sektionen, pro Sektions-Key. */
  uiCollapsed: Record<string, boolean>;
```

und in `DEFAULT_SETTINGS`:

```ts
  uiCollapsed: {},
```

- [ ] **Step 2: Render-Sektionen in eigene Dateien schneiden**

`src/obsidian/settings/note-section.ts`, `llm-section.ts`, `image-section.ts` erhalten jeweils den
**unveränderten** Code der bisherigen privaten Methoden — als exportierte Funktionen mit explizitem
Kontext statt `this`:

```ts
export interface SectionCtx {
  host: SettingsHost;
  /** Vollständiger Neuaufbau des Tabs (bisher: this.display()). */
  rerender: () => void;
}
```

- `note-section.ts` → `renderNoteSections(containerEl, ctx)` — bisheriger Code aus `display()`
  (Sprache/Register/Ausgabe/Ordner/Dateiname/öffnen), der Frontmatter-Block und
  `renderCalloutSettings`.
- `llm-section.ts` → `renderLlmSection(containerEl, ctx)` — bisheriges `renderLlmSettings`.
- `image-section.ts` → `renderImageSection(containerEl, ctx)` — bisheriges `renderImageSettings`.

Jedes `this.display()` wird zu `ctx.rerender()`, jedes `this.host` zu `ctx.host`.

- [ ] **Step 3: `index.ts` als dünner Tab**

`src/obsidian/settings/index.ts`:

```ts
import { type App, type Plugin, PluginSettingTab } from "obsidian";
import { type SettingsHost } from "../../core/settings";
import { renderNoteSections } from "./note-section";
import { renderLlmSection } from "./llm-section";
import { renderImageSection } from "./image-section";

// Import-Pfade der Bestands-Aufrufer (main.ts, view.ts) unveraendert halten.
export { DEFAULT_SETTINGS, resolveReadingLang } from "../../core/settings";
export type { OutputMode, PluginSettings, SettingsHost } from "../../core/settings";
export { DEFAULT_LLM_SETTINGS } from "../../core/llm/settings-defaults";
export type { LlmSettings } from "../../core/llm/settings-defaults";

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const ctx = { host: this.host, rerender: () => this.display() };

    renderNoteSections(containerEl, ctx);
    renderLlmSection(containerEl, ctx);
    renderImageSection(containerEl, ctx);
  }
}
```

- [ ] **Step 4: Alte Datei löschen**

```bash
git rm src/obsidian/settings.ts
```

- [ ] **Step 5: Gate — muss grün sein, ohne dass sich die UI ändert**

Run: `npm run gate`
Expected: alles grün. Node-Resolution findet `./obsidian/settings` jetzt über
`settings/index.ts` — die Importe in `main.ts` bleiben unverändert.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/settings.ts src/obsidian/settings
git commit -m "refactor(settings): 447-Zeilen-Klasse in Verzeichnis aufteilen

Reiner Umzug, kein Verhaltenswechsel: pure Typen nach core/settings.ts,
Render-Sektionen in je eine Datei unter obsidian/settings/. index.ts
re-exportiert, damit die Bestands-Importpfade unveraendert bleiben."
```

---

### Task 5: Einklappbare Sektionen

**Files:**
- Modify: `src/obsidian/settings/index.ts`
- Modify: `src/obsidian/settings/note-section.ts` (Aufteilung in zwei Sektionen, `showNotes`-Umzug)
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `collapsibleSection`, `CollapsibleStorage` aus `../../vendor/kit-obsidian/collapsible`;
  `PluginSettings.uiCollapsed` (Task 4)
- Produces: `renderNoteStorageSection(containerEl, ctx)` und `renderNoteContentSection(containerEl, ctx)`
  (ersetzen `renderNoteSections`); `renderGeneralSection(containerEl, ctx)`

- [ ] **Step 1: i18n-Keys für die Sektionstitel**

In `src/i18n/strings.ts` in **beide** Dicts. `en`:

```ts
      "set.secGeneral": "General",
      "set.secNoteStorage": "Note & storage",
      "set.secNoteContent": "Note content",
```

`de`:

```ts
      "set.secGeneral": "Allgemein",
      "set.secNoteStorage": "Notiz & Ablage",
      "set.secNoteContent": "Notiz-Inhalt",
```

Die Sektionstitel für KI und Bild existieren bereits (`set.llmHead`, `set.imgHead`) und werden
wiederverwendet.

- [ ] **Step 2: `note-section.ts` in drei Render-Funktionen teilen**

- `renderGeneralSection` — Reading-Sprache, Register, Ausgabe.
- `renderNoteStorageSection` — Ordner, Dateiname-Schema, Nach Erstellen öffnen.
- `renderNoteContentSection` — Frontmatter-Master + Feldzeilen, **`showNotes`** (wandert hierher
  aus dem bisherigen Frontmatter-Block), Callout-Zeilen.

Die `setHeading()`-Aufrufe für „Frontmatter" und „Notiz-Layout" entfallen — die Sektion selbst ist
jetzt der Header. Innerhalb von `renderNoteContentSection` bleiben Frontmatter und Callouts durch je
ein `new Setting(el).setName(...).setHeading()` als Sub-Überschrift getrennt (UI-STANDARD §5 erlaubt
Sub-Headings via `setHeading()`).

- [ ] **Step 3: Sektionsgerüst in `index.ts`**

```ts
import { type App, type Plugin, PluginSettingTab } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { collapsibleSection, type CollapsibleStorage } from "../../vendor/kit-obsidian/collapsible";
import { type SettingsHost } from "../../core/settings";
import { renderGeneralSection, renderNoteContentSection, renderNoteStorageSection } from "./note-section";
import { renderLlmSection } from "./llm-section";
import { renderImageSection } from "./image-section";

export class SettingsTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const ctx = { host: this.host, rerender: () => this.display() };

    // Auf-/Zu-Zustand ueberlebt das Schliessen des Tabs (Kit ist storage-agnostisch —
    // der Consumer verdrahtet die Persistenz selbst).
    const storage: CollapsibleStorage = {
      getCollapsed: (key) => this.host.settings.uiCollapsed[key],
      setCollapsed: (key, collapsed) => {
        this.host.settings.uiCollapsed[key] = collapsed;
        void this.host.saveSettings();
      },
    };

    renderGeneralSection(
      collapsibleSection(containerEl, {
        title: t("set.secGeneral"),
        key: "general",
        storage,
        defaultCollapsed: false,
      }),
      ctx,
    );
    renderNoteStorageSection(
      collapsibleSection(containerEl, { title: t("set.secNoteStorage"), key: "note-storage", storage }),
      ctx,
    );
    renderNoteContentSection(
      collapsibleSection(containerEl, { title: t("set.secNoteContent"), key: "note-content", storage }),
      ctx,
    );
    renderLlmSection(
      collapsibleSection(containerEl, { title: t("set.llmHead"), key: "llm", storage }),
      ctx,
    );
    renderImageSection(
      collapsibleSection(containerEl, { title: t("set.imgHead"), key: "image", storage }),
      ctx,
    );
  }
}
```

Die `setHeading()`-Aufrufe `set.llmHead` / `set.imgHead` **innerhalb** von `llm-section.ts` und
`image-section.ts` entfallen — der Sektions-Header ersetzt sie (sonst steht der Titel doppelt).

- [ ] **Step 4: Gate**

Run: `npm run gate`
Expected: grün.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/settings src/i18n/strings.ts
git commit -m "feat(settings): einklappbare Sektionen (Kit-collapsible)

Fuenf Sektionen, 'Allgemein' offen, Rest zu; Zustand persistiert in
settings.uiCollapsed. showNotes wandert von 'Frontmatter' nach 'Notiz-Inhalt',
wo es inhaltlich hingehoert."
```

---

### Task 6: Endpunkt-Zeilen-Editor in der KI-Sektion

Ersetzt Textarea + Aktiv-Dropdown + Einzel-Test-Button.

**Files:**
- Create: `src/obsidian/settings/endpoint-list.ts`
- Modify: `src/obsidian/settings/llm-section.ts`
- Modify: `src/core/settings.ts` (`SettingsHost` erweitern)
- Modify: `src/main.ts` (neue Host-Methode)
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `applyEndpointEdit`, `activeIndexFromStatuses`, `statusKindKey`, `warnRuleKey`
  (Task 2); `ENDPOINT_PRESETS`, `validateEndpointInput`, `EndpointStatus`, `EndpointStatusKind`
  aus `../../vendor/kit/endpoint_diagnostics`; `probeEndpoint` aus `../http`
- Produces: `buildEndpointList(containerEl, opts)` mit
  `opts: { list: string[]; name: string; desc: string; setList(next: string[]): void; probe(ep: string): Promise<EndpointStatus>; commit(): void }`
  — `SettingsHost` bekommt `probeEndpoint(endpoint: string): Promise<EndpointStatus>`

- [ ] **Step 1: i18n-Keys**

In `src/i18n/strings.ts`, `en`:

```ts
      "set.epAdd": "Add an endpoint…",
      "set.epRemove": "Remove",
      "set.epPresetAdd": "Add {0}",
      "set.epProbe": "Test connections",
      "set.ep.status.ok": "Connected",
      "set.ep.status.refused": "Connection refused — server not running or wrong port?",
      "set.ep.status.unknown-host": "Unknown host — typo in the address?",
      "set.ep.status.timeout": "Timed out — network unreachable (wrong network / VPN off?).",
      "set.ep.status.not-an-llm-api": "Responds, but is not an OpenAI-compatible endpoint — wrong path or service?",
      "set.ep.status.unknown": "Could not reach the endpoint.",
      "set.ep.warn.scheme": "Address needs http:// or https://",
      "set.ep.warn.malformed": "Address is not a valid URL",
      "set.ep.warn.port": "Local LLM servers almost always need a port (e.g. :1234)",
      "set.ep.warn.placeholder-ip": "Looks like an example or placeholder address",
```

`de`:

```ts
      "set.epAdd": "Endpunkt hinzufügen…",
      "set.epRemove": "Entfernen",
      "set.epPresetAdd": "{0} hinzufügen",
      "set.epProbe": "Verbindungen prüfen",
      "set.ep.status.ok": "Verbunden",
      "set.ep.status.refused": "Verbindung abgelehnt — Server läuft nicht oder Port falsch?",
      "set.ep.status.unknown-host": "Hostname unbekannt — Tippfehler in der Adresse?",
      "set.ep.status.timeout": "Zeitüberschreitung — Netz nicht erreichbar (falsches Netz / VPN aus?).",
      "set.ep.status.not-an-llm-api": "Antwortet, ist aber kein OpenAI-kompatibler Endpunkt — falscher Pfad/Dienst?",
      "set.ep.status.unknown": "Endpunkt nicht erreichbar.",
      "set.ep.warn.scheme": "Adresse braucht http:// oder https://",
      "set.ep.warn.malformed": "Adresse ist keine gültige URL",
      "set.ep.warn.port": "Lokale LLM-Server brauchen fast immer einen Port (z. B. :1234)",
      "set.ep.warn.placeholder-ip": "Sieht aus wie eine Beispiel-/Platzhalter-Adresse",
```

Die alten Keys `set.llmEndpointsDesc` bleiben; `set.llmActive` und `set.llmTest` werden nicht mehr
gebraucht und werden entfernt.

- [ ] **Step 2: `SettingsHost` erweitern**

In `src/core/settings.ts`:

```ts
export interface SettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  /** Probt EINEN Endpunkt und klassifiziert das Ergebnis (Per-Zeile-Status im Editor).
   *  Injiziert, damit die Settings-Schicht die Netz-Anbindung nicht selbst kennt. */
  probeEndpoint(endpoint: string): Promise<EndpointStatus>;
}
```

Import ergänzen: `import { type EndpointStatus } from "../vendor/kit/endpoint_diagnostics";`
(pure — `check:pure`-konform).

In `src/main.ts` die Methode auf der Plugin-Klasse ergänzen:

```ts
  /** SettingsHost: Per-Zeile-Probe fuer den Endpunkt-Editor. */
  probeEndpoint(endpoint: string): Promise<EndpointStatus> {
    return probeEndpoint(normalizeEndpoint(endpoint));
  }
```

mit den Importen:

```ts
import { probeEndpoint } from "./obsidian/http";
import { normalizeEndpoint } from "./vendor/kit/endpoint";
import { type EndpointStatus } from "./vendor/kit/endpoint_diagnostics";
```

- [ ] **Step 3: `endpoint-list.ts` schreiben**

```ts
// Endpunkt-Zeilen-Editor (UI-STANDARD §8, Kanon-Regel). Duenne Render-Schicht — die Logik
// liegt pure in core/settings/endpoint-editor-model.ts. Schnitt von vault-crews uebernommen.
import { Setting, setIcon } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import {
  ENDPOINT_PRESETS,
  validateEndpointInput,
  type EndpointStatus,
  type EndpointStatusKind,
} from "../../vendor/kit/endpoint_diagnostics";
import {
  activeIndexFromStatuses,
  applyEndpointEdit,
  statusKindKey,
  warnRuleKey,
} from "../../core/settings/endpoint-editor-model";

export interface EndpointListOpts {
  list: string[];
  name: string;
  desc: string;
  setList(next: string[]): void;
  probe(endpoint: string): Promise<EndpointStatus>;
  /** Nach einer Listen-Aenderung: speichern + Tab neu aufbauen. */
  commit(): void;
}

/** Zeilen-Editor: eine Setting-Zeile je Endpunkt, letzte Leerzeile ist der Adder. */
export function buildEndpointList(containerEl: HTMLElement, opts: EndpointListOpts): void {
  const statuses: (EndpointStatusKind | null)[] = opts.list.map(() => null);
  const statusEls: HTMLElement[] = [];
  const rows = [...opts.list, ""]; // letzte Leerzeile = Adder

  const commit = (next: string[]): void => {
    opts.setList(next);
    opts.commit();
  };

  rows.forEach((value, i) => {
    const isAdder = i >= opts.list.length;
    const setting = new Setting(containerEl);
    if (i === 0) setting.setName(opts.name).setDesc(opts.desc);

    if (!isAdder) {
      // Status-Indikator: Form UND Farbe UND Klasse UND aria-label (WCAG 1.4.1).
      const statusEl = setting.settingEl.createSpan({ cls: "yijing-ep-status is-checking" });
      setIcon(statusEl, "loader");
      statusEl.setAttribute("aria-label", t("set.ep.status.unknown"));
      statusEls.push(statusEl);
    }

    setting.addText((c) => {
      c.setValue(value);
      if (isAdder) c.setPlaceholder(t("set.epAdd"));
      // Mutation NUR bei blur, nicht in onChange: onChange feuert pro Tastendruck und wuerde
      // im Adder jeden Zwischenstand (h, ht, htt, …) anhaengen.
      c.inputEl.addEventListener("blur", () => {
        const next = applyEndpointEdit(opts.list, i, c.getValue(), isAdder);
        if (next.length === opts.list.length && next.every((e, k) => e === opts.list[k])) return;
        commit(next);
      });
    });

    if (!isAdder) {
      const warnings = validateEndpointInput(value);
      if (warnings.length > 0) {
        const warnEl = setting.settingEl.createSpan({ cls: "yijing-ep-warn" });
        setIcon(warnEl, "alert-triangle");
        warnEl.setAttribute("aria-label", warnings.map((w) => t(warnRuleKey(w.rule))).join(" · "));
      }
      // Das Status-Icon ist KEIN Loesch-Button — Loeschen laeuft ueber diesen Trash.
      setting.addExtraButton((b) =>
        b
          .setIcon("trash-2")
          .setTooltip(t("set.epRemove"))
          .onClick(() => commit(applyEndpointEdit(opts.list, i, "", false))),
      );
    }
  });

  const actions = new Setting(containerEl);
  for (const preset of ENDPOINT_PRESETS) {
    actions.addButton((b) =>
      b.setButtonText(t("set.epPresetAdd", preset.label)).onClick(() => {
        if (!opts.list.includes(preset.url)) commit([...opts.list, preset.url]);
      }),
    );
  }
  actions.addButton((b) => b.setButtonText(t("set.epProbe")).onClick(() => opts.commit()));

  // Probe je Zeile; der erste erreichbare wird als aktiv markiert.
  opts.list.forEach((ep, i) => {
    void opts.probe(ep).then((status) => {
      statuses[i] = status.kind;
      const el = statusEls[i];
      if (el) {
        el.removeClass("is-checking", "is-ok", "is-error");
        setIcon(el, status.reachable ? "circle-check" : "circle-x");
        el.addClass(status.reachable ? "is-ok" : "is-error");
        el.setAttribute("aria-label", t(statusKindKey(status.kind)));
      }
      const active = activeIndexFromStatuses(statuses);
      statusEls.forEach((se, j) => se.toggleClass("is-active", j === active));
    });
  });
}
```

- [ ] **Step 4: `llm-section.ts` umbauen**

Textarea-Block, Aktiv-Dropdown und Einzel-Test-Button ersetzen durch:

```ts
  buildEndpointList(containerEl, {
    list: llm.endpoints,
    name: t("set.llmEndpoints"),
    desc: t("set.llmEndpointsDesc"),
    setList: (next) => {
      llm.endpoints = next;
    },
    probe: (ep) => ctx.host.probeEndpoint(ep),
    commit: () => {
      void ctx.host.saveSettings().then(() => ctx.rerender());
    },
  });
```

Das Modell-Feld nutzte bisher `llm.activeEndpoint`. Es bekommt jetzt den ersten Eintrag der Liste
als Basis — die Modell-Liste kommt ohnehin nur von einem erreichbaren Server, und der
`effectiveModel`-Guard bleibt unverändert:

```ts
  const primary = llm.endpoints[0] ?? "";
  void new ChatClient(primary, llm.model, httpGet).listModels().then(async (models) => {
```

- [ ] **Step 5: Gate**

Run: `npm run gate`
Expected: grün. `grep -rn "activeEndpoint" src` liefert **keine** Treffer mehr.

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/settings src/core/settings.ts src/main.ts src/i18n/strings.ts
git commit -m "feat(settings): Endpunkt-Zeilen-Editor mit Per-Zeile-Test

Ersetzt Textarea + Aktiv-Dropdown + Einzel-Test-Button: Add-Leerzeile,
Trash pro Zeile, Mutation nur bei blur, Live-Status-Icon (Form+Farbe+Klasse
+aria-label), Presets, Eingabe-Warnungen. Eigene i18n-Statuskeys statt
EndpointStatus.klartext — das Kit-Feld ist hart deutsch, yijing zweisprachig."
```

---

### Task 7: Kontextlänge + Always-on-Thinker-Erkennung

**Files:**
- Modify: `src/obsidian/settings/llm-section.ts`
- Modify: `src/obsidian/http.ts`
- Modify: `src/i18n/strings.ts`
- Test: `tests/model-context.test.ts`

**Interfaces:**
- Consumes: `parseLmStudioContext` (Task 1), `isAlwaysOnThinker` aus `../../vendor/kit/reasoning`
- Produces: `fetchModelContext(baseUrl: string, model: string) → Promise<ModelContext | null>` in
  `src/obsidian/http.ts`

- [ ] **Step 1: i18n-Keys**

`en`:

```ts
      "set.llmContext": "Context: {0} tokens",
      "set.llmThinkingAlways": "This model always reasons — the setting has no effect.",
```

`de`:

```ts
      "set.llmContext": "Kontext: {0} Tokens",
      "set.llmThinkingAlways": "Dieses Modell denkt immer — die Einstellung wirkt hier nicht.",
```

- [ ] **Step 2: Failing test für den Kontext-Parser-Vertrag**

`tests/model-context.test.ts` — sichert das vendored Kit-Modul gegen Drift beim nächsten
Kit-Update ab (die Repo-Konvention testet vendored Module, siehe `tests/think.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { parseLmStudioContext, parseOllamaContext } from "../src/vendor/kit/model-context";

describe("parseLmStudioContext", () => {
  it("liest max_context_length + loaded_context_length des passenden Modells", () => {
    const json = {
      data: [
        { id: "other", max_context_length: 1 },
        { id: "qwen3", max_context_length: 32768, loaded_context_length: 8192 },
      ],
    };
    expect(parseLmStudioContext(json, "qwen3")).toEqual({
      maxContextLength: 32768,
      loadedContextLength: 8192,
    });
  });

  it("liefert null, wenn das Modell nicht in der Liste steht", () => {
    expect(parseLmStudioContext({ data: [{ id: "other" }] }, "qwen3")).toBeNull();
  });

  it("liefert null bei kaputtem data-Feld", () => {
    expect(parseLmStudioContext({ data: "nope" }, "qwen3")).toBeNull();
  });
});

describe("parseOllamaContext", () => {
  it("findet <arch>.context_length in model_info", () => {
    expect(parseOllamaContext({ model_info: { "llama.context_length": 4096 } })).toEqual({
      maxContextLength: 4096,
    });
  });

  it("liefert null ohne model_info", () => {
    expect(parseOllamaContext({})).toBeNull();
  });
});
```

- [ ] **Step 3: Test laufen lassen**

Run: `npx vitest run tests/model-context.test.ts`
Expected: PASS (das Modul existiert seit Task 1) — der Test dokumentiert den Vertrag.

- [ ] **Step 4: `fetchModelContext` in `http.ts`**

```ts
/** Kontextlänge des Modells von einem LM-Studio-Server (GET /api/v0/models).
 *  Liefert null, wenn der Server den Endpunkt nicht kennt (Ollama/MLX/vLLM) oder das Modell
 *  fehlt — die Anzeige entfällt dann stillschweigend, kein Fehler. */
export async function fetchModelContext(baseUrl: string, model: string): Promise<ModelContext | null> {
  try {
    const r = await httpGet(`${baseUrl}/api/v0/models`);
    if (r.status !== 200) return null;
    return parseLmStudioContext(r.json, model);
  } catch {
    return null;
  }
}
```

mit `import { parseLmStudioContext, type ModelContext } from "../vendor/kit/model-context";`

- [ ] **Step 5: Kontextlänge am Modell-Feld anzeigen**

Im `listModels().then(...)`-Zweig von `llm-section.ts`, nachdem `llm.model` aufgelöst ist:

```ts
        void fetchModelContext(normalizeEndpoint(primary), llm.model).then((cx) => {
          const len = cx?.loadedContextLength ?? cx?.maxContextLength;
          if (len) modelSetting.setDesc(t("set.llmContext", len.toLocaleString()));
        });
```

- [ ] **Step 6: Thinking-Toggle mit Always-on-Erkennung**

Den bestehenden `set.llmThinking`-Block ersetzen:

```ts
  // Always-on-Reasoner (R1 & Co.) ignorieren Suppress — der Toggle zeigte hier bisher
  // faelschlich "aus" an. Toggle deaktivieren und den Grund benennen.
  const always = isAlwaysOnThinker(llm.model);
  new Setting(containerEl)
    .setName(t("set.llmThinking"))
    .setDesc(always ? t("set.llmThinkingAlways") : t("set.llmThinkingDesc"))
    .addToggle((tg) =>
      tg
        .setValue(always ? true : llm.requestThinking)
        .setDisabled(always)
        .onChange(async (v) => {
          llm.requestThinking = v;
          await ctx.host.saveSettings();
        }),
    );
```

mit `import { isAlwaysOnThinker } from "../../vendor/kit/reasoning";`

- [ ] **Step 7: Gate + Commit**

```bash
npm run gate
git add src/obsidian src/i18n/strings.ts tests/model-context.test.ts
git commit -m "feat(settings): Kontextlaenge am Modell-Feld + Always-on-Thinker-Erkennung

isAlwaysOnThinker war vendored, aber ungenutzt: bei R1 & Co. zeigte der
Thinking-Toggle 'aus', obwohl Suppress dort nichts bewirkt. Kontextlaenge via
model-context (LM Studio /api/v0/models); faellt still weg, wenn der Server
den Endpunkt nicht kennt."
```

---

### Task 8: Verbindungstest für die Bild-Sektion

Die Bild-Sektion hat heute **gar keinen** Test. `probeEndpoint` prüft `/v1/models` und ist damit
LLM-spezifisch — ein A1111-/Draw-Things-Server antwortet dort nicht.

**Files:**
- Modify: `src/obsidian/http.ts`
- Modify: `src/obsidian/settings/image-section.ts`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `classifyEndpointStatus`, `statusKindKey` (Task 2)
- Produces: `probeImageEndpoint(baseUrl: string, timeoutMs?: number) → Promise<EndpointStatus>`

- [ ] **Step 1: i18n-Keys**

`en`: `"set.imgTest": "Test connection",` · `de`: `"set.imgTest": "Verbindung prüfen",`

- [ ] **Step 2: `probeImageEndpoint` in `http.ts`**

```ts
/** Erreichbarkeits-Probe für einen A1111-/Draw-Things-kompatiblen Bild-Server
 *  (GET <base>/sdapi/v1/options — der Standard-Statusendpunkt dieser API). Eigener Timeout via
 *  Promise.race, weil requestUrl weder timeout noch Abort kennt.
 *  Hinweis: `not-an-llm-api` ist hier die generische „antwortet, passt aber nicht"-Klasse —
 *  classifyEndpointStatus prüft auf die OpenAI-Modell-Listenform, die ein Bild-Server nicht hat.
 *  Deshalb wird ein 200 hier direkt als ok gewertet und nur der Fehlerpfad klassifiziert. */
export async function probeImageEndpoint(baseUrl: string, timeoutMs = 5000): Promise<EndpointStatus> {
  const url = `${baseUrl}/sdapi/v1/options`;
  let timer: number | undefined;
  const timeout = new Promise<"__timeout__">((resolve) => {
    timer = window.setTimeout(() => resolve("__timeout__"), timeoutMs);
  });
  try {
    const raced = await Promise.race([
      requestUrl({ url, throw: false }).then((r) => r.status),
      timeout,
    ]);
    if (raced === "__timeout__") return classifyEndpointStatus({ kind: "timeout" });
    if (raced === 200) return { reachable: true, kind: "ok", klartext: "" };
    return classifyEndpointStatus({ kind: "response", status: raced, body: undefined });
  } catch (e) {
    const message = String((e as { message?: string })?.message ?? e);
    return classifyEndpointStatus({ kind: "error", message });
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
```

- [ ] **Step 3: Test-Button + Status-Indikator in `image-section.ts`**

Die Endpoint-Zeile bekommt Status-Span und Button (Single-Endpoint → **kein** Zeilen-Editor, und
**keine** Presets: `ENDPOINT_PRESETS` sind LM Studio/Ollama, also LLM-Server — für Draw Things
`:7860` schlicht falsch. Bild-Presets gehören in den ComfyUI-Spec):

```ts
  const epSetting = new Setting(containerEl)
    .setName(t("set.imgEndpoint"))
    .setDesc(t("set.imgEndpointDesc"));

  const statusEl = epSetting.settingEl.createSpan({ cls: "yijing-ep-status" });

  epSetting
    .addText((txt) =>
      txt
        .setPlaceholder("http://127.0.0.1:7860")
        .setValue(img.endpoint)
        .onChange(async (v) => {
          img.endpoint = v.trim();
          await ctx.host.saveSettings();
        }),
    )
    .addButton((b) =>
      b.setButtonText(t("set.imgTest")).onClick(async () => {
        if (!img.endpoint) return;
        statusEl.removeClass("is-ok", "is-error");
        statusEl.addClass("is-checking");
        setIcon(statusEl, "loader");
        const status = await probeImageEndpoint(normalizeEndpoint(img.endpoint));
        statusEl.removeClass("is-checking");
        setIcon(statusEl, status.reachable ? "circle-check" : "circle-x");
        statusEl.addClass(status.reachable ? "is-ok" : "is-error");
        statusEl.setAttribute("aria-label", t(statusKindKey(status.kind)));
      }),
    );
```

- [ ] **Step 4: Gate + Commit**

```bash
npm run gate
git add src/obsidian src/i18n/strings.ts
git commit -m "feat(settings): Verbindungstest fuer die Bild-Sektion

Die Bild-Sektion hatte gar keinen Test. Eigene Probe gegen
/sdapi/v1/options (A1111/Draw-Things-Standard) — probeEndpoint prueft
/v1/models und ist LLM-spezifisch. Keine Presets: ENDPOINT_PRESETS sind
LLM-Server, fuer :7860 falsch."
```

---

### Task 9: Verifikation + Doku

**Files:**
- Modify: `docs/image-generation.md` (falls der Settings-Pfad dort beschrieben ist)
- Modify: `/Users/Shared/code/obsidian-plugins/REGISTRY.md`

- [ ] **Step 1: Volles Gate**

Run: `npm run gate`
Expected: alles grün, Testzahl ≥ 151 (131 vorher + 12 Editor-Modell + 8 Migration + 5 Kontext).

- [ ] **Step 2: Ins Smoke-Vault deployen**

```bash
OBSIDIAN_PLUGIN_DIR="/Users/Shared/10_ObsidianVaults/10_Pallas/.obsidian/plugins/yijing-oracle" npm run deploy
```

- [ ] **Step 3: GUI-Smoke — Pflicht, nicht optional**

Begründung aus der Repo-Historie: der `effectiveModel`-Bug wurde von den Unit-Tests **nicht**
gefangen, sondern vom Smoke (REGISTRY-Gotcha „Dropdown-Default MUSS persistiert werden").

Abzuhaken:
- [ ] Sektionen klappen auf/zu; „Allgemein" ist beim ersten Öffnen offen, der Rest zu.
- [ ] Zustand überlebt das Schließen und Neuöffnen der Settings.
- [ ] Endpunkt-Zeile hinzufügen (Adder) · ändern · per Trash löschen.
- [ ] Preset-Klick trägt LM Studio ein; zweiter Klick dupliziert nicht.
- [ ] Status-Icons erscheinen nach der Probe; erreichbarer Endpunkt wird als aktiv markiert.
- [ ] `0.0.0.0` als Endpunkt → Warn-Icon mit Tooltip.
- [ ] Modell-Dropdown füllt sich; Kontextlänge erscheint (LM Studio) bzw. entfällt still (Ollama).
- [ ] Bild-Endpunkt „Verbindung prüfen" → grün bei laufendem Draw Things, rot bei gestopptem.
- [ ] **Migration:** eine Bestands-`data.json` mit `"endpoints": "http://localhost:1234"` (String!)
      und `"activeEndpoint"` öffnen → Liste zeigt den Endpunkt, keine Fehlermeldung, nach dem
      Speichern ist `activeEndpoint` verschwunden.
- [ ] Ein echter Wurf mit KI-Deutung läuft weiterhin durch (Regression).

- [ ] **Step 4: REGISTRY-Nachträge im Dach-Repo**

In `/Users/Shared/code/obsidian-plugins/REGISTRY.md`:
- Zeilen-Editor-Zeile: yijing als 2. Exemplar des crews-Schnitts ergänzen; „n=3 byte-nah" auf den
  differenzierten Befund korrigieren (vault-rag/image-to-markdown sind Copy-Paste voneinander,
  vault-crews ist ein eigener Schnitt) und die neun Generalisierungsfragen als Vorbedingung der
  Kit-Extraktion notieren.
- `collapsible`-Zeile: yijing als 2. Consumer eintragen, inkl. des `check:pure`-Randes
  (obsidian-gekoppelte Kit-Module brauchen eine eigene Vendor-Ablage `src/vendor/kit-obsidian/`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: REGISTRY-Nachtraege Settings-UI + Smoke abgeschlossen"
```
