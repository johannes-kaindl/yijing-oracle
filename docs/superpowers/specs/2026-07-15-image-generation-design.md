# Bildgenerierung (Bildmeditation) — Design

**Datum:** 2026-07-15 · **Status:** entworfen, vom User freigegeben (Brainstorming-Session)

## Ziel

Pro Wurf kann manuell ein Meditationsbild generiert werden — lokal-first über einen
bereits laufenden Bild-Server (Draw Things / A1111-kompatibel), auf Basis der bislang
ungenutzten `image_association`-Motive (64/64 kuratierte, sprachunabhängige Einzeiler).
Das Bild erscheint als Panel-Vorschau und wird beim Speichern/Einfügen der Reading-Note
als Vault-Attachment eingebettet.

**Nicht-Ziele:** Keine Inferenz im Plugin (kein Modell-Bundling, kein eigener
Server-Prozess). Kein ComfyUI-Adapter in v1 (Interface hält die Tür offen). Keine
LLM-Prompt-Komposition (deterministische Szenen-Logik, wie Web-App). Kein Kit-Export
jetzt — nur REGISTRY-Eintrag als Kit-Kandidat (erste Instanz).

## Entscheidungen (Brainstorming 2026-07-15)

| Frage | Entscheidung |
|---|---|
| Backend | A1111-kompatible HTTP-API (`POST /sdapi/v1/txt2img`), primär Draw Things (eingebauter Server + Modell-Management). Adapter-Interface `ImageBackend` für späteres ComfyUI. |
| „Server im Plugin" | Verworfen: Electron-Plugin kann keine SD-Inferenz sinnvoll tragen (GB-Modelle, GPU-Runtime, Mobile); ein plugin-gemanagter Python-Prozess wäre genau die unerwünschte Abhängigkeits-Schlepperei. |
| Auslösung | Manuell per Button im Panel (analog Deutung). |
| Ablage | Panel-Vorschau; beim Speichern/Einfügen → Vault-Attachment + Embed in eigener Note-Section. |
| Prompt | Port der puren Web-App-Logik `composeImageRequest` (deterministisch via Frage-Hash) + konfigurierbares Stil-Suffix + Negative Prompt. |

## Architektur

Folgt dem bestehenden Muster: pure Core (`src/core/`, kein `obsidian`-Import,
`check:pure`-gated) + Obsidian-Adapter (`src/obsidian/`).

### 1. `src/core/image-scene.ts` (pure, neu)

Port aus `yijing/web/image-scene.js` (gleiche Lizenz AGPL, gleicher Autor):

- `IMAGE_MODIFIERS`, `DARK_MODIFIERS`, `BRIGHT_MODIFIERS`, `DARK_HEXAGRAMS`,
  `BRIGHT_HEXAGRAMS`, `SCENE_RELATIONS`, `hashString` (djb2), `moodFor`,
  `composeImageRequest({primaryMotif, resultingMotif, question, primaryNumber})`
  → `{scene, motif, motif2, modifier, mood}` — verbatim-Port, Parity-getestet.
- **Neu:** `buildSdPrompt(scene, styleSuffix)` → `{prompt, negativePrompt}`:
  `prompt = scene + ", " + styleSuffix` (Suffix leer → nur scene);
  Negative Prompt kommt aus den Settings, Default siehe unten.
- **Seed:** `hashString(question)` — derselbe Wurf mit derselben Frage reproduziert
  dasselbe Bild. Regenerate nutzt einen Zufalls-Seed (`-1` = Backend-Zufall).

### 2. Daten-Layer (`src/core/data.ts`, Erweiterung)

`image_association` liegt bereits in `hexagrams.json`/`hexagrams.en.json` gebundelt,
wird aber nicht geparst. Erweiterung: Feld `imageAssociation: string` im Hexagram-Typ
(sprachunabhängig, aus `image_association` — kein Register-/Sprach-Fallback nötig).

### 3. `src/obsidian/image-client.ts` (neu)

```ts
export interface ImageBackend {
  generate(req: ImageRequest): Promise<ImageResult>; // ImageResult = { pngBase64: string }
}
export interface ImageRequest {
  prompt: string; negativePrompt: string;
  width: number; height: number; steps: number; seed: number;
}
```

A1111-Adapter: `POST {endpoint}/sdapi/v1/txt2img` mit
`{prompt, negative_prompt, width, height, steps, seed}` → `images[0]` (Base64-PNG).
Transport über das bestehende `http.ts`-Muster (`requestUrl`, CORS-frei,
mobil-tauglich), eigener Timeout via `Promise.race` (großzügig, Default 180 s —
Generierung dauert je nach Modell 10–60 s+). Fehler → typisiertes Ergebnis/Fehler,
im Panel als Notice.

