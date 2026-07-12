# Note-Struktur, Zhu-Xi-Ruling-Hinweis & Panel-Kasten-Höhe — Design

**Datum:** 2026-07-12
**Branch:** `feat/v2-llm-deutung`
**Status:** Design (genehmigt), bereit für Implementierungsplan

## Kontext & Problem

Drei zusammenhängende Beobachtungen aus dem Smoke-Test:

1. **Panel-Kästen wachsen unbegrenzt.** Der Vorschau-Kasten (`.yijing-preview`)
   ist bereits mit `max-height: 44vh; overflow-y: auto` gedeckelt. Der
   **Deutungs-Kasten** (`.yijing-interpretation-body`) und der
   **Reasoning-Kasten** (`.yijing-reasoning-body`) sind es **nicht** — beim
   Streamen einer langen Deutung wächst der Inhalt über den unteren
   Bildschirmrand hinaus.

2. **Der klassische „maßgeblich"-Hinweis fehlt.** Die Web-App
   (`/Users/Shared/code/yijing`) besitzt in `web/ruling.js` die reine
   Zhu-Xi-Linienregel-Logik (`rulingText`) plus fertige DE/EN-Texte in
   `web/i18n.js` (`ruling.*`). Sie sagt je nach Anzahl wandelnder Linien, welcher
   Text maßgeblich ist (Ursprungs-Urteil / eine bestimmte Linie / Zielbild-Urteil
   …). Das Plugin hat davon nichts — der Leser weiß nicht, ob Zielbild oder eine
   wandelnde Linie zählt.

3. **Die Markdown-Struktur hat keinen roten Faden.** Aktuell:
   Titel → Meta/Frage-Zeile → [Deutungs-Anker] → `## Ursprungsbild` →
   `## Wandelnde Linien` (top-level) → `## Zielbild` → `## Anmerkungen`.
   Gewünscht ist ein klarer Lesefluss: Frage → Überblick über beide Hexagramme →
   Deutung → Ursprungsbild **mit** seinen wandelnden Linien → Zielbild →
   Anmerkungen.

## Nicht-Ziele (YAGNI)

- Keine neue Ruling-Logik erfinden — `web/ruling.js` wird 1:1 portiert
  (inkl. Parity-Test gegen die Web-Quelle als Referenz).
- Keine Änderung an Casting/Daten/Frontmatter.
- Keine Änderung am Endpoint-/Settings-Stack.

## Design

### Baustein 1 — `src/core/ruling.ts` (Port, pure)

Portiere `web/ruling.js` → `src/core/ruling.ts`:

- `rulingText({ primaryNumber, changingIndices }): RulingResult`
  mit `{ rule, lineIndices, decisiveIndex, source }` — byte-nah zur Web-Quelle
  (0-basierte Indizes, Index 0 = unterste Linie).
- `RULING_TEXT: Record<Lang, Record<RulingRule, string>>` — die acht Sätze aus
  `web/i18n.js` (`ruling.judgment-primary` … `ruling.special-qian-kun`), plus ein
  `label` je Sprache („Maßgeblich nach Tradition" / „Decisive by tradition").
- `rulingSentence(reading, lang): { label, text }` — Convenience: mappt Reading →
  fertiger Satz.

**Verortung & i18n:** `src/core/ruling.ts` liegt im pure-Kern (kein
`obsidian`-Import, `check:pure`-gated). Die Ruling-Texte hängen — wie schon die
Sektions-Labels in `render.ts` — an der **Sprache des Readings**, nicht an der
globalen UI-Sprache. Darum ein selbst-enthaltenes `RULING_TEXT`-Map im Modul
(gleiche Philosophie wie das lokale `LABELS`-Set in `render.ts`), keine Kopplung
an die UI-i18n.

**Reading-Adapter:** `render.ts`/Panel arbeiten mit `reading.changingPositions`
(1-basiert). `rulingText` erwartet 0-basierte `changingIndices` → der Aufrufer
konvertiert (`pos - 1`). `decisiveIndex` kommt 0-basiert zurück → für die
Linien-Markierung wieder `+1` rechnen.

### Baustein 2 — Panel-Kasten-Höhe (CSS)

In `styles.css`:

- `.yijing-interpretation-body { max-height: 44vh; overflow-y: auto; }`
  (gleicher Deckel wie `.yijing-preview`, damit die Kästen konsistent wirken).
