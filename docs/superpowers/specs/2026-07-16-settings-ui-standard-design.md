# Settings-UI auf Dach-Standard — Design

**Datum:** 2026-07-16 · **Status:** validiert (Brainstorming mit Jay) · **Nachfolger:** Implementierungsplan

## Zweck

Der Settings-Tab ist über drei Feature-Bögen (v1, v2-LLM-Deutung, Bildmeditation) gewachsen und
nie überarbeitet worden: 447 Zeilen in einer Klasse, alle Sektionen flach untereinander, die
KI-Endpunkte als rohe Textarea. Mehrere Bausteine, die der Dach-`UI-STANDARD.md` §8 als
**verbindlich zu übernehmen** führt, fehlen — und drei Kit-Module, die bereits vendored sind,
werden gar nicht benutzt (`validateEndpointInput`, `ENDPOINT_PRESETS`, `isAlwaysOnThinker`).

Dieses Vorhaben hebt die Settings auf den Dach-Standard: einklappbare Sektionen wie in
`vault-rag`, und ein KI-Bereich mit den Quality-of-Life-Features aus dem Kit.

**Nicht Teil dieses Vorhabens** (bewusst abgegrenzt):
- **ComfyUI-Adapter** als zweites ImageBackend — eigener Faden, eigener Spec. Er setzt sich
  danach in die dann bereits aufgeräumte Bild-Sektion.
- **Kit-Extraktion** des Zeilen-Editors — siehe „Verworfene Alternativen".
- **Sweep über die Nachbar-Repos** — Migration bleibt opportunistisch (`UI-STANDARD.md` Vorspann).

## Ausgangslage (verifiziert)

| Bereich | Ist |
|---|---|
| Sektionen | flach via `setHeading()`; kein Collapsible |
| KI-Endpunkte | Textarea (eine URL/Zeile) + separates „Aktiver Endpunkt"-Dropdown; **ein** Test-Button → `Notice` |
| Bild-Endpunkt | reines Textfeld — **kein** Verbindungstest |
| Modell-Feld | Dropdown + Freitext-Fallback + „Modelle laden" — entspricht dem Muster bereits |
| `showNotes` | steht unter „Frontmatter", gehört inhaltlich nicht dorthin |
| Kit vendored, ungenutzt | `validateEndpointInput`, `ENDPOINT_PRESETS`, `isAlwaysOnThinker` |
| Kit nicht vendored | `collapsible` (@0.13.0), `model-context` (@0.7.0) |

## Architektur

Drei Schichten. Der Kern der Änderung ist der Schnitt, den `src/obsidian/settings.ts` heute nicht hat:
Entscheidungslogik wandert in pure, getestete Module; die Render-Schicht wird dünn.

### 1. Pure Kern — kein `obsidian`-Import, `check:pure`-gated, TDD

**`src/core/settings/endpoint-editor-model.ts`** — portiert nach dem `vault-crews`-Schnitt
(`vault-crews/src/obsidian/endpoint-editor-model.ts`):

- `applyEndpointEdit(list, index, value) → string[]` — Zeile ändern / bei leerem Wert löschen /
  Add-Zeile anhängen.
- `activeIndexFromStatuses(statuses) → number` — erster erreichbarer gewinnt; `-1` wenn keiner
  erreichbar ist (`findIndex`-Semantik). `null` **in** der Eingabeliste heißt „noch nicht geprobt".
- `statusKindKey(kind) → string` / `warnRuleKey(rule) → string` — Status bzw. Warn-Regel auf einen
  i18n-Key abbilden. `t()` selbst bleibt in der Render-Schicht (die Key-Ableitung ist pure).

**Nicht portiert:** `modelFieldMode` aus crews — es ignoriert seinen `saved`-Parameter vollständig
und ist dort toter Code. Eine Leiche wird nicht mitkopiert.

**`src/core/settings/migrate.ts`** — `migrateEndpointList(raw: string | string[] | undefined) → string[]`,
im Geist von `vault-rag/src/settings_core.ts:8`, aber an die hiesige Ausgangslage angepasst: yijing
migriert **einen Textarea-String** zur Liste (vault-rag migrierte ein Single-Endpoint-Feld), deshalb
ein Union-Parameter statt zweier. Ist `raw` bereits ein Array, gewinnt es (leerzeilen-gefiltert);
ist es ein String, wird er über `parseEndpointList` zeilenweise geparst; `undefined` → `[]`.

**`src/core/settings.ts`** — `PluginSettings`, `DEFAULT_SETTINGS`, `resolveReadingLang` ziehen aus
`src/obsidian/settings.ts` hierher. Sie importieren nichts von `obsidian` und liegen heute nur aus
Gewohnheit in der obsidian-Schicht. `src/obsidian/settings/index.ts` re-exportiert sie, damit die
bestehenden Import-Pfade in `main.ts`/`view.ts` nicht brechen.

