# Yijing Oracle — Obsidian-Plugin (v1-Design)

**Datum:** 2026-07-12 · **Status:** ratifiziert (Brainstorming abgeschlossen) · **Autor:** Johannes Kaindl (+ Claude)

## 1. Kontext & Zielbild

Das Plugin bringt das I-Ching-/Yijing-Orakel aus dem bestehenden Web-Projekt
(`/Users/Shared/code/yijing` — Vanilla-JS-Static-Site + native Apps) **nativ nach
Obsidian**. Der eigentliche Mehrwert gegenüber der Web-App: **Befragungen werden
Vault-Notes statt localStorage** — durchsuchbar, verlinkbar, Teil des Denkens.

Es ist **kein Port** der Web-App (native Apps, PWA, Service Worker, Widgets bleiben
draußen), sondern eine **fokussierte Neu-Implementierung des Orakel-Kerns** —
Ansatz A aus dem Brainstorming (eigenständiges Plugin, Kit vendored, Kern nach TS
portiert).

### Lizenz
Johannes Kaindl ist alleiniger Copyright-Holder. Code: **AGPL-3.0-or-later**
(für ein Open-Source-Community-Plugin passend). Wilhelm-Übersetzung in den Daten:
Public Domain. Kein Lizenz-Blocker.

## 2. Scope

### v1 (dieses Design)
- **Sidebar-Hub-View** als Orakel-Konsole: Wurf-Ritual · aktuelles Reading · History-Liste.
- **Drei-Münzen-Wurf** + wandelnde Linien + King-Wen-Lookup (Port aus OracleKit).
- **Reading wird Vault-Note** — neue Note im konfigurierten Ordner **oder** an Cursor
  einfügen (per Setting wählbar; zwei Commands über geteilter Render-Funktion).
- **Zweisprachig DE + EN** (beide Daten-JSONs gebundelt; UI-Strings via vendored
  Kit-i18n). Sprache folgt Obsidian-Locale oder Setting.
- **Register** classic (Wilhelm) / neutral (geschlechtsneutrale Overrides `_neutral`).

### Bewusst draußen (YAGNI → v2)
Kein Tageshexagramm (`daily.ts`), keine LLM-Deutung, kein Trigramm-Explorer,
kein Release-Mirror-Wiring (kommt, sobald Codeberg/GitHub-Remotes existieren).

## 3. Architektur

Geschichtet nach Nachbar-Muster (vault-crews): **pure core** (kein `obsidian`-Import,
per `check:pure`-Gate erzwungen) unter dem **obsidian-Layer** (I/O, Views).

```
yijing-oracle/
  manifest.json · package.json (0 runtime-deps) · esbuild.config.mjs
  tsconfig.json / tsconfig.test.json · eslint.config.mjs · styles.css
  src/
    main.ts                 Plugin-Entry: registerI18n+setLang ZUERST, dann View + Commands + Ribbon + SettingsTab
    core/                   ── PURE (check:pure) ──
      casting.ts            lineState · tossLine · cast · binary · kingWen + binaryToKingWen  (RNG injizierbar)
      reading.ts            buildReading(lines) → { lines, primaryNumber, resultingNumber|null, changingPositions[] }
      data.ts               getHexagram(number, lang) über gebundelte JSON; Typen HexagramData
      render.ts             renderReading(reading, opts{lang,register,question,date}) → { frontmatter, markdown, title }
    data/                   gebundelt: hexagrams.json · hexagrams.en.json · trigrams.json
    i18n/strings.ts         registerI18n() → defineStrings DE/EN (vendored Kit)
    vendor/kit/i18n.ts      vendored obsidian-kit pure-i18n (v2: +sse/endpoint/reasoning)
    obsidian/               ── IMPUR (importiert 'obsidian') ──
      view.ts               OracleView extends ItemView (VIEW_TYPE_YIJING): Ritual · aktuelles Reading · History
      reading-writer.ts     writeReading(): neue Note (Ordner+Filename-Template) | insertAtCursor
      settings.ts           DEFAULT_SETTINGS, SettingsTab, mergeSettings
  tests/                    vitest: casting-parity · reading · render
```