- `.yijing-reasoning-body { max-height: 30vh; overflow-y: auto; }`
  (sekundärer Inhalt, etwas niedriger).

Rein additive CSS-Änderung, keine TS-Berührung. Beim Streamen scrollt der
Kasten intern statt die Seite zu schieben.

### Baustein 3 — Neue Note-Struktur (`render.ts`)

Neue Reihenfolge im `body` (und analog `previewBody`):

```
# ䷀ 1 · <Name>
> <Untertitel: nameLatin · nameChinese · pinyin>

> [!question] Frage            ← nur wenn Frage vorhanden
> <Frage>

## Überblick                   ← NEU, Callout-konfigurierbar (Option "overview")
> [!note] ䷀ Nr. N <Name>  →  ䷌ Nr. M <Zielname>
> **Wandelnde Linien:** a, b
> **Maßgeblich nach Tradition:** <Ruling-Satz>

<!-- yijing:deutung:start -->
   (## KI-Deutung … — vom Deutungs-Block eingesetzt; Anker steht HIER)
<!-- yijing:deutung:end -->

## Ursprungsbild — ䷀ Nr. N <Name>
   <Trigramm-Bullets>
### Das Urteil
### Das Bild
### Bedeutung                  ← wenn vorhanden
### Wandelnde Linien           ← NEU als Unterabschnitt (statt Top-Level)
#### <Linien-Position>
#### <Linien-Position> · maßgeblich   ← decisiveIndex-Markierung

## Zielbild — ䷌ Nr. M <Zielname>
   <Trigramm-Bullets>
### Das Urteil
### Das Bild

## Anmerkungen                 ← unverändert, am Ende
#### <Anchor-Label>

---
*Text: Richard Wilhelm — …*
```

Konkrete Änderungen an `render.ts`:

- **Frage** wandert aus der `>`-Meta-Zeile in einen eigenen
  `> [!question] Frage`-Callout direkt unter dem Untertitel (Callout-konfigurierbar
  über Option `question`; Fallback `**Frage:** …` wenn deaktiviert).
- **`## Überblick`** (neu): ein Callout (Option `overview`, Default an, Typ `note`)
  mit drei Zeilen — Hexagramm-Paar mit `→`-Pfeil (bei 0 wandelnden Linien nur das
  Ursprungshexagramm), wandelnde Linien, Ruling-Satz (`**<label>:** <text>`). Bei
  deaktiviertem Callout: `### Überblick` + schlichte Zeilen.