### 2. Vendored Kit

Neu zu vendoren:
- `collapsible.ts` @0.13.0 — `collapsibleSection`/`resolveCollapsed`/`CollapsibleStorage`, inkl.
  a11y (`role="button"`, `tabindex`, `aria-expanded`, Enter/Leertaste, `:focus-visible`).
  `COLLAPSIBLE_CSS` wandert nach `styles.css` (das Kit injiziert bewusst kein CSS).
- `model-context.ts` @0.7.0 — `parseLmStudioContext`/`parseOllamaContext`.

**Gate-Rand (wichtig):** `check:pure` prüft heute `src/core src/vendor` rekursiv — `collapsible.ts`
importiert aber `setIcon` aus `obsidian` und würde das Gate brechen. Das Kit trennt intern
`src/pure/` von `src/obsidian/`; die Vendor-Ablage spiegelt diese Trennung:

- `src/vendor/kit/` — bleibt ausschließlich für pure Module.
- `src/vendor/kit-obsidian/collapsible.ts` — obsidian-gekoppelte Kit-Module.
- `check:pure` prüft entsprechend `src/core src/vendor/kit` (statt `src/vendor` pauschal).

Die Header-Zeile `// vendored from obsidian-kit#<version>, <pfad>` folgt der bestehenden Konvention.

### 3. Obsidian-Schicht

`src/obsidian/settings.ts` (447 Zeilen) wird zum Verzeichnis `src/obsidian/settings/`:

| Datei | Inhalt |
|---|---|
| `index.ts` | `SettingsTab`, Sektionsgerüst, `CollapsibleStorage`-Verdrahtung, Re-Exporte |
| `endpoint-list.ts` | Zeilen-Editor-Render (von beiden Sektionen genutzt) |
| `llm-section.ts` | KI-Deutung |
| `image-section.ts` | Bildmeditation |
| `note-section.ts` | Notiz & Ablage + Notiz-Inhalt (Frontmatter, Fußnoten, Callouts) |

Jede Datei dünn: `createEl`-Aufrufe, kein Entscheidungscode.

## Sektions-Zuschnitt