### Toolchain (byte-nah zu den 5 aktiven Plugins)
- **esbuild** → `main.js` (external: obsidian, electron, node:*; cjs; es2022).
- **vitest** (pure-core-Tests brauchen keinen Obsidian-Mock; obsidian-Layer via
  `obsidian-kit/testing createObsidianMock` falls nötig).
- **eslint-plugin-obsidianmd** (type-checked).
- `gate` = `lint + typecheck + typecheck:test + test + check:pure + check:bundle`.
- Zero Runtime-Deps (`dependencies: []`), obsidian als devDep.

### Daten-Bundling (Design-Entscheidung)
Die Daten-JSONs werden **in `main.js` gebundelt** (esbuild JSON-Import), nicht als
Sidecar-Assets geladen. → ein einziges `main.js`, keine Adapter-Pfade, kein
Extra-Release-Wiring, sofort offline. Kosten: `main.js` ~1–1,5 MB (fast nur
Wilhelm-Text) — für ein Obsidian-Plugin normal. Später auf Sidecar umstellbar,
falls Größe stört. `resolveJsonModule` in tsconfig aktivieren.

## 4. Komponenten & Interfaces

| Unit | Signatur (Kern) | Abhängt von | Test |
|---|---|---|---|
| `casting.ts` | `cast(rng?) → Line[6]` · `binary(lines, useTarget) → string` · `kingWen(binary) → number\|null` | — | seedbare Unit-Tests + **Parity-Gate** |
| `reading.ts` | `buildReading(lines) → Reading` | casting | Unit |
| `data.ts` | `getHexagram(n, lang) → HexagramData` | data-JSON | Unit |
| `render.ts` | `renderReading(reading, opts) → RenderedReading` | reading, data | String-Snapshot |
| `strings.ts` | `registerI18n()` | vendor/kit i18n | — |
| `view.ts` | `OracleView extends ItemView` | core + writer | GUI-Smoke |
| `reading-writer.ts` | `writeReading(app, rendered, mode, settings)` | obsidian, render | GUI-Smoke |
| `settings.ts` | `DEFAULT_SETTINGS`, `SettingsTab` | obsidian, kit | — |

**Kernprinzip:** `render.ts` ist rein — nimmt Daten, gibt Markdown-String, berührt nie
eine Datei. Der `reading-writer` entscheidet nur *wohin*. Damit ist die gesamte
Orakel-Logik ohne Obsidian testbar.

### Casting-Mechanik (Port aus `OracleKit/Casting.swift`, 1:1)
- `lineState(value)`: yang = (7|9), changing = (6|9), target-Bit (changing flippt).
- `tossLine`: 3 Münzen (je 0/1) → value 6..9 (Verteilung 1:3:3:1).
- `cast()`: 6 Linien, Index 0 = **unterste** Linie (bottom-up, wie Web-App).
- `binary(lines, useTarget)`: Primär (`false`) oder Resultat (`true`).
- `binaryToKingWen`: die 64-Einträge-Tabelle (verbatim übernommen).

> **Vierte kanonische King-Wen-Kopie.** Web (`app.js`), Build (`build_data.py`),
> OracleKit (`Casting.swift`) — das Plugin wird die vierte. Bewusst dupliziert, mit
> **eigenem Parity-Gate** (vitest, spiegelt `scripts/test-kingwen.mjs`): prüft, dass
> jedes `binary` in `hexagrams.json` über `kingWen()` auf sein `number` mappt (64/64).

## 5. Reading-Note-Format

```markdown
---
yijing_reading: true
date: 2026-07-12T14:23
question: "Nach dem Umzug …"       # leer wenn keine Frage
hexagram: 51
changing_lines: [2, 5]              # 1-basiert von unten; [] wenn keine
resulting: 21                       # weggelassen wenn keine wandelnden Linien
language: de
register: classic                  # classic | neutral
---
# ䷲ 51 · Die Erregung (Das Schütteln)
> **Frage:** Nach dem Umzug …   ·   wandelnde Linien: 2, 5

## Das Urteil
<judgment | judgment_neutral>

## Das Bild
<image | image_neutral>

## Die Wandlungen (Linien 2, 5)
**Sechs auf zweitem Platz bedeutet:** <lines[1].text>
**Neun auf fünftem Platz bedeutet:** <lines[4].text>

## Wird zu → ䷔ 21 · Das Durchbeißen
<Urteil des Resultat-Hexagramms>
```

