# Bildmeditation (Bildgenerierung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro Wurf kann manuell ein Meditationsbild über einen A1111-kompatiblen Bild-Server (Draw Things) generiert werden — Panel-Vorschau + Note-Embed als Vault-Attachment.

**Architecture:** Pure Core (Szenen-Komposition als Parity-Port der Web-App, Artwork-Block + idempotenter Marker-Insert) + Obsidian-Adapter (injektionsbasierter `Txt2ImgClient` wie `ChatClient`, Attachment-I/O im `reading-writer`, Button/Vorschau im Panel-View). Spec: `docs/superpowers/specs/2026-07-15-image-generation-design.md`.

**Tech Stack:** TypeScript · esbuild · Obsidian Plugin API (`requestUrl`, `createBinary`, `getAvailablePathForAttachment`, `base64ToArrayBuffer`) · vitest

## Global Constraints

- `src/core/` importiert NIE `obsidian` (Gate `check:pure` greift auf `src/core` + `src/vendor`).
- Alle UI-Strings zweisprachig in `src/i18n/strings.ts` (en + de), Zugriff via `t("key")`.
- Gate muss grün bleiben: `npm run gate` (lint · typecheck · typecheck:test · vitest · check:pure · check:bundle).
- Kommentar-Sprache im Code: Deutsch (Bestandsstil), Kommentare nur für Constraints, nicht für Selbstverständliches.
- Settings-Defaults: Stil-Suffix `ink wash painting, soft light, muted colors`; Negative Prompt `text, watermark, signature, frame, border, lowres, blurry`; Bildgröße 768; Steps fest 28; HTTP-Timeout 180 000 ms.
- Kein ComfyUI, kein Sampler-Feld im Request, keine LLM-Prompt-Komposition (YAGNI, Spec §Nicht-Ziele).
- Commits: Conventional Commits, Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Pure Szenen-Komposition `image-scene.ts` (Parity-Port)

**Files:**
- Create: `src/core/image-scene.ts`
- Test: `tests/image-scene.test.ts`

**Interfaces:**
- Consumes: — (reiner Port von `/Users/Shared/code/yijing/web/image-scene.js`, dort NICHT ändern)
- Produces: `hashString(s: string): number`, `moodFor(primaryNumber?: number): "dark"|"bright"|"neutral"`, `composeImageRequest(input: {primaryMotif: string; resultingMotif: string; question: string; primaryNumber?: number}): {scene: string; motif: string; motif2: string; modifier: string; mood: string}`, `buildSdPrompt(scene: string, styleSuffix: string): string`

- [ ] **Step 1: Failing Test schreiben**

`tests/image-scene.test.ts` (Fixtures aus `yijing/scripts/test-image-scene.mjs` übernommen):

```ts
import { describe, expect, it } from "vitest";
import { buildSdPrompt, composeImageRequest, hashString, moodFor } from "../src/core/image-scene";

describe("composeImageRequest (Parity zur Web-App)", () => {
  it("ohne Wandlung: nur Motiv + Atmosphäre, keine Relation", () => {
    const r = composeImageRequest({ primaryMotif: "a soaring eagle", resultingMotif: "", question: "" });
    expect(r.motif2).toBe("");
    expect(r.scene).toBe("a soaring eagle, in soft daylight");
  });

  it("mit Wandlung: beide Motive in EINEM Szenen-Satz", () => {
    const r = composeImageRequest({
      primaryMotif: "a soaring eagle",
      resultingMotif: "a wide field of golden grain",
      question: "Where should I put my energy?",
    });
    expect(r.scene).toContain("a soaring eagle");
    expect(r.scene).toContain("a wide field of golden grain");
    expect(r.motif2).not.toBe("");
  });

  it("deterministisch pro Frage", () => {
    const a = composeImageRequest({ primaryMotif: "x", resultingMotif: "y", question: "Q" });
    const b = composeImageRequest({ primaryMotif: "x", resultingMotif: "y", question: "Q" });
    expect(a.scene).toBe(b.scene);
  });

  it("leeres Motiv → sicherer Default", () => {
    const r = composeImageRequest({ primaryMotif: "", resultingMotif: "", question: "" });
    expect(r.motif).toBe("a still mountain lake");
  });

  it("Zielmotiv als Hintergrund formuliert, nicht als Übergang", () => {
    const r = composeImageRequest({
      primaryMotif: "a soaring eagle",
      resultingMotif: "a wide field of golden grain",
      question: "Where to?",
    });
    expect(r.scene).toMatch(/in the background|small in the distance|on the horizon beyond/);
    expect(r.scene).not.toMatch(/giving way to|and beyond it|rising in the distance/);
  });

  it("dunkles Hexagramm → nie warmer Modifier", () => {
    const WARM = ["in warm golden light", "in spring bloom", "in lush summer green", "under a clear blue sky", "at dawn"];
    for (let i = 0; i < 30; i++) {
      const r = composeImageRequest({
        primaryMotif: "a dark river between steep cliffs", resultingMotif: "",
        question: "Q" + i, primaryNumber: 29,
      });
      expect(WARM.includes(r.modifier)).toBe(false);
      expect(r.mood).toBe("dark");
    }
  });

  it("helles Hexagramm → nie düsterer Modifier", () => {
    const SOMBER = ["under falling snow", "under a starry night sky", "in deep shadow", "under a grey overcast sky", "at dusk"];
    for (let i = 0; i < 30; i++) {
      const r = composeImageRequest({
        primaryMotif: "a wide field of golden grain", resultingMotif: "",
        question: "Q" + i, primaryNumber: 14,
      });
      expect(SOMBER.includes(r.modifier)).toBe(false);
      expect(r.mood).toBe("bright");
    }
  });
});

describe("hashString / moodFor", () => {
  it("djb2 ist stabil", () => {
    expect(hashString("")).toBe(5381);
    expect(hashString("Q")).toBe(hashString("Q"));
    expect(hashString("Q")).not.toBe(hashString("R"));
  });
  it("moodFor kennt die kuratierten Klassen", () => {
    expect(moodFor(29)).toBe("dark");
    expect(moodFor(14)).toBe("bright");
    expect(moodFor(1)).toBe("neutral");
    expect(moodFor(undefined)).toBe("neutral");
  });
});

describe("buildSdPrompt", () => {
  it("hängt das Stil-Suffix an", () => {
    expect(buildSdPrompt("a lake, at dusk", "ink wash painting")).toBe("a lake, at dusk, ink wash painting");
  });
  it("leeres Suffix → nur die Szene", () => {
    expect(buildSdPrompt("a lake", "")).toBe("a lake");
    expect(buildSdPrompt("a lake", "  ")).toBe("a lake");
  });
});
```

