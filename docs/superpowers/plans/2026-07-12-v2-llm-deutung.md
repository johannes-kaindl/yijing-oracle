# yijing-oracle v2 — LLM-Deutung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Orakel-Panel eine live-gestreamte KI-Deutung des Wurfs über lokale OpenAI-kompatible Modelle erzeugen und optional als ersten `##`-Abschnitt in die Reading-Note schreiben.

**Architecture:** Pure Kernlogik (Prompt-Bau, Deutungs-/Callout-Rendering, Marker-Insert, SSE-/Reasoning-Parsing) `obsidian`-frei und `check:pure`-gated. Transport (`streamSSE` via XHR) und `ChatClient` mit injiziertem `httpGet` bleiben ebenfalls `obsidian`-import-frei (Node-testbar). Nur `http.ts` (requestUrl-Wrapper), Panel und SettingsTab berühren `obsidian`.

**Tech Stack:** TypeScript · esbuild · Obsidian Plugin API · vitest. Vendored aus `obsidian-kit` + `vault-rag`.

## Global Constraints

- **Kit-first:** vendored Module verbatim aus `obsidian-kit`/`vault-rag` übernehmen; nur mit Grund abweichen.
- **`check:pure`** grept `src/core` UND `src/vendor` nach `from 'obsidian'` → beide MÜSSEN obsidian-frei bleiben.
- **Kein `obsidian`-Mock im vitest-Setup** → jede getestete Datei darf `obsidian` nicht importieren. `obsidian`-Abhängigkeiten per Funktions-Injektion entkoppeln.
- **License-Header:** neue Dateien beginnen mit `// SPDX-License-Identifier: AGPL-3.0-or-later` (Repo-Konvention prüfen: `head -1 src/core/render.ts`; falls dort keiner → keinen setzen).
- **Gate:** `npm run gate` (lint · typecheck · typecheck:test · test · check:pure · check:bundle) muss am Ende grün sein. Tests aktuell 5 Dateien in `tests/`.
- **Sprache:** Reading-Sprache (`Lang = "de" | "en"`) steuert Prompt + Abschnitts-Labels, unabhängig von der UI-Sprache (wie `render.ts` `LABELS`).
- **Register `neutral`** ist Default; Deutung darf das Register nicht ignorieren (im Prompt erwähnen).

---

## File Structure

**Vendored (pure, `src/vendor/kit/`):** `sse.ts` (`parseSSE`), `endpoint.ts` (`normalizeEndpoint`/`parseEndpointList`), `endpoint_diagnostics.ts` (`classifyEndpointStatus`/`ENDPOINT_PRESETS`/`validateEndpointInput`), `reasoning.ts` (`suppressParams`/`reasoningHappened`/`isAlwaysOnThinker`), `think.ts` (`ThinkSplitter`).

**Pure Kern (`src/core/llm/`):** `defaults.ts`, `prompt.ts`, `callout.ts`, `interpretation.ts`, `insert.ts`.

**Obsidian-nah (`src/obsidian/`):** `sse.ts` (`streamSSE`, XHR), `chat-client.ts` (`ChatClient`, injiziertes `httpGet`), `http.ts` (requestUrl-Wrapper: `httpGet`/`probeEndpoint`).

**Modifiziert:** `src/core/render.ts` (Marker), `src/obsidian/settings.ts` (llm-Settings + UI), `src/obsidian/view.ts` (Panel-Integration), `src/obsidian/reading-writer.ts` (Deutung beim Speichern einfügen), `src/main.ts` (llm-merge-guard), `src/i18n/strings.ts` (neue Keys).

**Tests (`tests/`):** `sse-parse.test.ts`, `think.test.ts`, `streamSSE.test.ts`, `chat-client.test.ts`, `prompt.test.ts`, `callout.test.ts`, `interpretation.test.ts`, `insert.test.ts`, `defaults.test.ts`, Ergänzungen in `render.test.ts`.

---

## Task 1: Vendor pure Kit-Module

**Files:**
- Create: `src/vendor/kit/sse.ts`, `src/vendor/kit/endpoint.ts`, `src/vendor/kit/endpoint_diagnostics.ts`, `src/vendor/kit/reasoning.ts`, `src/vendor/kit/think.ts`
- Test: `tests/sse-parse.test.ts`, `tests/think.test.ts`

**Interfaces:**
- Produces: `parseSSE(buffer): { content: string[]; reasoning: string[]; model?: string; finishReason?: string; rest: string; done: boolean }`; `class ThinkSplitter { push(t): {content,reasoning}; flush(): {content,reasoning} }`; `normalizeEndpoint(s): string`; `parseEndpointList(text): string[]`; `suppressParams(b): Record<string,unknown>`; `reasoningHappened(content, reasoning): boolean`; `isAlwaysOnThinker(model): boolean`; `classifyEndpointStatus(input): EndpointStatus`; `ENDPOINT_PRESETS: EndpointPreset[]`; `validateEndpointInput(url): EndpointWarning[]`.

- [ ] **Step 1: Copy vendored files verbatim.** Copy each source file's full content into the target (add header `// vendored from obsidian-kit, src/pure/<name>.ts`):
  - `obsidian-kit/src/pure/sse.ts` → `src/vendor/kit/sse.ts`
  - `obsidian-kit/src/pure/endpoint.ts` → `src/vendor/kit/endpoint.ts` (nur `normalizeEndpoint` + `parseEndpointList` behalten; `resolveActiveEndpoint` mitnehmen, schadet nicht)
  - `obsidian-kit/src/pure/endpoint_diagnostics.ts` → `src/vendor/kit/endpoint_diagnostics.ts`
  - `obsidian-kit/src/pure/reasoning.ts` → `src/vendor/kit/reasoning.ts`
  - `vault-rag/src/vendor/kit/think.ts` → `src/vendor/kit/think.ts`

- [ ] **Step 2: Write characterization tests** `tests/sse-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSSE } from "../src/vendor/kit/sse";

describe("parseSSE", () => {
  it("extrahiert content-Deltas", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"Hi"}}]}\n');
    expect(r.content).toEqual(["Hi"]);
    expect(r.done).toBe(false);
  });
  it("trennt reasoning_content vom content", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"reasoning_content":"denk"}}]}\n');
    expect(r.reasoning).toEqual(["denk"]);
    expect(r.content).toEqual([]);
  });
  it("markiert [DONE] und puffert unvollständige letzte Zeile", () => {
    const r = parseSSE('data: [DONE]\ndata: {"choices":[{"delta":');
    expect(r.done).toBe(true);
    expect(r.rest).toBe('data: {"choices":[{"delta":');
  });
});
```

  And `tests/think.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ThinkSplitter } from "../src/vendor/kit/think";

describe("ThinkSplitter", () => {
  it("zieht <think>…</think> in den reasoning-Kanal", () => {
    const s = new ThinkSplitter();
    const a = s.push("Vor<think>ge");
    const b = s.push("dacht</think>Nach");
    expect(a.content + b.content).toBe("VorNach");
    expect(a.reasoning + b.reasoning).toBe("gedacht");
  });
  it("puffert über push-Grenzen gesplittete Tags", () => {
    const s = new ThinkSplitter();
    const a = s.push("A<thi");
    const b = s.push("nk>x</think>B");
    expect(a.content + b.content).toBe("AB");
    expect(b.reasoning).toBe("x");
  });
});
```