Fünf Sektionen; `Allgemein` startet offen, der Rest eingeklappt (wie `vault-rag` es mit
„Live-Embedding" macht). Der Auf-/Zu-Zustand wird persistiert.

```
▼ Allgemein            Reading-Sprache · Register · Ausgabe
▶ Notiz & Ablage       Ordner · Dateiname-Schema · Nach Erstellen öffnen
▶ Notiz-Inhalt         Frontmatter (Master + Feldzeilen) · Wilhelms Fußnoten · Callouts
▶ KI-Deutung           Endpunkte · Modell · Kontextlänge · Prompts · Thinking
▶ Bildmeditation       Endpunkt (+ Test) · Stil · Negativ-Prompt · Größe
```

`showNotes` wandert von „Frontmatter" nach „Notiz-Inhalt".

**Persistenz:** neues Feld `uiCollapsed: Record<string, boolean>` in `PluginSettings`, verdrahtet
über den `CollapsibleStorage`-Callback (`getCollapsed`/`setCollapsed` → `settings.uiCollapsed`,
danach `saveSettings()`). Sektions-Keys sind stabil: `general`, `note-storage`, `note-content`,
`llm`, `image`.

## Datenmodell + Migration

`LlmSettings` ändert sich:

```ts
endpoints: string    →  endpoints: string[]     // Liste statt Textarea-Text
activeEndpoint: string  →  (entfällt)
```

**Aktiv-Semantik:** „aktiv" ist künftig **abgeleitet** — der erste erreichbare Endpunkt aus der
geordneten Liste gewinnt (Kit-`resolveActiveEndpoint`, bisher in yijing ungenutzt). Die Reihenfolge
der Zeilen ist damit die Priorität; der Nutzer sortiert um, statt auszuwählen. Das ist die Semantik
aller drei Referenz-Exemplare und deckt den Netzwechsel ab (localhost am Host vs. LAN-IP unterwegs)
ohne Umkonfiguration.

**Migration:** `mergeSettings` ist shallow, deshalb füllt `main.ts:39` das `llm`-Objekt bereits
separat gegen die Defaults auf. Genau dort hängt sich die Migration ein:

```ts
this.settings.llm = { ...DEFAULT_LLM_SETTINGS, ...(this.settings.llm ?? {}) };
// Nach dem Spread ist endpoints entweder noch der alte Textarea-String (Bestands-data.json)
// oder bereits string[] — migrateEndpointList nimmt beides und liefert immer string[].
this.settings.llm.endpoints = migrateEndpointList(this.settings.llm.endpoints);
```

Der alte `endpoints`-String wird zeilenweise zur Liste. Bestehende `data.json` überleben lautlos,
ohne Nutzeraktion. `DEFAULT_LLM_SETTINGS.endpoints` wird `["http://localhost:1234"]`.

**`activeEndpoint` verschwindet nicht von selbst** (verifiziert gegen die echte `data.json` im
`yijing-oracle-smoke`-Vault): `mergeSettings` erhält unbekannte raw-Felder bewusst
(Forward-Compat), und der `{...DEFAULT_LLM_SETTINGS, ...raw.llm}`-Spread zieht sie mit. Das Feld
überlebt die Migration also und würde bei jedem `saveData` als Leiche zurückgeschrieben — vom
TS-Typ ungesehen. Deshalb entfernt `stripLegacyLlmFields(llm)` es explizit.

## KI-Sektion — Verhalten im Detail

**Zeilen-Editor** (`UI-STANDARD.md` §8, Kanon-Regel wörtlich befolgt):
- Add-Leerzeile am Ende (`[...list, ""]`).
- Listen-Mutation **nur bei `blur`**, nie in `onChange` — sonst wird jeder Tastendruck-Zwischenstand
  (`h`, `ht`, `htt`, …) gespeichert. No-Op-Guard vor dem Re-Render.
- Trash pro Zeile via `addExtraButton("trash-2")` mit Tooltip.
- Provider-Presets (`ENDPOINT_PRESETS`: LM Studio `:1234`, Ollama `:11434`) als Ein-Klick-Buttons.
- `validateEndpointInput`-Warnungen inline pro Zeile (nicht auf der Add-Zeile).

**Status-Indikator pro Zeile** (`UI-STANDARD.md` §8, n≥3 → verbindlich): Zustand über **Form UND
Farbe UND** `is-ok`/`is-error`/`is-checking`-Klasse **UND** `aria-label` — Farbe nie allein
(WCAG 1.4.1). Feste Icon-Vokabel: `loader` / `circle-check` / `circle-x` / `alert-triangle`.
Der aktive (= erste erreichbare) Endpunkt wird markiert. Das Status-Icon ist **kein** Lösch-Button.

**Modell-Feld:** bleibt wie es ist (Dropdown aus Server-Probe + Freitext-Fallback + „Modelle laden"),
ergänzt um die **Kontextlänge** des gewählten Modells via `parseLmStudioContext`/`parseOllamaContext`
als `setDesc`-Zeile. Ist keine Kontextlänge ermittelbar (Server liefert sie nicht), entfällt die
Anzeige stillschweigend — kein Fehler, kein Platzhalter.

Der bestehende `effectiveModel`-Guard bleibt unangetastet: ein vorausgewähltes Dropdown zeigt
`list[0]` an, **speichert** es aber nie (`onChange` feuert nur bei manueller Änderung). Der Wert wird
beim Populieren persistiert.

**Thinking-Toggle** mit `isAlwaysOnThinker`-Erkennung (vendored, bisher ungenutzt): Bei Modellen mit
Always-on-Reasoning (R1 & Co.) bewirkt Suppress nichts — der Toggle zeigt heute fälschlich „aus" an.
Künftig drei Zustände nach dem `image-to-markdown`-Muster (`thinkToggleView`): normal / suppress /
„Modell denkt immer" (Toggle deaktiviert + erklärende `setDesc`).

## Bild-Sektion

Bekommt denselben Verbindungstest wie die KI-Sektion (heute hat sie gar keinen) — Single-Endpoint,
also Test-Button + Status-Indikator, **kein** Zeilen-Editor und **keine** Presets: `ENDPOINT_PRESETS`
enthält LM Studio (`:1234`) und Ollama (`:11434`), also reine LLM-Server — für einen Bild-Backend-Port
(Draw Things `:7860`) sind sie schlicht falsch. Bild-Presets sinnvoll zu befüllen ist erst mit dem
zweiten Backend eine echte Frage und gehört damit in den ComfyUI-Spec. Die Probe geht gegen
`/sdapi/v1/txt2img`-Server; `probeEndpoint` in `src/obsidian/http.ts` prüft `/v1/models` und ist damit
LLM-spezifisch. Der Bild-Test braucht eine eigene, schmale Erreichbarkeits-Probe
(`GET <base>/sdapi/v1/options`, A1111/Draw-Things-Standard) → `classifyEndpointStatus` für die
Klartext-Diagnose. Alles Weitere (Stil, Negativ-Prompt, Größe) bleibt unverändert.

## Fehlerbehandlung

- Jede Probe hat einen eigenen Timeout via `Promise.race` — `requestUrl` kennt weder `timeout` noch
  Abort (bestehendes Muster in `http.ts`).
- Probe-Fehler werden nie geworfen, sondern über `classifyEndpointStatus` zu einer Klartext-`EndpointStatus`
  klassifiziert (refused / unknown-host / timeout / not-an-llm-api / Fallback) und als Status-Icon
  plus `aria-label` gezeigt — nicht als `Notice`-Fehlerwand.
- Leere Endpunkt-Liste ist ein legitimer Zustand (Feature per Default aus), kein Fehler.

## Testing

- Jeder pure Baustein per TDD, erst fehlschlagender Test: `applyEndpointEdit`,
  `activeIndexFromStatuses`, `statusKindKey`/`warnRuleKey`, `migrateEndpointList` (inkl. der
  Legacy-String-Fälle).
- Die Render-Schicht bleibt dünn genug, dass sie keinen DOM-Test braucht (`UI-STANDARD.md` §6).
- Gate bleibt grün: `lint`, `typecheck`, `typecheck:test`, `test` (131 Tests + neue),
  `check:pure` (Pfad angepasst), `check:bundle`.
- **GUI-Smoke im `yijing-oracle-smoke`-Vault ist Pflicht.** Begründung aus der eigenen Historie: der
  `effectiveModel`-Bug wurde von den Unit-Tests nicht gefangen, sondern vom Smoke (REGISTRY-Gotcha).
  Smoke-Punkte: Sektionen auf/zu + Zustand überlebt Tab-Neuöffnen · Zeile hinzufügen/löschen ·
  Preset-Klick · Status-Icons nach Probe · Warnung bei `0.0.0.0` · Modell-Dropdown + Kontextlänge ·
  Bild-Test-Button · bestehende `data.json` migriert lautlos.

## Verworfene Alternativen

**Kit-Extraktion des Zeilen-Editors jetzt.** Der Baustein ist als Kit-Kandidat mit „n=3 byte-nah"
geführt — eine Prüfung der drei Exemplare zeigt ein anderes Bild: `vault-rag` und
`image-to-markdown` sind Copy-Paste voneinander (identisch bis in die Kommentare), `vault-crews` ist
eine echte Neuschnittung mit anderer Kopplung, anderem Aktiv-Datenmodell und Feature-Flags. Eine
Extraktion bräuchte neun Generalisierungsentscheidungen (CSS-Präfix, i18n-Injektion,
Aktiv-Marker-Strategie, Post-Commit-Hook, Re-Render-Callback, Presets-Injektion, Validate-Injektion,
Placeholder, Span-Ziel `settingEl` vs. `controlEl`). Das ist ein eigenes Vorhaben, kein Nebenschritt
eines UI-Umbaus. yijing wird stattdessen das **zweite Exemplar des guten Schnitts** (crews) — die
spätere Extraktion steht damit auf zwei Referenz-Implementierungen statt auf Verdacht
(Lesson „dupliziert ≠ uniform ersetzbar": Abstraktion ohne Referenz-Implementierung zieht die
Grenzen falsch).

**vault-rag-Kopie übernehmen.** Wäre die vierte Copy-Paste-Kopie und erbt deren Schwachstelle: die
pure Logik (`applyEndpointEdit`) wird dort aus dem Modul exportiert, das `obsidian` importiert —
jeder Test zieht die DOM-Schicht mit. Unvereinbar mit dem `check:pure`-Gate dieses Repos.

**Explizites Aktiv-Dropdown behalten.** Kein Migrationsaufwand, aber yijing bliebe das einzige
Plugin mit abweichender Aktiv-Semantik und `resolveActiveEndpoint` bliebe ungenutzt. Der reale Preis
der Ableitung ist gering: laufen zwei Server parallel, entscheidet die Reihenfolge — Umsortieren
statt Auswählen.

**Grobere 3-Sektionen-Bündelung.** Weniger Klicks, aber KI- und Bild-Settings teilen sich dann eine
lange Sektion — der Zweck (die zwei großen Brocken per Default aus dem Weg) wäre verfehlt.

## Registry-Nachträge (nach Umsetzung)

- Zeilen-Editor: yijing als 2. Exemplar des crews-Schnitts eintragen; die Kit-Kandidat-Zeile von
  „n=3 byte-nah" auf den differenzierten Befund korrigieren (rag/i2m = Copy-Paste, crews = eigener
  Schnitt) und die neun Generalisierungsfragen als Vorbedingung notieren.
- `collapsible`: yijing als 2. Consumer (nach vault-rag) — inkl. des `check:pure`-Randes
  (obsidian-gekoppelte Kit-Module brauchen eine eigene Vendor-Ablage).