- [ ] **Step 2: Test läuft rot**

Run: `npx vitest run tests/image-scene.test.ts`
Expected: FAIL — `Cannot find module '../src/core/image-scene'`

- [ ] **Step 3: Implementierung**

`src/core/image-scene.ts` — Port von `yijing/web/image-scene.js` (gleicher Autor/AGPL; Kommentar-Kopf nennt die Quelle fürs Parity-Gate):

```ts
// Reine Szenen-Komposition für das Meditationsbild — Parity-Port von
// yijing/web/image-scene.js (Änderungen dort müssen hier nachgezogen werden).
// Ursprungs- und Zielmotiv werden zu EINEM natürlichsprachlichen Szenen-Satz
// mit räumlicher Relation verschmolzen; die Atmosphäre wählt der Frage-Hash
// deterministisch (gleiche Frage → gleiche Szene).

export const IMAGE_MODIFIERS = [
  "at dawn", "at dusk", "under a starry night sky", "in morning mist",
  "in autumn colors", "under falling snow", "in spring bloom",
  "in lush summer green", "in gentle rain", "under a clear blue sky",
  "in warm golden light", "under drifting clouds",
];

// Mood-Klassen: das Motiv trägt eine Atmosphäre, die ein unpassender Modifier
// invertieren würde (dunkle Schlucht „in warm golden light" liest sich sonnig).
// Kuratiert nach BILD-Atmosphäre der 64 Motive, nicht nach abstrakter Bedeutung.
export const DARK_HEXAGRAMS = new Set([12, 23, 29, 30, 36, 39, 41, 47, 55, 56, 59, 64]);
export const BRIGHT_HEXAGRAMS = new Set([2, 3, 9, 11, 14, 22, 24, 25, 31, 35, 42, 44, 46, 49, 54, 58]);

export const DARK_MODIFIERS = [
  "at dusk", "under a starry night sky", "in morning mist",
  "under falling snow", "in gentle rain", "in autumn colors",
  "under drifting clouds", "in deep shadow", "under a grey overcast sky",
];
export const BRIGHT_MODIFIERS = [
  "at dawn", "in spring bloom", "in lush summer green",
  "under a clear blue sky", "in warm golden light", "under drifting clouds",
];

// Hintergrund-Phrasierung statt Übergang („a giving way to b" ließ Bildgeneratoren
// das zweite Motiv fallen).
export const SCENE_RELATIONS: ((a: string, b: string) => string)[] = [
  (a, b) => `${a}, with ${b} in the background`,
  (a, b) => `${a}, ${b} small in the distance`,
  (a, b) => `${a}, ${b} on the horizon beyond`,
];

/** djb2 — stabil über Läufe/Geräte; rein lokal (kein Cross-File-Vertrag). */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export type Mood = "dark" | "bright" | "neutral";

export function moodFor(primaryNumber?: number): Mood {
  if (primaryNumber === undefined) return "neutral";
  return DARK_HEXAGRAMS.has(primaryNumber) ? "dark"
    : BRIGHT_HEXAGRAMS.has(primaryNumber) ? "bright"
    : "neutral";
}

export interface SceneInput {
  primaryMotif: string;
  resultingMotif: string;
  question: string;
  primaryNumber?: number;
}

export interface SceneResult {
  scene: string;
  motif: string;
  motif2: string;
  modifier: string;
  mood: Mood;
}

export function composeImageRequest({ primaryMotif, resultingMotif, question, primaryNumber }: SceneInput): SceneResult {
  const motif = (primaryMotif || "").trim() || "a still mountain lake";
  const motif2 = (resultingMotif || "").trim();
  const q = (question || "").trim();
  const h = q ? hashString(q) : 0;
  const mood = moodFor(primaryNumber);
  const pool = mood === "dark" ? DARK_MODIFIERS
    : mood === "bright" ? BRIGHT_MODIFIERS
    : IMAGE_MODIFIERS;
  const modifier = q ? pool[h % pool.length] : "in soft daylight";
  const base = motif2 ? SCENE_RELATIONS[h % SCENE_RELATIONS.length](motif, motif2) : motif;
  const scene = modifier ? `${base}, ${modifier}` : base;
  return { scene, motif, motif2, modifier, mood };
}

/** Finaler SD-Prompt: Szene + konfigurierbares Stil-Suffix. */
export function buildSdPrompt(scene: string, styleSuffix: string): string {
  const suffix = styleSuffix.trim();
  return suffix ? `${scene}, ${suffix}` : scene;
}
```

- [ ] **Step 4: Test läuft grün**

Run: `npx vitest run tests/image-scene.test.ts`
Expected: PASS (alle Tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/image-scene.ts tests/image-scene.test.ts
git commit -m "feat(core): Szenen-Komposition für Bildmeditation (Parity-Port aus Web-App)"
```

---

### Task 2: `imageAssociation` im Daten-Layer exponieren

**Files:**
- Modify: `src/core/data.ts` (RawHex + HexagramData + getHexagram)
- Test: `tests/data-image-association.test.ts`

**Interfaces:**
- Consumes: bestehendes `getHexagram(number, lang, register): HexagramData`
- Produces: `HexagramData.imageAssociation: string` (sprachunabhängiges Motiv, z.B. "a soaring eagle")

- [ ] **Step 1: Failing Test schreiben**

`tests/data-image-association.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getHexagram } from "../src/core/data";