- [ ] **Step 3: Run tests** — `npm test -- sse-parse think` → Expected: PASS.
- [ ] **Step 4: Verify purity** — `npm run check:pure` → Expected: no output, exit 0.
- [ ] **Step 5: Commit** — `git add src/vendor/kit tests/sse-parse.test.ts tests/think.test.ts && git commit -m "feat(llm): vendor pure Kit-Module (sse/endpoint/reasoning/think)"`

---

## Task 2: Transport `streamSSE` (XHR)

**Files:**
- Create: `src/obsidian/sse.ts`
- Test: `tests/streamSSE.test.ts`

**Interfaces:**
- Consumes: `parseSSE` (Task 1), `ThinkSplitter` (Task 1).
- Produces: `streamSSE(url, init, onContent, onReasoning, signal?): Promise<{ content: string; reasoning: string; model: string }>` mit `init: { method: string; headers: Record<string,string>; body: string }`.

- [ ] **Step 1: Copy transport** from `vault-rag/src/sse.ts` verbatim into `src/obsidian/sse.ts`, but fix imports to yijing paths:
  - `import { ThinkSplitter } from "../vendor/kit/think";`
  - `import { parseSSE } from "../vendor/kit/sse";`
  (Full body = the vault-rag `streamSSE` implementation; uses `XMLHttpRequest`, no `obsidian` import.)

- [ ] **Step 2: Write failing test** `tests/streamSSE.test.ts` with a fake XHR:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { streamSSE } from "../src/obsidian/sse";

class FakeXHR {
  status = 200; responseText = ""; onprogress: any; onload: any; onerror: any; onabort: any;
  method = ""; url = "";
  open(m: string, u: string) { this.method = m; this.url = u; }
  setRequestHeader() {}
  send() {
    // Zwei Deltas + DONE in einem load-Zyklus.
    this.responseText =
      'data: {"model":"m","choices":[{"delta":{"content":"Hallo"}}]}\n' +
      'data: {"choices":[{"delta":{"reasoning_content":"denk"}}]}\n' +
      'data: [DONE]\n';
    this.onprogress?.(); this.onload?.();
  }
  abort() { this.onabort?.(); }
}

beforeEach(() => { (globalThis as any).XMLHttpRequest = FakeXHR; });
afterEach(() => { delete (globalThis as any).XMLHttpRequest; });

describe("streamSSE", () => {
  it("ruft onContent/onReasoning und akkumuliert", async () => {
    const content: string[] = []; const reasoning: string[] = [];
    const r = await streamSSE("http://x/v1/chat/completions",
      { method: "POST", headers: {}, body: "{}" },
      t => content.push(t), t => reasoning.push(t));
    expect(r.content).toBe("Hallo");
    expect(r.reasoning).toBe("denk");
    expect(r.model).toBe("m");
    expect(content.join("")).toBe("Hallo");
    expect(reasoning.join("")).toBe("denk");
  });
});
```

- [ ] **Step 2b: Run to verify FAIL** — `npm test -- streamSSE` → Expected: FAIL (module resolves once file exists; if copy done, PASS — acceptable, TDD spirit satisfied by the fake-XHR contract).
- [ ] **Step 3: Run test** — `npm test -- streamSSE` → Expected: PASS.
- [ ] **Step 4: Commit** — `git add src/obsidian/sse.ts tests/streamSSE.test.ts && git commit -m "feat(llm): streamSSE XHR-Transport (aus vault-rag)"`

---

## Task 3: `ChatClient` mit injiziertem `httpGet`

**Files:**
- Create: `src/obsidian/chat-client.ts`
- Test: `tests/chat-client.test.ts`

**Interfaces:**
- Consumes: `streamSSE` (Task 2), `normalizeEndpoint`, `suppressParams` (Task 1).
- Produces:
  - `interface ChatMessage { role: "system"|"user"|"assistant"; content: string; reasoning?: string }`
  - `type HttpGet = (url: string) => Promise<{ status: number; json: unknown }>`
  - `class ChatClient { constructor(endpoint: string, model: string, httpGet: HttpGet); listModels(): Promise<string[]>; stream(messages: ChatMessage[], onContent: (t:string)=>void, onReasoning: (t:string)=>void, signal?: AbortSignal, opts?: { model?: string; suppressThinking?: boolean }): Promise<{ content: string; reasoning: string }> }`

- [ ] **Step 1: Write failing test** `tests/chat-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ChatClient } from "../src/obsidian/chat-client";

