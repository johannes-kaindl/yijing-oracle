# Notiz-Layout: App-Parität + konfigurierbare Callouts (Spec)

**Datum:** 2026-07-12
**Status:** Design abgenommen (Jay), Umsetzung autonom
**Vorgänger:** v2 LLM-Deutung. Löst den geparkten „Callout-Wrapping / Note-Restruktur"-Folge-Schritt ein.

## Ziel

Die gespeicherte Reading-Note soll dem **App-Export** entsprechen (Referenz:
`~/Downloads/yijing-2026-07-08-183122-dschun-y.png` + Jays Mockups im Smoke-Vault):
KI-Deutung zuerst, dann die Wilhelm-Quelltexte gruppiert als **Ursprungsbild** /
**Wandelnde Linien** / **Zielbild**, jeweils mit Trigramm-Aufschlüsselung und „Bedeutung",
in **einklappbaren Callouts** (konfigurierbar).

## Struktur (Note-body)

```
# <unicode> <n> · <NameLocal>
> <NameLatin · Chinese · pinyin>
> **Frage:** … · wandelnde Linien: …

## KI-Deutung            ← unverändert (Reasoning + Antwort, Marker-Anker)

## Ursprungsbild
<hexInfo: bold Kopf + Trigramm-Zeilen>
<judgment: Das Urteil>
<image: Das Bild>
<meaning: Bedeutung>     ← nur wenn Text vorhanden

## Wandelnde Linien (…)  ← nur wenn wandelnde Linien
<lines: je Linie ein Abschnitt>

## Zielbild              ← nur wenn resultierendes Hexagramm
<hexInfo: Ziel-Kopf + Trigramme>
<judgment: Ziel-Urteil>
<image: Ziel-Bild>

---
*Text: Richard Wilhelm — I Ging, Das Buch der Wandlungen.*
```

Die `##`-Überschriften (Ursprungsbild / Wandelnde Linien / Zielbild) bleiben immer plain.
Der Deutungs-Anker (`<!-- yijing:deutung:start/end -->`) liegt weiterhin zwischen der
Frage-Zeile und `## Ursprungsbild`.

## Konfigurierbare Callouts

Pro Abschnittstyp ein Callout an/aus + Callout-Typ (Default `quote`, geschlossen). Keys:

| Key | Abschnitt | Callout-Titel |
|---|---|---|
| `hexInfo` | Kopf + Trigramme (Ursprungs-/Zielbild) | der Bold-Kopf selbst |
| `judgment` | Das Urteil | „Das Urteil" |
| `image` | Das Bild | „Das Bild" |
| `meaning` | Bedeutung | „Bedeutung" |
| `lines` | je wandelnde Linie | Positions-Titel |

- **Callout an:** `> [!<type>]- <Titel>` + zeilen-geprefixter Body (via `wrapCallout`).
- **Callout aus:** `hexInfo` → Bold-Kopf + Bullets plain; übrige → `### <Titel>` + Body.
- Default: alle an, Typ `quote`. Steuerung über neuen Settings-Block „Notiz-Layout".

## Datenmodell (data.ts)

`HexagramData` erweitern:
- `trigrams: { above: TrigramInfo; below: TrigramInfo }` mit
  `TrigramInfo = { symbol; name; pinyin; family; nature }`.
- `meaning: string` — sprachabhängig (`meaning_en` für EN, sonst `meaning`).

Trigramm-Zeile: DE → `<symbol> <name> (<pinyin>) — <family>, <nature>`;
EN → `<symbol> <name> (<pinyin>)` (family/nature liegen nur deutsch vor → für EN weggelassen).
`meaning` wird nur gerendert, wenn nicht leer.

## Labels (render.ts, an Reading-Sprache)

DE: Ursprungsbild · Wandelnde Linien · Zielbild · Das Urteil · Das Bild · Bedeutung ·
Oberes/Unteres Trigramm · „Nr." · Attribution „Text: Richard Wilhelm — I Ging …".
EN: Primary Hexagram · Changing Lines · Resulting Hexagram · The Judgment · The Image ·
Meaning · Upper/Lower trigram · „No." · Attribution.

## Scope-Grenze

Kein generiertes Bild (App hat eins — hier out of scope). Keine EN-Übersetzung der
Trigramm-Deskriptoren. Panel-Vorschau (`previewBody`) nutzt dieselbe Struktur ohne Marker.

## Verifikation

Pure Tests für data (trigrams/meaning) und render (Struktur + Callout an/aus). Gate grün.
Smoke: neuer Wurf → Note entspricht App-Export; Callout-Settings durchschalten.