- **Deutungs-Anker** (`MARKER_START`/`MARKER_END`) wandert von „zwischen Kopf und
  Inhalt" auf **direkt nach dem Überblick-Block**. Voll von `render.ts` gesteuert
  (kein Verlass auf die „vor erstem `##`"-Heuristik von `insertInterpretation`).
- **Wandelnde Linien** werden zum Unterabschnitt des Ursprungsbilds: `## Wandelnde
  Linien` → `### Wandelnde Linien` unter `## Ursprungsbild`, die einzelnen Linien
  von `### <pos>` → `#### <pos>`. (Bei Callout-Wrapping analog: der Linien-Callout
  bleibt, nur die Gliederungs-Ebene verschiebt sich.)
- **Decisive-Markierung:** ist `source === "primary"` und die Linie an
  `decisiveIndex` eine der wandelnden Linien des Ursprungs (Fälle n=1, n=2→obere,
  n=6-Qian/Kun→Yong-Text), erhält deren Titel den Suffix `· <maßgeblich-Label>`.
  In den Fällen n=3/4/5/6-normal ist die maßgebliche Stelle keine Ursprungslinie
  (Zielbild-Urteil / ruhende Zielbild-Linie) → keine Linien-Markierung, der
  Überblick-Satz trägt die Aussage.
- **Hex-Kopf entschlacken:** die H2 `## Ursprungsbild — ䷀ Nr. N <Name>` trägt jetzt
  Figur + Nummer + Name; der bisher redundante fette Header in `hexInfoBlock`
  entfällt, der Block reduziert sich auf die Trigramm-Bullets.

### Baustein 4 — Ruling-Hinweis im Panel (`view.ts` + `styles.css`)

Analog zur Web-App (`els.changingWhy`): im Panel bei der Figur/`becomes`-Zeile
eine Zeile `<label>: <text>` einfügen (`.yijing-ruling`, `font-ui-small`,
`text-muted`). Nutzt `rulingSentence(reading, readingLang)` — dieselbe Quelle wie
die Note.

### Baustein 5 — Ruling-Hinweis im LLM-Prompt (frei)

`buildInterpretationMessages` schickt bereits `rendered.body.trim()` an das LLM.
Da der Ruling-Satz Teil des `## Überblick`-Blocks im `body` ist, bekommt die KI
ihn **automatisch** — kein separater Prompt-Umbau nötig. (Optional als eigene
Zeile im User-Prompt hervorhebbar; im ersten Schritt bewusst nicht, um DRY zu
bleiben.)

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/core/ruling.ts` | **neu** — Port von `web/ruling.js` + `RULING_TEXT` + `rulingSentence` |
| `src/core/render.ts` | Reihenfolge/Struktur, Frage-Callout, Überblick, Anker-Position, Linien-Ebene, decisive-Marker, hexInfoBlock entschlackt |
| `src/core/note-callouts.ts` | neue Callout-Optionen `overview`, `question` in `CalloutConfig`/`DEFAULT_CALLOUTS` |
| `src/obsidian/view.ts` | Ruling-Zeile im Panel |
| `styles.css` | max-height auf interpretation-/reasoning-body; `.yijing-ruling` |

`src/i18n/strings.ts` bleibt **unberührt** — sowohl Note als auch Panel beziehen
Label und Ruling-Satz aus `RULING_TEXT` in `core/ruling.ts` (an die Reading-Sprache
gebunden), nicht aus der UI-i18n.

## Datenfluss

```
Reading (changingPositions, primaryNumber, resultingNumber)
   │
   ├─ rulingText(1→0-basiert)  ──►  { rule, decisiveIndex, source }
   │        └─ RULING_TEXT[lang][rule]  ──►  Satz
   │
   ├─ render.ts  ──►  body (Überblick-Callout + decisive-Marker)  ──►  Note
   │                       └──►  buildInterpretationMessages  ──►  LLM-Prompt
   └─ view.ts    ──►  .yijing-ruling  ──►  Panel
```

## Fehlerbehandlung / Randfälle

- **0 wandelnde Linien:** Überblick zeigt nur das Ursprungshexagramm (kein
  `→`-Pfeil), Ruling-Satz „Keine wandelnde Linie — …". Kein `## Wandelnde Linien`,
  kein `## Zielbild` (wie bisher).
- **6 wandelnde Linien, Qian/Kun:** `special-qian-kun` → Yong-Text (7. Eintrag,
  Index 6) ist maßgeblich; Überblick + Linien-Markierung am Yong-Abschnitt.
- **6 wandelnde Linien, sonst:** `judgment-resulting` → Zielbild-Urteil maßgeblich;
  keine Ursprungslinien-Markierung.
- **Callout deaktiviert:** Überblick/Frage fallen auf schlichte Überschrift +
  Zeilen zurück (bestehendes `section()`-Muster).
- **Reading-Sprache ≠ UI-Sprache:** Ruling-Texte folgen der Reading-Sprache
  (konsistent mit `render.ts`-Labels).

## Testing

- **`src/core/ruling.test.ts`** (pure): alle acht `n`-Fälle → korrekte
  `rule`/`decisiveIndex`/`source`; Qian/Kun-Sonderfall; Parity-Tabelle als
  Referenz gegen `web/ruling.js` (gleiche Fälle, gleiche Ergebnisse).
- **`render.test.ts`** erweitern: neue Reihenfolge (Überblick vor Anker vor
  Ursprungsbild), Frage-Callout, wandelnde Linien als `####`-Unterabschnitt,
  decisive-Marker gesetzt/nicht gesetzt je Fall, 0-Linien- und 6-Linien-Fälle,
  Anker-Position stabil (Idempotenz von `insertInterpretation`).
- **Callout-Config:** `overview`/`question` an/aus → korrekte Fallbacks.
- Bestehende Snapshot-/Struktur-Tests anpassen.

## Verifikations-Gate

`npm run` Gate grün: `lint`, `typecheck`, `test`, `check:pure` (ruling.ts darf kein
`obsidian` importieren), `check:bundle`. Danach Smoke im `yijing-oracle-smoke`-Vault:
Wurf mit 1, 2, 4 und 6 wandelnden Linien → Struktur + Ruling-Hinweis + gedeckelte
Kästen visuell prüfen.