describe("imageAssociation", () => {
  it("ist für alle 64 Hexagramme in beiden Sprachen nicht-leer", () => {
    for (let n = 1; n <= 64; n++) {
      expect(getHexagram(n, "de", "classic").imageAssociation.trim()).not.toBe("");
      expect(getHexagram(n, "en", "classic").imageAssociation.trim()).not.toBe("");
    }
  });

  it("ist sprachunabhängig (DE == EN)", () => {
    for (let n = 1; n <= 64; n++) {
      expect(getHexagram(n, "de", "neutral").imageAssociation).toBe(getHexagram(n, "en", "neutral").imageAssociation);
    }
  });
});
```

- [ ] **Step 2: Test läuft rot**

Run: `npx vitest run tests/data-image-association.test.ts`
Expected: FAIL — `imageAssociation` existiert nicht auf `HexagramData` (Typfehler bzw. undefined)

- [ ] **Step 3: Implementierung**

In `src/core/data.ts` drei Ergänzungen:

1. `RawHex` (nach dem `image_en_neutral?`-Feld, Zeile ~67):

```ts
  image_association?: string;
```

2. `HexagramData` (nach `image: string;`, Zeile ~108):

```ts
  /** Sprachunabhängiges Bild-Motiv für die Bildmeditation (z.B. "a soaring eagle"). */
  imageAssociation: string;
```

3. In `getHexagram` im Rückgabe-Objekt (nach `image: pickField(...)`):

```ts
    imageAssociation: raw.image_association ?? "",
```

- [ ] **Step 4: Test läuft grün**

Run: `npx vitest run tests/data-image-association.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/data.ts tests/data-image-association.test.ts
git commit -m "feat(core): image_association als imageAssociation im Daten-Layer exponieren"
```

---

### Task 3: Pure Artwork-Block + Marker-Insert + Callout-Section `artwork`

**Files:**
- Create: `src/core/artwork.ts`
- Modify: `src/core/note-callouts.ts` (Section `artwork`)
- Test: `tests/artwork.test.ts`, Modify: `tests/note-callouts.test.ts`

**Interfaces:**
- Consumes: `CalloutOption` aus `note-callouts.ts`, `wrapCallout(title, body, type, open)` aus `src/core/llm/callout.ts`, `MARKER_START`/`MARKER_END` aus `src/core/llm/insert.ts`, `Lang` aus `data.ts`
- Produces: `ARTWORK_MARKER_START`/`ARTWORK_MARKER_END: string`, `renderArtworkBlock(input: {embed: string; scene: string; lang: Lang; callout: CalloutOption}): string`, `insertArtwork(body: string, block: string): string`; neue `CalloutSection`-Variante `"artwork"` mit Default `{enabled: true, type: "quote"}`

- [ ] **Step 1: Failing Test schreiben**

`tests/artwork.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ARTWORK_MARKER_END, ARTWORK_MARKER_START, insertArtwork, renderArtworkBlock } from "../src/core/artwork";
import { MARKER_END, MARKER_START } from "../src/core/llm/insert";

const CAL = { enabled: true, type: "quote" };

describe("renderArtworkBlock", () => {
  it("wickelt Embed + Szene in ein Callout", () => {
    const b = renderArtworkBlock({ embed: "![[bild.png]]", scene: "a lake, at dusk", lang: "de", callout: CAL });
    expect(b).toContain("[!quote]");
    expect(b).toContain("Bildmeditation");
    expect(b).toContain("![[bild.png]]");
    expect(b).toContain("*a lake, at dusk*");
  });

  it("englisches Label + ohne Callout eine ###-Überschrift", () => {
    const b = renderArtworkBlock({ embed: "![[x.png]]", scene: "s", lang: "en", callout: { enabled: false, type: "quote" } });
    expect(b).toContain("### Meditation Image");
    expect(b).not.toContain("[!");
  });
});

describe("insertArtwork", () => {
  const block = "BLOCK";

  it("ersetzt idempotent zwischen vorhandenen Markern", () => {
    const body = `kopf\n\n${ARTWORK_MARKER_START}\nALT\n${ARTWORK_MARKER_END}\n\n## Ursprungsbild`;
    const out = insertArtwork(body, block);
    expect(out).toContain(`${ARTWORK_MARKER_START}\nBLOCK\n${ARTWORK_MARKER_END}`);
    expect(out).not.toContain("ALT");
    expect(insertArtwork(out, block)).toBe(out);
  });

  it("setzt nach dem Deutungs-Marker ein, wenn vorhanden", () => {
    const body = `kopf\n\n${MARKER_START}\n${MARKER_END}\n\n## Ursprungsbild\n\ntext`;
    const out = insertArtwork(body, block);
    const deutungEnd = out.indexOf(MARKER_END);
    const artStart = out.indexOf(ARTWORK_MARKER_START);
    expect(artStart).toBeGreaterThan(deutungEnd);
    expect(artStart).toBeLessThan(out.indexOf("## Ursprungsbild"));
  });

  it("sonst vor der ersten ##-Überschrift", () => {
    const body = "kopf\n\n## Ursprungsbild\n\ntext";
    const out = insertArtwork(body, block);
    expect(out.indexOf(ARTWORK_MARKER_START)).toBeLessThan(out.indexOf("## Ursprungsbild"));
  });

  it("sonst ans Ende", () => {
    const out = insertArtwork("nur text\n", block);
    expect(out.endsWith(`${ARTWORK_MARKER_START}\nBLOCK\n${ARTWORK_MARKER_END}`)).toBe(true);
  });
});
```

In `tests/note-callouts.test.ts` einen Fall ergänzen (bestehende Struktur des Files beachten — als eigenes `it` in der `mergeCallouts`-describe):

```ts
  it("ergänzt die neue artwork-Sektion in alten Configs", () => {
    const legacy = { overview: { enabled: false, type: "note" } };
    const merged = mergeCallouts(legacy as never);
    expect(merged.artwork).toEqual({ enabled: true, type: "quote" });
    expect(merged.overview.enabled).toBe(false);
  });