Regeln:
- Wandelnde-Linien-Texte gehören zum **Primär**-Hexagramm (`lines[position-1].text`).
- Resultat-Block **nur bei ≥1 wandelnder Linie**.
- Ohne wandelnde Linien: nur Urteil + Bild + Bedeutung, kein Resultat.
- Register `neutral` nutzt `*_neutral`-Varianten; Felder ohne neutral-Variante
  (z.B. `lines`) fallen auf die Basis zurück.
- Überschriften/Labels (`Das Urteil`, `Wird zu`, „Sechs auf … Platz") sind i18n-Strings.
- Titel/Dateiname-Template: `{date}-{question-slug}` bzw. `{date}-hex{n}` ohne Frage
  (konfigurierbar; unsichere Zeichen entfernt; Kollision → ` (2)`-Suffix).

## 6. Datenfluss

```
[View: Frage eingeben, „Münzen werfen"]
      │  cast(rng)
      ▼
Line[6]  ──buildReading──►  Reading{ primaryNumber, resultingNumber?, changingPositions }
      │                          │ getHexagram(n, lang)
      │                          ▼
      │                    HexagramData (primär + ggf. resultat)
      │  renderReading(reading, {lang, register, question, date})
      ▼
RenderedReading{ title, frontmatter, markdown }
      │  writeReading(mode)
      ├── mode=note   → neue TFile im Reading-Ordner
      └── mode=cursor → editor.replaceSelection an aktiver Note
      ▼
View aktualisiert: „aktuelles Reading"-Pane + History-Liste
      (History = Notes mit frontmatter yijing_reading:true im Reading-Ordner via metadataCache;
       Cursor-Readings erscheinen bewusst NICHT in der History)
```

## 7. Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| `kingWen(binary)` liefert `null` | darf bei validem 6-bit-Binary nie passieren → Invariante; Parity-Gate deckt es ab. Zur Laufzeit defensiv: Notice + Abbruch. |
| Hexagramm-Nummer nicht in Daten | `getHexagram` wirft; View fängt → Notice „Daten beschädigt". |
| `mode=cursor`, kein aktiver Editor | Notice „Keine aktive Note — als neue Note gespeichert" + Fallback auf `note`. |
| Reading-Ordner fehlt | bei erstem Schreiben anlegen (`vault.createFolder`, `adapter.exists`-Guard). |
| Dateiname-Kollision | ` (2)`, ` (3)` … Suffix. |
| Sprache/Register unbekannt | Fallback lang→en, register→classic. |
| leere Frage | `question`-Frontmatter leer, Titel nutzt `hex{n}`-Template. |

## 8. Tests / Verifikation

1. **Parity-Gate (vitest):** `kingWen(h.binary) === h.number` für alle 64 (spiegelt
   `test-kingwen.mjs`); zusätzlich Tabellen-Vollständigkeit (64 unique Einträge).
2. **casting-Unit:** `lineState` für 6/7/8/9; `tossLine` Verteilung mit Seed-RNG;
   `binary` primär vs. target an bekanntem Beispiel.
3. **reading-Unit:** wandelnde Positionen korrekt; Resultat nur bei changing lines.
4. **render-Snapshot:** je ein Fall (mit/ohne wandelnde Linien, classic/neutral,
   de/en) → erwarteter Markdown-String.
5. **Gate:** `lint + typecheck + typecheck:test + test + check:pure + check:bundle`.
6. **GUI-Smoke:** als **user-handover** an Jay (Plugin in echtem Vault laden, werfen,
   beide Ausgabe-Modi, Sprachumschaltung). Farb-/Render-Prüfung mache **ich** selbst
   (Render + visuelle Analyse), keine Farbfragen an Jay.

## 9. Repo-Setup

- yijing-oracle ist ein **eigenes Git-Repo** (`git init` erledigt; im Parent
  `obsidian-plugins/.gitignore` eingetragen — PROF-OBS-09, kein Monorepo).
- Nach v1: **REGISTRY-Eintrag** prüfen (Casting/King-Wen-Port, Reading-Render als
  wiederverwendbares Muster?), ggf. `§Inbox`.