Feste Defaults (keine Settings): `steps: 28`, Sampler bleibt unbenannt (Draw Things
nutzt bei A1111-API teils App-Einstellungen; kein Sampler-Feld senden).

### 4. Panel (`src/obsidian/view.ts`, Erweiterung)

- Button **„Bild generieren"** nach einem Wurf; wird nur gerendert, wenn ein
  Bild-Endpoint konfiguriert ist (Setting nicht leer).
- Klick → Button disabled + Status („generiere …") → Vorschau als einklappbarer
  Abschnitt (Muster der Deutungs-Sections), `<img src="data:image/png;base64,…">`.
- Klick aufs Bild = **Regenerate** mit Zufalls-Seed (Tooltip erklärt das).
- Fehler (Server aus, Timeout): Notice, Button wieder aktiv.
- Panel-State hält `pngBase64` bis „Neue Frage"/neuer Wurf.

### 5. Note-Embed (`reading-writer.ts` + `note-callouts.ts` + `render.ts`)

- Neue `CalloutSection` **`artwork`** (Label DE „Bildmeditation", EN „Meditation
  Image") — bewusst NICHT `image` (das ist der klassische „Das Bild"-Text).
  Default: `enabled: true, type: "quote"` — Section erscheint nur, wenn ein Bild
  existiert (kein Bild → Abschnitt entfällt, auch bei enabled).
- Beim Speichern/Einfügen mit vorhandenem Panel-Bild: PNG via
  `app.fileManager.getAvailablePathForAttachment("<note-basename>.png", notePath)`
  ablegen (respektiert die User-Attachment-Ordner-Einstellung), Embed
  `![[<attachment>]]` in der artwork-Section. Alt-/Kontextzeile darunter:
  die Szenen-Beschreibung (`scene`) kursiv.
- Frontmatter: kein neues Pflichtfeld; `scene`/`seed` werden NICHT ins Frontmatter
  geschrieben (Rekonstruktion braucht sie nicht — `composeImageRequest` ist aus
  Frage+Wurf deterministisch reproduzierbar).

### 6. Settings (`settings.ts`, Erweiterung — Sektion „Bildgenerierung")

| Setting | Typ | Default |
|---|---|---|
| Bild-Endpoint | Text (URL) | leer = Feature aus (Placeholder `http://127.0.0.1:7860`) |
| Stil-Suffix | Text | `ink wash painting, soft light, muted colors` |
| Negative Prompt | Text | `text, watermark, signature, frame, border, lowres, blurry` |
| Bildgröße | Dropdown 512/768/1024 (quadratisch) | 768 |

## Fehlerbehandlung

- Endpoint leer → Button nicht gerendert (Feature unsichtbar-aus).
- HTTP-Fehler/Timeout/leere `images` → Notice mit Kurzgrund, Panel-State unverändert.
- Attachment-Schreibfehler beim Speichern → Note wird trotzdem geschrieben,
  artwork-Section entfällt, Notice.

## Tests (Gate: lint · typecheck · check:pure · check:bundle · vitest)

1. **Parity `image-scene.ts`:** identische Inputs → identische Outputs wie Web-App
   (Fixture-Fälle aus `scripts/test-image-scene.mjs` übernehmen); Hash-Determinismus;
   Mood-Pool-Zuordnung (dark/bright/neutral); `buildSdPrompt`-Suffix-Fälle.
2. **`data.ts`:** `imageAssociation` 64/64 nicht-leer in beiden Sprachdateien.
3. **`image-client.ts`:** gemockter HTTP — Request-Shape (URL, Body-Felder),
   Base64-Extraktion, Fehlerpfade (non-200, Timeout, leeres `images`).
4. **Note-Embed:** Render-Test artwork-Section (mit/ohne Bild, enabled/disabled);
   Callout-Merge mit Alt-Configs (neuer Key darf alte Settings nicht brechen —
   `mergeCallouts`-Fall).

## Verifikation

Smoke-Vault `yijing-oracle-smoke`: Draw Things mit aktiviertem API-Server,
Wurf → Bild generieren → Vorschau → Note speichern → Attachment + Embed prüfen.
Mobile-Verhalten: Feature funktioniert, wenn ein Server im LAN erreichbar ist;
ohne Endpoint bleibt alles unverändert.

## REGISTRY

Nach Umsetzung Eintrag: „Bildgenerierung via A1111-kompatible API (txt2img,
Base64-PNG) → `yijing-oracle/src/obsidian/image-client.ts` → Kit-Kandidat (1.
Exemplar)" + „Deterministische Bild-Szenen-Komposition → `src/core/image-scene.ts`".