```

- [ ] **Step 2: Tests laufen rot**

Run: `npx vitest run tests/artwork.test.ts tests/note-callouts.test.ts`
Expected: FAIL — Modul `artwork` fehlt; `merged.artwork` undefined

- [ ] **Step 3: Implementierung**

`src/core/note-callouts.ts` — Section ergänzen (drei Stellen):

```ts
export type CalloutSection = "overview" | "question" | "hexInfo" | "judgment" | "image" | "artwork" | "meaning" | "lines" | "notes";
```

```ts
export const CALLOUT_SECTIONS: CalloutSection[] = ["overview", "question", "hexInfo", "judgment", "image", "artwork", "meaning", "lines", "notes"];
```

In `DEFAULT_CALLOUTS` nach `image`:

```ts
  artwork: { enabled: true, type: "quote" },
```

`src/core/artwork.ts` (neu):

```ts
// Bildmeditations-Block für die Reading-Note: Attachment-Embed + Szenen-Zeile,
// idempotent zwischen eigenen Markern eingesetzt (Muster von llm/insert.ts).
// Pure — die Attachment-I/O macht reading-writer.ts.
import { type Lang } from "./data";
import { type CalloutOption } from "./note-callouts";
import { wrapCallout } from "./llm/callout";
import { MARKER_END as DEUTUNG_END } from "./llm/insert";

export const ARTWORK_MARKER_START = "<!-- yijing:bild:start -->";
export const ARTWORK_MARKER_END = "<!-- yijing:bild:end -->";

// Label hängt an der READING-Sprache (wie die Sektions-Labels in render.ts).
const ARTWORK_LABELS: Record<Lang, string> = { de: "Bildmeditation", en: "Meditation Image" };

export interface ArtworkBlockInput {
  /** Fertiger Embed-Link, z.B. "![[reading.png]]". */
  embed: string;
  /** Szenen-Satz als Bildunterschrift. */
  scene: string;
  lang: Lang;
  callout: CalloutOption;
}

export function renderArtworkBlock(i: ArtworkBlockInput): string {
  const label = ARTWORK_LABELS[i.lang];
  const body = `${i.embed}\n\n*${i.scene}*`;
  return i.callout.enabled ? wrapCallout(label, body, i.callout.type, false) : `### ${label}\n\n${body}`;
}

/** Setzt/ersetzt den Bild-Block. Reihenfolge:
 *  1) eigene Marker vorhanden → Inhalt ersetzen.
 *  2) sonst hinter dem Deutungs-End-Marker (Bild unter der Deutung).
 *  3) sonst vor der ersten "## "-Überschrift.
 *  4) sonst ans Ende. Pure. */
export function insertArtwork(body: string, block: string): string {
  const wrapped = `${ARTWORK_MARKER_START}\n${block}\n${ARTWORK_MARKER_END}`;
  const s = body.indexOf(ARTWORK_MARKER_START);
  const e = body.indexOf(ARTWORK_MARKER_END);
  if (s !== -1 && e !== -1 && e > s) {
    return body.slice(0, s) + wrapped + body.slice(e + ARTWORK_MARKER_END.length);
  }
  const anchor = body.indexOf(DEUTUNG_END);
  if (anchor !== -1) {
    const at = anchor + DEUTUNG_END.length;
    return `${body.slice(0, at)}\n\n${wrapped}${body.slice(at)}`;
  }
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("## "));
  if (idx !== -1) {
    const before = lines.slice(0, idx).join("\n").replace(/\n*$/, "\n\n");
    const after = lines.slice(idx).join("\n");
    return `${before}${wrapped}\n\n${after}`;
  }
  return body.replace(/\n*$/, "\n\n") + wrapped;
}
```

- [ ] **Step 4: Tests laufen grün**

Run: `npx vitest run tests/artwork.test.ts tests/note-callouts.test.ts`
Expected: PASS

- [ ] **Step 5: i18n-Label für die Settings-Zeile ergänzen**

In `src/i18n/strings.ts` gibt es pro Callout-Section einen Key `set.callout.<key>` (die Settings-UI iteriert `CALLOUT_SECTIONS`). Ergänzen:

- en-Block: `"set.callout.artwork": "Meditation image",`
- de-Block: `"set.callout.artwork": "Bildmeditation",`

(direkt neben den vorhandenen `set.callout.image`-Zeilen)

- [ ] **Step 6: Voller Testlauf + Commit**

Run: `npm test && npm run typecheck`
Expected: PASS (alle Suiten — auch render.test.ts, da `DEFAULT_CALLOUTS` nur erweitert wurde)

```bash
git add src/core/artwork.ts src/core/note-callouts.ts src/i18n/strings.ts tests/artwork.test.ts tests/note-callouts.test.ts
git commit -m "feat(core): Bildmeditations-Block + artwork-Callout-Sektion (idempotenter Marker-Insert)"
```

---

### Task 4: `Txt2ImgClient` (A1111-Adapter) + `httpPostJson`

**Files:**
- Create: `src/obsidian/image-client.ts`
- Modify: `src/obsidian/http.ts` (POST-Helfer mit Timeout)
- Test: `tests/image-client.test.ts`

**Interfaces:**
- Consumes: `normalizeEndpoint(url: string): string` aus `src/vendor/kit/endpoint`
- Produces:
  - `type HttpPostJson = (url: string, body: unknown) => Promise<{ status: number; json: unknown }>`
  - `interface ImageRequest { prompt: string; negativePrompt: string; width: number; height: number; steps: number; seed: number }`
  - `class Txt2ImgClient { constructor(endpoint: string, post: HttpPostJson); generate(req: ImageRequest): Promise<string> }` — liefert Base64-PNG, wirft `Error` mit Klartext bei non-200/leerem Ergebnis
  - `httpPostJson(url: string, body: unknown, timeoutMs = 180000)` in `http.ts` (echte Implementierung über `requestUrl`)

- [ ] **Step 1: Failing Test schreiben**

`tests/image-client.test.ts` (Injektionsmuster wie `chat-client.test.ts` — kein obsidian-Import):

```ts
import { describe, expect, it } from "vitest";
import { Txt2ImgClient, type ImageRequest } from "../src/obsidian/image-client";

const REQ: ImageRequest = { prompt: "a lake", negativePrompt: "text", width: 768, height: 768, steps: 28, seed: 42 };

function fakePost(status: number, json: unknown) {
  const calls: { url: string; body: unknown }[] = [];
  const post = async (url: string, body: unknown) => {
    calls.push({ url, body });
    return { status, json };
  };
  return { post, calls };
}