describe("ChatClient.listModels", () => {
  it("parst /v1/models .data[].id sortiert", async () => {
    const httpGet = async (url: string) => {
      expect(url).toBe("http://h:1234/v1/models");
      return { status: 200, json: { data: [{ id: "qwen" }, { id: "gemma" }] } };
    };
    const c = new ChatClient("http://h:1234/v1/", "qwen", httpGet);
    expect(await c.listModels()).toEqual(["gemma", "qwen"]);
  });
  it("liefert [] bei nicht-200", async () => {
    const c = new ChatClient("http://h:1234", "m", async () => ({ status: 500, json: null }));
    expect(await c.listModels()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- chat-client` → Expected: FAIL "Cannot find module".
- [ ] **Step 3: Implement** `src/obsidian/chat-client.ts`:

```ts
import { streamSSE } from "./sse";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { suppressParams } from "../vendor/kit/reasoning";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; reasoning?: string }
export type HttpGet = (url: string) => Promise<{ status: number; json: unknown }>;

export class ChatClient {
  private endpoint: string;
  constructor(endpoint: string, private model: string, private httpGet: HttpGet) {
    this.endpoint = normalizeEndpoint(endpoint);
  }

  async listModels(): Promise<string[]> {
    try {
      const { status, json } = await this.httpGet(`${this.endpoint}/v1/models`);
      if (status !== 200) return [];
      const j = json as { data?: { id?: string }[] };
      return (j.data ?? []).map(m => m.id).filter((x): x is string => typeof x === "string").sort();
    } catch { return []; }
  }

  async stream(
    messages: ChatMessage[],
    onContent: (t: string) => void,
    onReasoning: (t: string) => void,
    signal?: AbortSignal,
    opts?: { model?: string; suppressThinking?: boolean },
  ): Promise<{ content: string; reasoning: string }> {
    const body = JSON.stringify({
      model: opts?.model ?? this.model,
      messages,
      stream: true,
      ...suppressParams(opts?.suppressThinking ?? false),
    });
    const { content, reasoning } = await streamSSE(
      `${this.endpoint}/v1/chat/completions`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      onContent, onReasoning, signal,
    );
    return { content, reasoning };
  }
}
```

- [ ] **Step 4: Run test** — `npm test -- chat-client` → Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/obsidian/chat-client.ts tests/chat-client.test.ts && git commit -m "feat(llm): ChatClient (listModels/stream, injiziertes httpGet)"`

---

## Task 4: obsidian HTTP-Adapter (`http.ts`)

**Files:**
- Create: `src/obsidian/http.ts`

**Interfaces:**
- Consumes: `classifyEndpointStatus` (Task 1), obsidian `requestUrl`.
- Produces: `httpGet(url: string): Promise<{ status: number; json: unknown }>` (Typ passt zu `HttpGet`); `probeEndpoint(baseUrl: string, timeoutMs?: number): Promise<EndpointStatus>`.

Reines I/O-Adaptermodul (importiert `obsidian`, liegt in `src/obsidian/` → nicht `check:pure`-gated, kein Unit-Test).

- [ ] **Step 1: Implement** `src/obsidian/http.ts` — angelehnt an `vault-rag/src/http.ts`:

```ts
import { requestUrl } from "obsidian";
import { classifyEndpointStatus, type EndpointStatus } from "../vendor/kit/endpoint_diagnostics";

export async function httpGet(url: string): Promise<{ status: number; json: unknown }> {
  const r = await requestUrl({ url, throw: false });
  let json: unknown = undefined;
  try { json = r.json; } catch { /* nicht-JSON */ }
  return { status: r.status, json };
}

export async function probeEndpoint(baseUrl: string, timeoutMs = 5000): Promise<EndpointStatus> {
  const url = `${baseUrl}/v1/models`;
  let timer: number | undefined;
  const timeout = new Promise<"__timeout__">(resolve => {
    timer = window.setTimeout(() => resolve("__timeout__"), timeoutMs);
  });
  try {
    const raced = await Promise.race([
      requestUrl({ url, throw: false }).then(r => {
        let body: unknown = undefined;
        try { body = r.json; } catch { /* nicht-JSON */ }
        return { status: r.status, body } as const;
      }),
      timeout,
    ]);
    if (raced === "__timeout__") return classifyEndpointStatus({ kind: "timeout" });
    return classifyEndpointStatus({ kind: "response", status: raced.status, body: raced.body });
  } catch (e) {
    const message = String((e as { message?: string })?.message ?? e);
    return classifyEndpointStatus({ kind: "error", message });
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → Expected: PASS (verify `EndpointStatus` shape matches vendored `endpoint_diagnostics.ts`; if `classifyEndpointStatus` input union differs, align to the vendored signature).
- [ ] **Step 3: Commit** — `git add src/obsidian/http.ts && git commit -m "feat(llm): obsidian HTTP-Adapter (httpGet/probeEndpoint via requestUrl)"`

---

## Task 5: Default-System-Prompts (`defaults.ts`)

**Files:**
- Create: `src/core/llm/defaults.ts`
- Test: `tests/defaults.test.ts`

**Interfaces:**
- Consumes: `type Lang` from `../data`.
- Produces: `DEFAULT_SYSTEM_PROMPT: Record<Lang, string>`.

- [ ] **Step 1: Write failing test** `tests/defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SYSTEM_PROMPT } from "../src/core/llm/defaults";

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("hat nicht-leere de/en Prompts", () => {
    expect(DEFAULT_SYSTEM_PROMPT.de.length).toBeGreaterThan(50);
    expect(DEFAULT_SYSTEM_PROMPT.en.length).toBeGreaterThan(50);
  });
  it("weist auf die Yijing-/I-Ging-Deutung hin", () => {
    expect(DEFAULT_SYSTEM_PROMPT.de.toLowerCase()).toMatch(/i ging|yijing|hexagramm/);
    expect(DEFAULT_SYSTEM_PROMPT.en.toLowerCase()).toMatch(/i ching|yijing|hexagram/);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- defaults` → Expected: FAIL "Cannot find module".
- [ ] **Step 3: Implement** `src/core/llm/defaults.ts` — DE/EN-Prompt, der eine strukturierte, einfühlsame Deutung (Ursprungshexagramm → wandelnde Linien → Zielhexagramm → praktischer Rat) verlangt, das gewählte Register achtet und in der Reading-Sprache antwortet:

```ts
import { type Lang } from "../data";

export const DEFAULT_SYSTEM_PROMPT: Record<Lang, string> = {
  de: `Du bist ein kundiger, einfühlsamer Deuter des I Ging (Yijing).
Deute den vorgelegten Wurf strukturiert: (1) das Ursprungshexagramm und die Situation,
(2) die wandelnden Linien als Dynamik der Veränderung, (3) das Zielhexagramm als Tendenz,
(4) einen konkreten, praktischen Rat mit Bezug zur Frage.
Antworte auf Deutsch, in ruhigem, klarem Ton ohne esoterisches Pathos, und beziehe dich auf
die mitgelieferten Wilhelm-Texte. Erfinde keine Linien oder Hexagramme hinzu.`,
  en: `You are a knowledgeable, empathetic interpreter of the I Ching (Yijing).
Interpret the given casting in a structured way: (1) the primary hexagram and the situation,
(2) the changing lines as the dynamic of change, (3) the resulting hexagram as tendency,
(4) concrete, practical advice relating to the question.
Answer in English, in a calm, clear tone without esoteric pathos, grounded in the provided
Wilhelm texts. Do not invent lines or hexagrams.`,
};
```

- [ ] **Step 4: Run test** — `npm test -- defaults` → Expected: PASS.
- [ ] **Step 5: Verify purity** — `npm run check:pure` → Expected: exit 0.
- [ ] **Step 6: Commit** — `git add src/core/llm/defaults.ts tests/defaults.test.ts && git commit -m "feat(llm): Default-System-Prompts DE/EN"`

---

## Task 6: Prompt-Bau (`prompt.ts`)

**Files:**
- Create: `src/core/llm/prompt.ts`
- Test: `tests/prompt.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` from `../../obsidian/chat-client` (type-only import — `import type`, kein Runtime-obsidian), `type Lang` from `../data`, `RenderedReading` from `../render`.
- Produces: `buildInterpretationMessages(input: { rendered: RenderedReading; question: string; lang: Lang; systemPrompt: string }): ChatMessage[]`.

> Hinweis: `import type { ChatMessage }` aus `../../obsidian/chat-client` ist erlaubt — `chat-client.ts` importiert kein `obsidian`, und ein type-only-Import erzeugt keinen Runtime-Pfad. Falls `check:pure` je auf type-Importe anschlägt (tut es nicht — es grept `from 'obsidian'`), `ChatMessage` nach `src/core/llm/types.ts` ziehen.

- [ ] **Step 1: Write failing test** `tests/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildInterpretationMessages } from "../src/core/llm/prompt";
import type { RenderedReading } from "../src/core/render";

const rendered: RenderedReading = {
  title: "䷀ 1 · Das Schöpferische",
  frontmatter: "",
  body: "# ䷀ 1 · Das Schöpferische\n\n## Das Urteil\n\nErhabenes Gelingen.\n",
  previewBody: "## Das Urteil\n\nErhabenes Gelingen.\n",
};

describe("buildInterpretationMessages", () => {
  it("baut system + user, user enthält den Reading-Body", () => {
    const msgs = buildInterpretationMessages({ rendered, question: "Wohin?", lang: "de", systemPrompt: "SYS" });
    expect(msgs[0]).toEqual({ role: "system", content: "SYS" });
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("Erhabenes Gelingen.");
    expect(msgs[1].content).toContain("Wohin?");
  });
  it("lässt den Frage-Teil weg, wenn keine Frage", () => {
    const msgs = buildInterpretationMessages({ rendered, question: "", lang: "de", systemPrompt: "SYS" });
    expect(msgs[1].content).not.toMatch(/Frage:/);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- prompt` → Expected: FAIL.
- [ ] **Step 3: Implement** `src/core/llm/prompt.ts`:

```ts
import type { ChatMessage } from "../../obsidian/chat-client";
import type { RenderedReading } from "../render";
import { type Lang } from "../data";

const USER_LABEL: Record<Lang, { intro: string; question: string; ask: string }> = {
  de: { intro: "Hier ist der Wurf:", question: "Frage:", ask: "Bitte deute diesen Wurf." },
  en: { intro: "Here is the casting:", question: "Question:", ask: "Please interpret this casting." },
};

export function buildInterpretationMessages(input: {
  rendered: RenderedReading;
  question: string;
  lang: Lang;
  systemPrompt: string;
}): ChatMessage[] {
  const L = USER_LABEL[input.lang];
  const q = input.question.trim();
  const parts = [L.intro, "", input.rendered.body.trim()];
  if (q) parts.push("", `${L.question} ${q}`);
  parts.push("", L.ask);
  return [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: parts.join("\n") },
  ];
}
```

- [ ] **Step 4: Run test** — `npm test -- prompt` → Expected: PASS.
- [ ] **Step 5: check:pure** → exit 0. **Commit** — `git add src/core/llm/prompt.ts tests/prompt.test.ts && git commit -m "feat(llm): Prompt-Bau aus Reading + Frage"`

---

## Task 7: Callout-Helper (`callout.ts`)

**Files:**
- Create: `src/core/llm/callout.ts`
- Test: `tests/callout.test.ts`

**Interfaces:**
- Produces: `wrapCallout(title: string, body: string, type: string, open: boolean): string`.

- [ ] **Step 1: Write failing test** `tests/callout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wrapCallout } from "../src/core/llm/callout";

describe("wrapCallout", () => {
  it("baut geschlossenen Callout mit zeilen-geprefixtem Body", () => {
    expect(wrapCallout("Denkprozess", "Zeile 1\nZeile 2", "note", false))
      .toBe("> [!note]- Denkprozess\n> Zeile 1\n> Zeile 2");
  });
  it("offener Callout mit +", () => {
    expect(wrapCallout("T", "x", "quote", true)).toBe("> [!quote]+ T\n> x");
  });
  it("erhält Leerzeilen als '>'-Zeilen (Callout-Kontinuität)", () => {
    expect(wrapCallout("T", "a\n\nb", "note", false)).toBe("> [!note]- T\n> a\n>\n> b");
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- callout` → Expected: FAIL.
- [ ] **Step 3: Implement** `src/core/llm/callout.ts`:

```ts
/** Wickelt einen Body in einen Obsidian-Callout. Jede Body-Zeile wird mit "> " geprefixt;
 *  Leerzeilen werden zu ">" (ohne Space), damit der Callout nicht abbricht. */
export function wrapCallout(title: string, body: string, type: string, open: boolean): string {
  const marker = open ? "+" : "-";
  const head = `> [!${type}]${marker} ${title}`.trimEnd();
  const lines = body.split("\n").map(l => (l.length === 0 ? ">" : `> ${l}`));
  return [head, ...lines].join("\n");
}
```

- [ ] **Step 4: Run test** — `npm test -- callout` → Expected: PASS.
- [ ] **Step 5: check:pure** → exit 0. **Commit** — `git add src/core/llm/callout.ts tests/callout.test.ts && git commit -m "feat(llm): wrapCallout-Helper (pure)"`

---

## Task 8: Deutungs-Block rendern (`interpretation.ts`)

**Files:**
- Create: `src/core/llm/interpretation.ts`
- Test: `tests/interpretation.test.ts`

**Interfaces:**
- Consumes: `wrapCallout` (Task 7), `type Lang` from `../data`.
- Produces:
  - `type ThinkingInNote = "closed-callout" | "open-callout" | "text" | "none"`
  - `interface InterpretationData { answer: string; reasoning: string }`
  - `renderInterpretationBlock(data: InterpretationData, opts: { lang: Lang; thinkingInNote: ThinkingInNote }): string` — der reine Inhalt (Heading „KI-Deutung" + Antwort + optional Reasoning), OHNE Marker.

- [ ] **Step 1: Write failing test** `tests/interpretation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderInterpretationBlock } from "../src/core/llm/interpretation";

const data = { answer: "Das Urteil ist günstig.", reasoning: "Ich prüfe Trigramme." };

describe("renderInterpretationBlock", () => {
  it("closed-callout: Antwort + geschlossener note-Callout", () => {
    const md = renderInterpretationBlock(data, { lang: "de", thinkingInNote: "closed-callout" });
    expect(md).toContain("## KI-Deutung");
    expect(md).toContain("Das Urteil ist günstig.");
    expect(md).toContain("> [!note]- Denkprozess");
    expect(md).toContain("> Ich prüfe Trigramme.");
  });
  it("none: kein Reasoning", () => {
    const md = renderInterpretationBlock(data, { lang: "de", thinkingInNote: "none" });
    expect(md).not.toContain("Denkprozess");
    expect(md).not.toContain("Ich prüfe Trigramme.");
  });
  it("text: Reasoning als ###-Abschnitt", () => {
    const md = renderInterpretationBlock(data, { lang: "de", thinkingInNote: "text" });
    expect(md).toContain("### Denkprozess");
    expect(md).toContain("Ich prüfe Trigramme.");
    expect(md).not.toContain("[!note]");
  });
  it("leeres Reasoning → nie ein Reasoning-Teil, egal welcher Modus", () => {
    const md = renderInterpretationBlock({ answer: "A", reasoning: "" }, { lang: "de", thinkingInNote: "closed-callout" });
    expect(md).not.toContain("Denkprozess");
  });
  it("en: englische Labels", () => {
    const md = renderInterpretationBlock(data, { lang: "en", thinkingInNote: "closed-callout" });
    expect(md).toContain("## AI Interpretation");
    expect(md).toContain("> [!note]- Reasoning");
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- interpretation` → Expected: FAIL.
- [ ] **Step 3: Implement** `src/core/llm/interpretation.ts`:

```ts
import { wrapCallout } from "./callout";
import { type Lang } from "../data";

export type ThinkingInNote = "closed-callout" | "open-callout" | "text" | "none";
export interface InterpretationData { answer: string; reasoning: string }

const LABELS: Record<Lang, { head: string; reasoning: string }> = {
  de: { head: "KI-Deutung", reasoning: "Denkprozess" },
  en: { head: "AI Interpretation", reasoning: "Reasoning" },
};

export function renderInterpretationBlock(
  data: InterpretationData,
  opts: { lang: Lang; thinkingInNote: ThinkingInNote },
): string {
  const L = LABELS[opts.lang];
  const parts = [`## ${L.head}`, data.answer.trim()];
  const reasoning = data.reasoning.trim();
  if (reasoning && opts.thinkingInNote !== "none") {
    if (opts.thinkingInNote === "text") {
      parts.push(`### ${L.reasoning}`, reasoning);
    } else {
      parts.push(wrapCallout(L.reasoning, reasoning, "note", opts.thinkingInNote === "open-callout"));
    }
  }
  return parts.join("\n\n");
}
```

- [ ] **Step 4: Run test** — `npm test -- interpretation` → Expected: PASS.
- [ ] **Step 5: check:pure** → exit 0. **Commit** — `git add src/core/llm/interpretation.ts tests/interpretation.test.ts && git commit -m "feat(llm): Deutungs-Block rendern (Reasoning-Modi)"`

---

## Task 9: Marker-Insert (`insert.ts`)

**Files:**
- Create: `src/core/llm/insert.ts`
- Test: `tests/insert.test.ts`

**Interfaces:**
- Produces:
  - `MARKER_START = "<!-- yijing:deutung:start -->"`, `MARKER_END = "<!-- yijing:deutung:end -->"`
  - `insertInterpretation(body: string, block: string): string` — ersetzt Inhalt zwischen den Markern; fehlen sie, Marker+Block vor der ersten `##`-Überschrift einfügen; fehlt auch die, ans Ende anhängen.

- [ ] **Step 1: Write failing test** `tests/insert.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { insertInterpretation, MARKER_START, MARKER_END } from "../src/core/llm/insert";

const block = "## KI-Deutung\n\nHallo.";

describe("insertInterpretation", () => {
  it("füllt ein leeres Marker-Paar", () => {
    const body = `# T\n\n${MARKER_START}\n${MARKER_END}\n## Das Urteil\n\nX`;
    const out = insertInterpretation(body, block);
    expect(out).toContain(`${MARKER_START}\n${block}\n${MARKER_END}`);
    expect(out).toContain("## Das Urteil");
    expect(out.indexOf("KI-Deutung")).toBeLessThan(out.indexOf("Das Urteil"));
  });
  it("ersetzt idempotent (Re-Deutung)", () => {
    const body = `${MARKER_START}\n## KI-Deutung\n\nALT\n${MARKER_END}\n## Das Urteil`;
    const out = insertInterpretation(body, block);
    expect(out).not.toContain("ALT");
    expect(out).toContain("Hallo.");
    expect((out.match(new RegExp(MARKER_START, "g")) ?? []).length).toBe(1);
  });
  it("Fallback: keine Marker → vor erster ##-Überschrift einfügen", () => {
    const body = `# T\n\n## Das Urteil\n\nX`;
    const out = insertInterpretation(body, block);
    expect(out.indexOf("KI-Deutung")).toBeLessThan(out.indexOf("Das Urteil"));
    expect(out).toContain(MARKER_START);
  });
  it("Fallback: keine ##-Überschrift → ans Ende", () => {
    const out = insertInterpretation("# T\n\nnur Text", block);
    expect(out).toContain(MARKER_START);
    expect(out.trim().endsWith(MARKER_END)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- insert` → Expected: FAIL.
- [ ] **Step 3: Implement** `src/core/llm/insert.ts`:

```ts
export const MARKER_START = "<!-- yijing:deutung:start -->";
export const MARKER_END = "<!-- yijing:deutung:end -->";

/** Setzt/ersetzt den Deutungs-Block zwischen den Markern. Reihenfolge:
 *  1) Marker vorhanden → Inhalt dazwischen ersetzen.
 *  2) sonst vor der ersten "## "-Überschrift Marker+Block einsetzen.
 *  3) sonst ans Ende anhängen. */
export function insertInterpretation(body: string, block: string): string {
  const wrapped = `${MARKER_START}\n${block}\n${MARKER_END}`;
  const s = body.indexOf(MARKER_START);
  const e = body.indexOf(MARKER_END);
  if (s !== -1 && e !== -1 && e > s) {
    return body.slice(0, s) + wrapped + body.slice(e + MARKER_END.length);
  }
  const lines = body.split("\n");
  const idx = lines.findIndex(l => l.startsWith("## "));
  if (idx !== -1) {
    const before = lines.slice(0, idx).join("\n").replace(/\n*$/, "\n\n");
    const after = lines.slice(idx).join("\n");
    return `${before}${wrapped}\n\n${after}`;
  }
  return body.replace(/\n*$/, "\n\n") + wrapped;
}
```

- [ ] **Step 4: Run test** — `npm test -- insert` → Expected: PASS.
- [ ] **Step 5: check:pure** → exit 0. **Commit** — `git add src/core/llm/insert.ts tests/insert.test.ts && git commit -m "feat(llm): Marker-basiertes Deutung-Insert (idempotent)"`

---

## Task 10: `render.ts` — Marker vor erstem Wurf-Abschnitt

**Files:**
- Modify: `src/core/render.ts` (Body-Zusammenbau, ~Zeile 102-135)
- Test: `tests/render.test.ts` (Ergänzung)

**Interfaces:**
- Consumes: `MARKER_START`, `MARKER_END` (Task 9).
- Produces: `body` enthält `MARKER_START\nMARKER_END` unmittelbar vor dem ersten `##`-Abschnitt; `previewBody` bleibt unverändert (keine Marker).

- [ ] **Step 1: Write failing test** — Ergänzung in `tests/render.test.ts`:

```ts
import { MARKER_START, MARKER_END } from "../src/core/llm/insert";
// … innerhalb describe("renderReading"):
it("bettet ein leeres Deutungs-Marker-Paar vor dem ersten ## ein (nur body)", () => {
  const r = renderReading(/* bestehendes Reading-Fixture */ sampleReading, {
    lang: "de", register: "neutral", date: "2026-07-12T10:00",
    question: "", includeFrontmatter: false, frontmatterFields: [],
  });
  const mi = r.body.indexOf(MARKER_START);
  const hi = r.body.indexOf("## ");
  expect(mi).toBeGreaterThan(-1);
  expect(r.body.indexOf(MARKER_END)).toBeGreaterThan(mi);
  expect(mi).toBeLessThan(hi);              // Marker vor erstem ##
  expect(r.previewBody).not.toContain(MARKER_START);  // Vorschau ohne Marker
});
```
(Vorhandenes `sampleReading`-Fixture aus der Datei wiederverwenden; sonst per `buildReading` erzeugen wie die bestehenden Tests.)

- [ ] **Step 2: Run to verify FAIL** — `npm test -- render` → Expected: FAIL (kein Marker im body).
- [ ] **Step 3: Implement** — in `render.ts`: Import ergänzen `import { MARKER_START, MARKER_END } from "./llm/insert";`. Den `content`-Aufbau so ändern, dass das Marker-Paar als erstes Element VOR `## Das Urteil` steht — d.h. direkt nach dem optionalen Meta-`> …`-Block:

```ts
  // nach: if (meta.length > 0) content.push(`> ${meta.join("   ·   ")}`);
  content.push(`${MARKER_START}\n${MARKER_END}`);   // Deutungs-Anker (leer) — nur im Note-body
```
Da `previewBody = content.join("\n\n")` die Marker sonst mit-enthielte, den Marker NICHT in `content` legen, sondern nur in den `body` einsetzen. Konkret: `content` unverändert lassen und stattdessen den Marker beim `body`-Join einfügen:

```ts
  const anchor = `${MARKER_START}\n${MARKER_END}`;
  const bodyContent = [anchor, ...content];   // Marker führt den Wurf-Inhalt an
  return {
    title, frontmatter,
    body: [titleLine, subtitleLine, ...bodyContent].join("\n\n") + "\n",
    previewBody: content.join("\n\n") + "\n",   // ohne Marker
  };
```
Damit steht der Anker zwischen Untertitel/Meta und `## Das Urteil`. (Der Meta-`> …`-Block ist Teil von `content`; soll der Anker UNTER die Meta-Zeile, Meta vor dem Join aus `content` herauslösen. Für v2 genügt: Anker vor `content` → er liegt vor der Meta-Zeile, was ebenfalls „erster `##`"-tauglich ist, da `insert` am Marker ansetzt, nicht an `##`.)

- [ ] **Step 4: Run test** — `npm test -- render` → Expected: PASS. Falls bestehende render-Snapshots/Asserts brechen: an das neue body-Layout anpassen (Marker sind erwartet).
- [ ] **Step 5: check:pure** → exit 0. **Commit** — `git add src/core/render.ts tests/render.test.ts && git commit -m "feat(llm): Deutungs-Marker im Note-body (render.ts)"`

---

## Task 11: Settings — `llm`-Konfiguration + UI

**Files:**
- Modify: `src/obsidian/settings.ts` (PluginSettings, DEFAULT_SETTINGS, SettingsTab.display)
- Modify: `src/main.ts` (merge-guard für `llm`)
- Modify: `src/i18n/strings.ts` (neue Keys)
- Test: `tests/settings-defaults.test.ts` (nur Default-Shape, pure)

**Interfaces:**
- Consumes: `parseEndpointList`, `ENDPOINT_PRESETS` (Task 1), `probeEndpoint`, `httpGet` (Task 4), `ChatClient` (Task 3), `ThinkingInNote` (Task 8), `DEFAULT_SYSTEM_PROMPT` (Task 5).
- Produces: `PluginSettings.llm: LlmSettings` mit:

```ts
export interface LlmSettings {
  endpoints: string;        // Textarea, eine URL pro Zeile
  activeEndpoint: string;   // eine der Zeilen (normalisiert)
  apiKey: string;
  model: string;
  systemPromptDe: string;   // "" → DEFAULT_SYSTEM_PROMPT.de
  systemPromptEn: string;
  requestThinking: boolean;
  thinkingInNote: ThinkingInNote;
}
```

- [ ] **Step 1: Extend types + defaults** in `settings.ts`:

```ts
import { type ThinkingInNote } from "../core/llm/interpretation";
// … LlmSettings interface (siehe oben) …
export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  endpoints: "http://localhost:1234",
  activeEndpoint: "http://localhost:1234",
  apiKey: "",
  model: "",
  systemPromptDe: "",
  systemPromptEn: "",
  requestThinking: true,
  thinkingInNote: "closed-callout",
};
```
`PluginSettings` um `llm: LlmSettings` erweitern, `DEFAULT_SETTINGS.llm = DEFAULT_LLM_SETTINGS`.

- [ ] **Step 2: merge-guard** in `main.ts` onload, nach dem bestehenden `frontmatterFields`-Guard:

```ts
this.settings.llm = { ...DEFAULT_LLM_SETTINGS, ...(this.settings.llm ?? {}) };
```
(Import `DEFAULT_LLM_SETTINGS` aus `./obsidian/settings`.)

- [ ] **Step 3: Default-Shape-Test** `tests/settings-defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_LLM_SETTINGS } from "../src/obsidian/settings";
```
> ACHTUNG: `settings.ts` importiert `obsidian` → dieser Test bräuchte einen Mock. Da kein Mock existiert, `DEFAULT_LLM_SETTINGS` stattdessen in eine pure Datei `src/core/llm/settings-defaults.ts` auslagern und von dort testen + in `settings.ts` re-exportieren. Test importiert die pure Datei:

```ts
import { DEFAULT_LLM_SETTINGS } from "../src/core/llm/settings-defaults";
describe("DEFAULT_LLM_SETTINGS", () => {
  it("hat sinnvolle Defaults", () => {
    expect(DEFAULT_LLM_SETTINGS.requestThinking).toBe(true);
    expect(DEFAULT_LLM_SETTINGS.thinkingInNote).toBe("closed-callout");
    expect(DEFAULT_LLM_SETTINGS.model).toBe("");
  });
});
```
→ `src/core/llm/settings-defaults.ts` enthält `LlmSettings` + `DEFAULT_LLM_SETTINGS` (pure, kein obsidian); `settings.ts` importiert & re-exportiert. Run: `npm test -- settings-defaults` → PASS.

- [ ] **Step 4: i18n-Keys** in `strings.ts` ergänzen (DE+EN), analog bestehender Keys: `set.llmHead`, `set.llmEndpoints`/`Desc`, `set.llmActive`, `set.llmApiKey`, `set.llmModel`/`Desc`, `set.llmLoadModels`, `set.llmModelOffline`, `set.llmTest`, `set.llmSysDe`, `set.llmSysEn`, `set.llmReset`, `set.llmThinking`/`Desc`, `set.llmThinkNote`/`Desc`, plus Dropdown-Labels `set.thinkClosed/Open/Text/None`.

- [ ] **Step 5: Settings-UI** in `SettingsTab.display()` — neuer Heading-Block `set.llmHead`. Umsetzung (kein Test — obsidian-UI):
  - **Endpunkte:** `addTextArea` gebunden an `s.llm.endpoints` (onChange → `parseEndpointList` zur Validierung, speichern roh). Darunter ein Dropdown `activeEndpoint`, Optionen = `parseEndpointList(s.llm.endpoints)`. „Testen"-Button → `probeEndpoint(normalizeEndpoint(s.llm.activeEndpoint))` → `new Notice(status.message)`.
  - **API-Key:** `addText` (optional).
  - **Modell:** Muster aus `vault-rag/src/settings.ts` (Zeile ~465): `new ChatClient(s.llm.activeEndpoint, s.llm.model, httpGet).listModels().then(models => …)` → bei Treffern Dropdown (aktuelles Modell einschließen), sonst Textfeld + Desc `set.llmModelOffline`; „Modelle laden"-Button → `this.display()`.
  - **System-Prompt DE/EN:** zwei `addTextArea`, Platzhalter = `DEFAULT_SYSTEM_PROMPT.de/en`, leer = Default; je ein Reset-Button (`extraButton`, Icon „rotate-ccw") der auf `""` setzt + `this.display()`.
  - **Thinking anfordern:** `addToggle` an `s.llm.requestThinking`.
  - **Thinking → Note:** `addDropdown` an `s.llm.thinkingInNote` mit den vier Optionen.
  - Jeder onChange: `await this.host.saveSettings()`.

- [ ] **Step 6: Gate-Teillauf** — `npm run typecheck && npm run lint && npm test -- settings-defaults && npm run check:pure` → Expected: alle grün.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(llm): Settings (Endpunkte/Modell/System-Prompt/Thinking) + i18n"`

---

## Task 12: Panel-Integration (`view.ts`)

**Files:**
- Modify: `src/obsidian/view.ts`
- Modify: `src/i18n/strings.ts` (`view.interpret`, `view.interpreting`, `view.cancel`, `view.saveInterpretation`, `notice.noEndpoint`, `notice.llmError`, `notice.noInterpretation`)

**Interfaces:**
- Consumes: `ChatClient` (Task 3), `httpGet` (Task 4), `buildInterpretationMessages` (Task 6), `resolveReadingLang`, `DEFAULT_SYSTEM_PROMPT` (Task 5), `LlmSettings`.
- Produces: `CurrentCast.interpretation?: { answer: string; reasoning: string; model: string } | null`; das Panel zeigt Deutungs-Button + Live-Stream; `OracleHost` erhält Zugriff auf `settings.llm`.

- [ ] **Step 1: `CurrentCast` erweitern** um `interpretation?: { answer: string; reasoning: string; model: string } | null`. In `doCast()` und `restoreFromNote()` auf `null` setzen (neuer Wurf/Restore hat noch keine Deutung).

- [ ] **Step 2: State-Felder** in `OracleView`: `private streaming = false; private abortCtrl: AbortController | null = null;`

- [ ] **Step 3: Deutungs-UI** — in `renderCurrent()` nach der Markdown-Vorschau, vor den Speicher-Aktionen, einen Block rendern:
  - Ist `streaming` false und keine Deutung: Button `view.interpret` („Deutung erzeugen").
  - Ist `streaming`: Button `view.cancel` (→ `this.abortCtrl?.abort()`), plus Live-Container.
  - Existiert `c.interpretation`: `<details>` (reasoning, dimmed, zu) + gerenderte Antwort (via `MarkdownRenderer.render`), plus Button `view.saveInterpretation`.

- [ ] **Step 4: `generateInterpretation()`** implementieren:

```ts
private async generateInterpretation(): Promise<void> {
  const c = this.current;
  if (!c || this.streaming) return;
  const llm = this.host.settings.llm;
  const endpoint = llm.activeEndpoint.trim();
  if (!endpoint || !llm.model.trim()) { new Notice(t("notice.noEndpoint")); return; }

  const lang = this.host.resolveReadingLang();
  const systemPrompt = (lang === "de" ? llm.systemPromptDe : llm.systemPromptEn).trim()
    || DEFAULT_SYSTEM_PROMPT[lang];
  const messages = buildInterpretationMessages({ rendered: c.rendered, question: c.question, lang, systemPrompt });

  this.streaming = true;
  this.abortCtrl = new AbortController();
  c.interpretation = { answer: "", reasoning: "", model: llm.model };
  await this.render();

  const client = new ChatClient(endpoint, llm.model, httpGet);
  try {
    const res = await client.stream(
      messages,
      (tok) => { if (c.interpretation) { c.interpretation.answer += tok; this.updateStreamDom(); } },
      (tok) => { if (c.interpretation) { c.interpretation.reasoning += tok; this.updateStreamDom(); } },
      this.abortCtrl.signal,
      { suppressThinking: !llm.requestThinking },
    );
    if (!res.content.trim()) { c.interpretation = null; new Notice(t("notice.noInterpretation")); }
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    c.interpretation = null;
    if (!aborted) { new Notice(t("notice.llmError")); console.error("[yijing-oracle]", e); }
  } finally {
    this.streaming = false;
    this.abortCtrl = null;
    await this.render();
  }
}
```
`updateStreamDom()`: leichter Teil-Update der Live-Container (Antwort + Reasoning-Text setzen), ohne vollen `render()` (sonst flackert der Stream). Minimal: gezielt zwei gehaltene `HTMLElement`-Referenzen (`this.answerEl`, `this.reasoningEl`) `.setText(...)` bzw. re-render der Antwort als Markdown am Stream-Ende. Für v2 genügt Text-Streaming live + einmal Markdown-Render in `render()` nach Abschluss.

- [ ] **Step 5: Save-Deutung** — Button `view.saveInterpretation` ruft `saveCurrent(this.host.settings.defaultOutput)` (Task 13 sorgt dafür, dass die Deutung in den Body kommt). Bereits vorhandene „Als Note/An Cursor"-Buttons bleiben; wenn `interpretation` gesetzt ist, fließt sie automatisch ein (Task 13).

- [ ] **Step 6: `OracleHost`** — `settings.llm` ist über das bestehende `settings`-Feld erreichbar (PluginSettings enthält `llm`). Kein Interface-Change nötig außer ggf. Typ-Weite.

- [ ] **Step 7: Gate-Teillauf** — `npm run typecheck && npm run lint` → grün. (Panel wird im Smoke-Vault manuell verifiziert.)
- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(llm): Panel-Deutung mit Live-Streaming + Abbrechen"`

---

## Task 13: Deutung beim Speichern in den Body einfügen

**Files:**
- Modify: `src/obsidian/reading-writer.ts` (`WriteInput`, `createReadingNote`, append-Fall) + Aufrufer in `view.ts`/`main.ts`
- Modify: `src/core/render.ts` NICHT nötig (Marker schon da).

**Interfaces:**
- Consumes: `renderInterpretationBlock` (Task 8), `insertInterpretation` (Task 9), `ThinkingInNote`.
- Produces: `WriteInput.interpretation?: { answer: string; reasoning: string } | null`; beim Schreiben wird der Deutungs-Block via `insertInterpretation` in `rendered.body` gesetzt, bevor die Note erstellt/aktualisiert wird. Existiert die Ziel-Note schon (gleicher Wurf), wird sie **modifiziert** statt dupliziert.

- [ ] **Step 1: `WriteInput` erweitern** um `interpretation?: { answer: string; reasoning: string } | null;` und `lang: Lang;` (für Labels), `thinkingInNote: ThinkingInNote`.

- [ ] **Step 2: Body-Anreicherung** — in `writeReading`, vor `createReadingNote`, den Body ableiten:

```ts
let body = input.rendered.body;
if (input.interpretation) {
  const block = renderInterpretationBlock(input.interpretation, { lang: input.lang, thinkingInNote: input.thinkingInNote });
  body = insertInterpretation(body, block);
}
```
`createReadingNote` nimmt künftig `body` statt `input.rendered.body`. (Signatur: `createReadingNote(app, input, settings, body)`.)

- [ ] **Step 3: Re-Save auf existierende Note** — wenn im Panel bereits eine Note zu diesem Wurf existiert (z.B. via History-Restore geöffnet), ist „Deutung speichern" ein Update. Für v2 pragmatisch: `writeReading` bekommt einen optionalen `existingFile?: TFile`. Ist er gesetzt, statt `create` → `app.vault.process(existingFile, cur => insertInterpretation(cur, block))` (Marker-basiert idempotent) und **keine** neue Datei. `view.saveCurrent` übergibt `existingFile`, wenn `openHistoryEntry`/vorheriges Speichern eine Datei gemerkt hat (`this.current` um `file?: TFile` erweitern).

- [ ] **Step 4: Aufrufer anpassen** — `view.saveCurrent` und `main.castDirect` übergeben `interpretation` (aus `current.interpretation` bzw. `null`), `lang`, `thinkingInNote: settings.llm.thinkingInNote`.

- [ ] **Step 5: Gate** — `npm run typecheck && npm run lint && npm test && npm run check:pure` → grün.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(llm): Deutung an Marker-Position in die Note schreiben"`

---

## Task 14: Voll-Gate + Smoke-Deploy

**Files:** keine (Verifikation)

- [ ] **Step 1: Voll-Gate** — `npm run gate` → Expected: lint · typecheck · typecheck:test · test · check:pure · check:bundle alle grün. Fehler beheben, bis grün.
- [ ] **Step 2: Deploy in Smoke-Vault** — `OBSIDIAN_PLUGIN_DIR="/Users/Shared/10_ObsidianVaults/yijing-oracle-smoke/.obsidian/plugins/yijing-oracle" npm run deploy`.
- [ ] **Step 3: Manuelle Verifikation** (Handover-Note im Smoke-Vault-Root aktualisieren): Panel öffnen → werfen → „Deutung erzeugen" gegen lokalen Endpunkt (OpenClaw/LM Studio) → Live-Stream sichtbar (Antwort + Reasoning-`<details>`) → „Deutung speichern" → Note enthält `## KI-Deutung` als ersten Abschnitt mit geschlossenem `> [!note]- Denkprozess`-Callout → erneut deuten → idempotenter Ersatz (kein Duplikat). Settings: Endpunkt testen, Modelle laden, Reasoning-Modi durchschalten.
- [ ] **Step 4: Commit** (falls Fixes) — `git add -A && git commit -m "chore(llm): Gate grün + Smoke-Verifikation"`

---

## Self-Review-Notiz (Autor)

- **Spec-Coverage:** Ort/Trigger (T12), Backend OpenAI-only (T3), Reasoning Panel (T12) + Note-Dropdown (T8/T11), Thinking-Toggle (T11), System-Prompt DE/EN (T5/T11), Endpunkte+Test (T11), Modell-Dropdown+Fallback (T11), Platzierung erster `##`/Marker (T9/T10), Re-Deutung idempotent (T9), `wrapCallout` (T7), Fehlerbehandlung (T12) — alle abgedeckt.
- **Offene Umsetzungs-Präzisierung (bewusst):** `updateStreamDom`-Feinschliff (Live-DOM ohne Flackern) ist in T12 als „Text live, Markdown am Ende" pragmatisch fixiert; bei Bedarf verfeinern.
- **Typ-Konsistenz:** `ThinkingInNote`, `InterpretationData`, `ChatMessage`, `HttpGet`, `LlmSettings`, `MARKER_START/END` konsistent über Tasks referenziert.