describe("Txt2ImgClient", () => {
  it("postet den A1111-Request an /sdapi/v1/txt2img und liefert images[0]", async () => {
    const { post, calls } = fakePost(200, { images: ["QkFTRTY0"] });
    const client = new Txt2ImgClient("http://127.0.0.1:7860/", post);
    const png = await client.generate(REQ);
    expect(png).toBe("QkFTRTY0");
    expect(calls[0].url).toBe("http://127.0.0.1:7860/sdapi/v1/txt2img");
    expect(calls[0].body).toEqual({
      prompt: "a lake", negative_prompt: "text", width: 768, height: 768, steps: 28, seed: 42,
    });
  });

  it("wirft bei non-200", async () => {
    const { post } = fakePost(500, undefined);
    await expect(new Txt2ImgClient("http://x", post).generate(REQ)).rejects.toThrow(/500/);
  });

  it("wirft bei leerem/fehlendem images-Array", async () => {
    const { post } = fakePost(200, { images: [] });
    await expect(new Txt2ImgClient("http://x", post).generate(REQ)).rejects.toThrow();
    const { post: p2 } = fakePost(200, {});
    await expect(new Txt2ImgClient("http://x", p2).generate(REQ)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Test läuft rot**

Run: `npx vitest run tests/image-client.test.ts`
Expected: FAIL — Modul `image-client` fehlt

- [ ] **Step 3: Implementierung**

`src/obsidian/image-client.ts`:

```ts
// A1111-kompatibler txt2img-Client (Draw Things, A1111, Forge, SD.Next).
// HTTP wird injiziert (httpPostJson aus http.ts) — obsidian-frei + in Node testbar,
// Muster wie ChatClient. ComfyUI käme später als zweite ImageBackend-Implementierung.
import { normalizeEndpoint } from "../vendor/kit/endpoint";

export type HttpPostJson = (url: string, body: unknown) => Promise<{ status: number; json: unknown }>;

export interface ImageRequest {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
}

export interface ImageBackend {
  /** Liefert das Bild als Base64-PNG; wirft Error mit Klartext bei Fehlschlag. */
  generate(req: ImageRequest): Promise<string>;
}

export class Txt2ImgClient implements ImageBackend {
  constructor(
    private readonly endpoint: string,
    private readonly post: HttpPostJson,
  ) {}

  async generate(req: ImageRequest): Promise<string> {
    const url = `${normalizeEndpoint(this.endpoint)}/sdapi/v1/txt2img`;
    const { status, json } = await this.post(url, {
      prompt: req.prompt,
      negative_prompt: req.negativePrompt,
      width: req.width,
      height: req.height,
      steps: req.steps,
      seed: req.seed,
    });
    if (status !== 200) throw new Error(`txt2img HTTP ${status}`);
    const images = (json as { images?: unknown })?.images;
    const first = Array.isArray(images) ? images[0] : undefined;
    if (typeof first !== "string" || !first) throw new Error("txt2img: empty result");
    return first;
  }
}
```

In `src/obsidian/http.ts` ergänzen (nach `httpGet`; Timeout-Muster von `probeEndpoint`):

```ts
/** Passt zu `HttpPostJson` in image-client.ts. Eigener Timeout via Promise.race,
 *  weil requestUrl weder timeout noch Abort kennt (Bildgenerierung dauert Minuten). */
export async function httpPostJson(url: string, body: unknown, timeoutMs = 180000): Promise<{ status: number; json: unknown }> {
  let timer: number | undefined;
  const timeout = new Promise<"__timeout__">((resolve) => {
    timer = window.setTimeout(() => resolve("__timeout__"), timeoutMs);
  });
  try {
    const raced = await Promise.race([
      requestUrl({ url, method: "POST", contentType: "application/json", body: JSON.stringify(body), throw: false }).then((r) => {
        let json: unknown = undefined;
        try { json = r.json; } catch { /* nicht-JSON-Body → json bleibt undefined */ }
        return { status: r.status, json } as const;
      }),
      timeout,
    ]);
    if (raced === "__timeout__") throw new Error(`timeout after ${timeoutMs} ms`);
    return raced;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Test läuft grün**

Run: `npx vitest run tests/image-client.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/image-client.ts src/obsidian/http.ts tests/image-client.test.ts
git commit -m "feat(obsidian): Txt2ImgClient (A1111-API) + httpPostJson mit Timeout"
```

---

### Task 5: Image-Settings (pure Defaults + Settings-UI + Merge)

**Files:**
- Create: `src/core/image-settings.ts`
- Modify: `src/obsidian/settings.ts` (Interface + Defaults + UI-Sektion), `src/main.ts` (Merge), `src/i18n/strings.ts` (Keys)
- Test: `tests/image-settings.test.ts`

**Interfaces:**
- Consumes: `SettingsHost`-Muster in `settings.ts`, `mergeSettings` in `main.ts`
- Produces: `interface ImageSettings { endpoint: string; styleSuffix: string; negativePrompt: string; size: number }`, `DEFAULT_IMAGE_SETTINGS: ImageSettings`, `PluginSettings.image: ImageSettings`

- [ ] **Step 1: Failing Test schreiben**

`tests/image-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-settings";

describe("DEFAULT_IMAGE_SETTINGS", () => {
  it("Feature ist per Default aus (leerer Endpoint), sinnvolle Prompt-Defaults", () => {
    expect(DEFAULT_IMAGE_SETTINGS.endpoint).toBe("");
    expect(DEFAULT_IMAGE_SETTINGS.styleSuffix).toBe("ink wash painting, soft light, muted colors");
    expect(DEFAULT_IMAGE_SETTINGS.negativePrompt).toBe("text, watermark, signature, frame, border, lowres, blurry");
    expect(DEFAULT_IMAGE_SETTINGS.size).toBe(768);
  });

  it("Alt-Settings ohne image-Block füllen sich per Spread auf", () => {
    const legacy = { endpoint: "http://mac-mini:7860" };
    const merged = { ...DEFAULT_IMAGE_SETTINGS, ...legacy };
    expect(merged.endpoint).toBe("http://mac-mini:7860");
    expect(merged.size).toBe(768);
  });
});
```

- [ ] **Step 2: Test läuft rot**

Run: `npx vitest run tests/image-settings.test.ts`
Expected: FAIL — Modul fehlt

- [ ] **Step 3: Pure Defaults**

`src/core/image-settings.ts`:

```ts
// Defaults der Bildgenerierung — pure (Muster: llm/settings-defaults.ts).
// Leerer Endpoint = Feature aus (Button erscheint nicht).
export interface ImageSettings {
  /** A1111-kompatibler Server (Draw Things API). Leer = Feature aus. */
  endpoint: string;
  /** Wird an den Szenen-Satz angehängt. */
  styleSuffix: string;
  negativePrompt: string;
  /** Quadratische Kantenlänge in px. */
  size: number;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  endpoint: "",
  styleSuffix: "ink wash painting, soft light, muted colors",
  negativePrompt: "text, watermark, signature, frame, border, lowres, blurry",
  size: 768,
};
```

- [ ] **Step 4: Test läuft grün**

Run: `npx vitest run tests/image-settings.test.ts`
Expected: PASS

- [ ] **Step 5: Settings-Interface + Merge + UI**

`src/obsidian/settings.ts`:

1. Import ergänzen: `import { type ImageSettings, DEFAULT_IMAGE_SETTINGS } from "../core/image-settings";`
2. `PluginSettings` (nach `llm: LlmSettings;`):

```ts
  /** Bildgenerierung (Bildmeditation). */
  image: ImageSettings;
```

3. `DEFAULT_SETTINGS` (nach `llm: DEFAULT_LLM_SETTINGS,`):

```ts
  image: DEFAULT_IMAGE_SETTINGS,
```

4. In `display()` nach `this.renderLlmSettings(containerEl, s.llm);`:

```ts
    this.renderImageSettings(containerEl, s.image);
```

5. Neue Methode (nach `renderLlmSettings`):

```ts
  // ── Bildgenerierung ───────────────────────────────────────────────────────
  private renderImageSettings(containerEl: HTMLElement, img: ImageSettings): void {
    new Setting(containerEl).setName(t("set.imgHead")).setHeading();

    new Setting(containerEl)
      .setName(t("set.imgEndpoint"))
      .setDesc(t("set.imgEndpointDesc"))
      .addText((txt) =>
        txt
          .setPlaceholder("http://127.0.0.1:7860")
          .setValue(img.endpoint)
          .onChange(async (v) => {
            img.endpoint = v.trim();
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.imgStyle"))
      .setDesc(t("set.imgStyleDesc"))
      .addText((txt) =>
        txt
          .setPlaceholder(DEFAULT_IMAGE_SETTINGS.styleSuffix)
          .setValue(img.styleSuffix)
          .onChange(async (v) => {
            img.styleSuffix = v;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.imgNegative"))
      .addText((txt) =>
        txt
          .setPlaceholder(DEFAULT_IMAGE_SETTINGS.negativePrompt)
          .setValue(img.negativePrompt)
          .onChange(async (v) => {
            img.negativePrompt = v;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.imgSize"))
      .addDropdown((d) => {
        for (const px of [512, 768, 1024]) d.addOption(String(px), `${px} × ${px}`);
        d.setValue(String(img.size));
        d.onChange(async (v) => {
          img.size = Number(v);
          await this.host.saveSettings();
        });
      });
  }
```

`src/main.ts` — Merge nach der `llm`-Zeile (Zeile ~38; Import `DEFAULT_IMAGE_SETTINGS` aus `./core/image-settings` ergänzen):

```ts
    // mergeSettings ist shallow — auch das image-Objekt gegen neue Defaults auffüllen.
    this.settings.image = { ...DEFAULT_IMAGE_SETTINGS, ...(this.settings.image ?? {}) };
```

`src/i18n/strings.ts` — Keys in BEIDEN Blöcken (neben den `set.llm*`-Keys):

en:

```ts
      "set.imgHead": "Image generation",
      "set.imgEndpoint": "Image endpoint",
      "set.imgEndpointDesc": "A1111-compatible server (e.g. Draw Things with API server enabled). Empty = feature off.",
      "set.imgStyle": "Style suffix",
      "set.imgStyleDesc": "Appended to the scene prompt.",
      "set.imgNegative": "Negative prompt",
      "set.imgSize": "Image size",
```

de:

```ts
      "set.imgHead": "Bildgenerierung",
      "set.imgEndpoint": "Bild-Endpunkt",
      "set.imgEndpointDesc": "A1111-kompatibler Server (z.B. Draw Things mit aktiviertem API-Server). Leer = Funktion aus.",
      "set.imgStyle": "Stil-Suffix",
      "set.imgStyleDesc": "Wird an den Szenen-Prompt angehängt.",
      "set.imgNegative": "Negative Prompt",
      "set.imgSize": "Bildgröße",
```

- [ ] **Step 6: Typecheck + Tests + Commit**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add src/core/image-settings.ts src/obsidian/settings.ts src/main.ts src/i18n/strings.ts tests/image-settings.test.ts
git commit -m "feat(settings): Bildgenerierungs-Sektion (Endpoint, Stil, Negative, Größe)"
```

---

### Task 6: Attachment + Note-Embed im `reading-writer`

**Files:**
- Modify: `src/obsidian/reading-writer.ts`, `src/i18n/strings.ts` (Notice-Key)

**Interfaces:**
- Consumes: `renderArtworkBlock`/`insertArtwork` aus Task 3, `WriteInput`/`writeReading`-Bestand, Obsidian-API `base64ToArrayBuffer`, `app.fileManager.getAvailablePathForAttachment`, `app.vault.createBinary`, `app.vault.process`
- Produces: `WriteInput.artwork?: { pngBase64: string; scene: string } | null` — Task 7 übergibt dieses Feld

- [ ] **Step 1: Implementierung** (obsidian-gebundene I/O — kein Unit-Test; die Insert-Logik ist in Task 3 getestet, Verifikation via Smoke in Task 8)

In `src/obsidian/reading-writer.ts`:

1. Imports ergänzen:

```ts
import { base64ToArrayBuffer } from "obsidian";
import { insertArtwork, renderArtworkBlock } from "../core/artwork";
```

(`base64ToArrayBuffer` in die bestehende obsidian-Import-Zeile aufnehmen)

2. `WriteInput` ergänzen (nach `interpretation?`):

```ts
  /** Generiertes Meditationsbild; null/undefined → kein Bild-Abschnitt. */
  artwork?: { pngBase64: string; scene: string } | null;
```

3. Neue Funktion (nach `interpretationBlock`):

```ts
/** Legt das PNG als Attachment neben die Note und setzt den Bild-Block idempotent
 *  in die Note ein. Fehler brechen das Speichern der Note NICHT ab (Spec §Fehler). */
async function attachArtwork(
  app: App,
  file: TFile,
  artwork: { pngBase64: string; scene: string },
  lang: Lang,
  settings: PluginSettings,
): Promise<void> {
  try {
    const path = await app.fileManager.getAvailablePathForAttachment(`${file.basename}.png`, file.path);
    const att = await app.vault.createBinary(path, base64ToArrayBuffer(artwork.pngBase64));
    const raw = app.fileManager.generateMarkdownLink(att, file.path);
    const embed = raw.startsWith("!") ? raw : `!${raw}`;
    const block = renderArtworkBlock({ embed, scene: artwork.scene, lang, callout: settings.callouts.artwork });
    await app.vault.process(file, (cur) => insertArtwork(cur, block));
  } catch (e) {
    new Notice(t("notice.imageSaveError"));
    console.error("[yijing-oracle]", e);
  }
}
```

4. In `writeReading` beide Pfade anbinden:

Im `existingFile`-Zweig, vor dem `return`:

```ts
    if (input.artwork) await attachArtwork(app, input.existingFile, input.artwork, input.lang, settings);
```

Nach `const file = await createReadingNote(app, input, settings);`:

```ts
  if (input.artwork) await attachArtwork(app, file, input.artwork, input.lang, settings);
```

5. i18n-Key in `src/i18n/strings.ts`:

- en: `"notice.imageSaveError": "Could not save the image attachment.",`
- de: `"notice.imageSaveError": "Bild-Anhang konnte nicht gespeichert werden.",`

- [ ] **Step 2: Typecheck + Tests**

Run: `npm run typecheck && npm test`
Expected: PASS (kein Bestandstest bricht — `artwork` ist optional)

- [ ] **Step 3: Commit**

```bash
git add src/obsidian/reading-writer.ts src/i18n/strings.ts
git commit -m "feat(writer): Bildmeditation als Vault-Attachment + idempotenter Note-Embed"
```

---

### Task 7: Panel-Integration (Button, Vorschau, Regenerate, Save-Durchreichung)

**Files:**
- Modify: `src/obsidian/view.ts`, `src/i18n/strings.ts` (View-Keys), `styles.css`

**Interfaces:**
- Consumes: `composeImageRequest`/`buildSdPrompt`/`hashString` (Task 1), `HexagramData.imageAssociation` (Task 2), `Txt2ImgClient` (Task 4), `httpPostJson` (Task 4), `settings.image` (Task 5), `WriteInput.artwork` (Task 6)
- Produces: — (Endverbraucher)

- [ ] **Step 1: State + Erzeugung**

In `src/obsidian/view.ts`:

1. Imports ergänzen:

```ts
import { buildSdPrompt, composeImageRequest, hashString } from "../core/image-scene";
import { Txt2ImgClient } from "./image-client";
import { httpPostJson } from "./http";
```

2. `CurrentCast` erweitern (nach `interpretation`):

```ts
  /** Generiertes Meditationsbild (oder null). saved verhindert Doppel-Attachments. */
  artwork: { pngBase64: string; scene: string; saved: boolean } | null;
```

Alle drei `CurrentCast`-Konstruktionsstellen anpassen: in `doCast` und `restoreFromNote` jeweils `artwork: null,` ins Objekt aufnehmen.

3. Feld für den Laufzustand (neben `streaming`):

```ts
  private generatingImage = false;
```

4. Neue Methode (nach `generateInterpretation`):

```ts
  /** Baut Szene+Prompt deterministisch aus dem Wurf und holt das Bild vom Server. */
  private async generateArtwork(seed?: number): Promise<void> {
    const c = this.current;
    if (!c || this.generatingImage) return;
    const img = this.host.settings.image;
    const endpoint = img.endpoint.trim();
    if (!endpoint) return;

    const register = this.host.settings.register;
    const primary = getHexagram(c.reading.primaryNumber, c.lang, register);
    const resulting = c.reading.resultingNumber !== null ? getHexagram(c.reading.resultingNumber, c.lang, register) : null;
    const { scene } = composeImageRequest({
      primaryMotif: primary.imageAssociation,
      resultingMotif: resulting?.imageAssociation ?? "",
      question: c.question,
      primaryNumber: c.reading.primaryNumber,
    });

    this.generatingImage = true;
    await this.render();
    try {
      const png = await new Txt2ImgClient(endpoint, httpPostJson).generate({
        prompt: buildSdPrompt(scene, img.styleSuffix),
        negativePrompt: img.negativePrompt,
        width: img.size,
        height: img.size,
        steps: 28,
        // Default-Seed = Frage-Hash → gleiche Frage reproduziert dasselbe Bild.
        seed: seed ?? hashString(c.question),
      });
      c.artwork = { pngBase64: png, scene, saved: false };
    } catch (e) {
      new Notice(t("notice.imageError", String((e as Error)?.message ?? e)));
      console.error("[yijing-oracle]", e);
    } finally {
      this.generatingImage = false;
      await this.render();
    }
  }
```

- [ ] **Step 2: Artwork-Kasten rendern**

1. In `renderCurrent`, direkt nach `this.renderInterpretationArea(root, c);`:

```ts
    this.renderArtworkArea(root, c);
```

2. Neue Methode (nach `renderInterpretationArea`):

```ts
  /** Bildmeditations-Bereich: Kasten nur bei konfiguriertem Endpoint; Button →
   *  Vorschau; Klick aufs Bild generiert mit neuem Zufalls-Seed neu. */
  private renderArtworkArea(root: HTMLElement, c: CurrentCast): void {
    if (!this.host.settings.image.endpoint.trim()) return;
    const box = root.createEl("details", { cls: "yijing-artwork" });
    box.open = true;
    box.createEl("summary", { text: t("view.artworkHead"), cls: "yijing-box-summary" });
    const area = box.createDiv({ cls: "yijing-artwork-inner" });

    if (this.generatingImage) {
      area.createEl("p", { text: t("view.generatingImage"), cls: "yijing-empty" });
      return;
    }

    if (c.artwork) {
      const imgEl = area.createEl("img", { cls: "yijing-artwork-img" });
      imgEl.src = `data:image/png;base64,${c.artwork.pngBase64}`;
      imgEl.title = t("view.regenerate");
      imgEl.addEventListener("click", () => {
        void this.generateArtwork(Math.floor(Math.random() * 0xffffffff));
      });
      area.createDiv({ text: c.artwork.scene, cls: "yijing-artwork-scene" });
      return;
    }

    const row = area.createDiv({ cls: "yijing-actions" });
    new ButtonComponent(row)
      .setButtonText(t("view.generateImage"))
      .onClick(() => void this.generateArtwork());
  }
```

- [ ] **Step 3: Save-Durchreichung**

In `saveCurrent` das `writeReading`-Input-Objekt ergänzen (nach `interpretation: c.interpretation,`):

```ts
        artwork: c.artwork && !c.artwork.saved ? c.artwork : null,
```

und nach erfolgreichem Schreiben (im `if (result.file) {`-Block, vor der Notice):

```ts
      if (c.artwork) c.artwork.saved = true;
```

(Regenerate setzt `saved` implizit zurück, weil `generateArtwork` ein neues Objekt mit `saved: false` schreibt.)

- [ ] **Step 4: i18n-Keys + CSS**

`src/i18n/strings.ts`:

en:

```ts
      "view.artworkHead": "Meditation image",
      "view.generateImage": "Generate image",
      "view.generatingImage": "Generating image…",
      "view.regenerate": "Click to regenerate with a new random seed",
      "notice.imageError": "Image generation failed: {0}",
```

de:

```ts
      "view.artworkHead": "Bildmeditation",
      "view.generateImage": "Bild generieren",
      "view.generatingImage": "Bild wird generiert…",
      "view.regenerate": "Klick generiert neu (neuer Zufalls-Seed)",
      "notice.imageError": "Bildgenerierung fehlgeschlagen: {0}",
```

`styles.css` (ans Ende, Bestandskonventionen: nur Theme-Variablen):

```css
/* ── Bildmeditation ─────────────────────────────────────────────── */
.yijing-artwork-inner {
  padding: 0.25em 0;
}
.yijing-artwork-img {
  max-width: 100%;
  border-radius: var(--radius-m);
  cursor: pointer;
  display: block;
}
.yijing-artwork-scene {
  color: var(--text-muted);
  font-style: italic;
  font-size: var(--font-ui-smaller);
  margin-top: 0.35em;
}
```

- [ ] **Step 5: Typecheck + Tests + Commit**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add src/obsidian/view.ts src/i18n/strings.ts styles.css
git commit -m "feat(panel): Bildmeditation — Button, Vorschau, Regenerate, Save-Embed"
```

---

### Task 8: Gate, Smoke-Verifikation, REGISTRY

**Files:**
- Modify: `/Users/Shared/code/obsidian-plugins/REGISTRY.md` (Dach-Repo, eigener Commit dort)
- Smoke: Vault `yijing-oracle-smoke` (`.obsidian/plugins/yijing-oracle/`)

- [ ] **Step 1: Volles Gate**

Run: `npm run gate`
Expected: PASS — inkl. `check:pure` (image-scene/artwork/image-settings sind obsidian-frei) und `check:bundle`.

- [ ] **Step 2: Smoke-Deploy + manuelle Verifikation** (User/Session gemeinsam)

Build nach `yijing-oracle-smoke/.obsidian/plugins/yijing-oracle/` kopieren (main.js, manifest.json, styles.css — bestehender Smoke-Weg). Checkliste:

1. Draw Things starten, API-Server aktivieren (Settings → API Server, Port 7860).
2. Plugin-Settings: Bild-Endpunkt `http://127.0.0.1:7860` setzen.
3. Wurf mit Frage → „Bild generieren" → Vorschau erscheint; gleicher Wurf, gleiche Frage → gleiches Bild (Seed-Determinismus, sofern Server Seed respektiert).
4. Klick aufs Bild → neues Bild (Zufalls-Seed).
5. „Speichern" → Note hat Bildmeditations-Callout mit Embed; PNG liegt im Attachment-Ordner.
6. „Deutung nachtragen"-Fluss (Save auf bestehende Note) → kein zweites Attachment (saved-Flag).
7. Endpoint leeren → Kasten/Button verschwinden; Server stoppen + generieren → Notice, Panel bleibt bedienbar.

- [ ] **Step 3: REGISTRY-Einträge (Dach-Repo)**

In `/Users/Shared/code/obsidian-plugins/REGISTRY.md`, Rubrik nach Katalog-Muster ergänzen:

- „Bildgenerierung via A1111-kompatible API (txt2img, Base64-PNG, injizierter POST) → `yijing-oracle/src/obsidian/image-client.ts` → `Txt2ImgClient` (Kit-Kandidat, 1. Exemplar)"
- „Deterministische Bild-Szenen-Komposition (Motiv+Mood+Frage-Hash) → `yijing-oracle/src/core/image-scene.ts` → `composeImageRequest`/`buildSdPrompt` (1. Exemplar; Quelle: yijing-Web-App)"

Commit im Dach-Repo:

```bash
cd /Users/Shared/code/obsidian-plugins && git add REGISTRY.md && git commit -m "docs(registry): Txt2ImgClient + Bild-Szenen-Komposition (yijing-oracle)"
```

- [ ] **Step 4: Plugin-Repo-Abschluss-Commit** (falls nach Smoke noch Fixes anfielen, sonst entfällt)

```bash
cd /Users/Shared/code/obsidian-plugins/yijing-oracle && git status --short
```

Release (0.2.0) erst auf User-Zuruf: `npm run release 0.2.0`.
