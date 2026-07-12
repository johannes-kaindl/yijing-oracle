# yijing-oracle v2 — LLM-Deutung (Design-Spec)

**Datum:** 2026-07-12
**Status:** Design abgenommen (Jay), Umsetzung autonom
**Vorgänger:** `2026-07-12-yijing-oracle-plugin-design.md` (v1)

## Ziel

Im Orakel-Panel eine **KI-Deutung** des aktuellen Wurfs über **lokale** Modelle
(kein Cloud) erzeugen — live gestreamt — und auf Wunsch als Abschnitt in die
Reading-Note schreiben. Obsidian-nativ, Kit-gestützt, pure Kernlogik.

## Leitplanken

- **Kit-first.** Kein Rad neu erfinden. Client/Transport/Reasoning-Handling werden aus
  `vault-rag` (`chat_client.ts` + `sse.ts`) und dem `obsidian-kit` übernommen, nicht neu
  entworfen. Abweichung nur mit Grund.
- **Pure Kern bleibt pure.** Prompt-Bau, Deutungs-/Callout-Rendering und alles SSE-/
  Reasoning-Parsing sind `obsidian`-frei und `check:pure`-gated. Nur Transport (`client.ts`,
  XHR) und Panel-/Settings-Anbindung berühren Obsidian.
- **Nicht-destruktiv & manuell.** Deutung wird nie automatisch erzeugt; der Wurf im Panel
  geht nie verloren.

## Kern-Entscheidungen (abgenommen)

| Thema | Entscheidung |
|---|---|
| Ort & Trigger | Panel-first: Button „Deutung erzeugen" streamt live; separater Schritt persistiert in die Note. Nie automatisch. |
| Backend-Scope | **Nur OpenAI-kompatibel** (`/v1/chat/completions` SSE, `/v1/models`). Deckt LM Studio, MLX, vLLM, OpenClaw und Ollama (via `/v1`) ab. Ollama-nativ (ND-JSON) ist **out of scope**. |
| Reasoning — Panel | Live in gedimmtem, per Default **zugeklapptem** `<details>` über der Deutung (Kit `reasoning`/Split). |
| Reasoning — Note | Setting-Dropdown „Thinking in Notiz einbetten?": **Geschlossener Callout (Default)** · Offener Callout · Als Text · Nein. |
| Thinking anfordern | Setting-Toggle (`suppressParams`), Default **an, wenn Modell es unterstützt**. |
| System-Prompt | Sprachabhängiger Default (DE/EN), automatisch nach Reading-Sprache; beide in Settings editierbar (Textarea + Reset). |
| Endpunkte | Zeilen-Editor (Nachbar-Muster): Add/Remove, Aktiv-Auswahl, Test-pro-Zeile (`classifyEndpointStatus`/`ENDPOINT_PRESETS`). |
| Modell-Wahl | Dropdown live aus `listModels()` + Button „Modelle laden" + Offline-Textfeld-Fallback (vault-rag-Muster 1:1). |
| Platzierung in Note | Deutung wird **erster `##`-Abschnitt**, dort wo `## Das Urteil` steht (über den Wilhelm-Quelltexten). Anker = Marker-Paar direkt vor dem ersten Wurf-Abschnitt. |
| Re-Deutung | Idempotent: ersetzt exakt zwischen den Markern; erhält alles darüber/darunter (inkl. User-Notizen). |
| Callout-Wrapping | Nur der pure Baustein `wrapCallout()` (für Reasoning-Callout + Deutung) in v2. **Volle Per-Abschnitt-Konfigurierbarkeit über die ganze Note ist ein eigener Folge-Spec** (nicht v2). |

## Architektur & Module

Neue Bausteine, auf vendored Kit / vault-rag-Muster aufgesetzt:

| Datei | Art | Zweck | Basis |
|---|---|---|---|
| `src/vendor/kit/sse.ts` | pure | `parseSSE` (SSE→content/reasoning/finishReason/done) | Kit `pure/sse.ts` (verbatim) |
| `src/vendor/kit/endpoint.ts` | pure | `normalizeEndpoint`, `parseEndpointList` | Kit `pure/endpoint.ts` (verbatim) |
| `src/vendor/kit/endpoint_diagnostics.ts` | pure | `classifyEndpointStatus`, `ENDPOINT_PRESETS`, `validateEndpointInput` | Kit (verbatim) |
| `src/vendor/kit/reasoning.ts` | pure | `suppressParams`, `reasoningHappened`, `isAlwaysOnThinker`, `ThinkingSupport` | Kit (verbatim) |
| `src/obsidian/sse.ts` | obsidian-nah | `streamSSE(url, body, headers, onContent, onReasoning, signal)` — XHR-Transport, nutzt `parseSSE` | vault-rag `src/sse.ts` (verbatim) |
| `src/obsidian/chat-client.ts` | obsidian-nah | `ChatClient`: `listModels()`, `probe()`, `stream(messages, opts, onContent, onReasoning, signal)` | vault-rag `chat_client.ts` (adaptiert, ohne RAG-Spezifika) |
| `src/core/llm/prompt.ts` | **pure** | `buildInterpretationMessages(reading, rendered, question, lang, systemPrompt)` → `ChatMessage[]` | — |
| `src/core/llm/interpretation.ts` | **pure** | `renderInterpretation({answer, reasoning}, opts)` → Markdown-Block (mit Markern + Reasoning-Callout je `thinkingInNote`) | — |
| `src/core/llm/callout.ts` | **pure** | `wrapCallout(title, body, type, open)` → `> [!type]±`-Block, mehrzeilen-/listensicher | — |
| `src/core/llm/insert.ts` | **pure** | `insertInterpretation(noteBody, block)` — fügt/ersetzt zwischen Markern ein, vor erstem Wurf-Abschnitt | — |
| `src/core/llm/defaults.ts` | **pure** | `DEFAULT_SYSTEM_PROMPT: Record<Lang, string>` | Referenz: `yijing/web/llm.js` |

`ChatMessage` (übernommen): `{ role: "system"|"user"|"assistant"; content: string; reasoning?: string }`.

## Datenfluss (Panel)

```
Wurf vorhanden (current: CurrentCast)
   │
   ├─ [Deutung erzeugen]
   │     prompt.buildInterpretationMessages(...)  (System-Prompt DE/EN + Reading-Markdown + Frage)
   │     chatClient.stream(messages, {suppressThinking: !thinkingRequested}, onContent, onReasoning, signal)
   │        ├─ onReasoning(t) → gedimmter <details> (live, zu)
   │        └─ onContent(t)   → Deutungs-Container (live)
   │     Button → „Abbrechen" (AbortController) während des Streams
   │     Ergebnis {answer, reasoning} an current.interpretation gehängt
   │
   └─ [In Note speichern / Deutung speichern]
         interpretation.renderInterpretation(...) → Block (Marker + geschl. Reasoning-Callout je Setting)
         insert.insertInterpretation(noteBody, block) an Marker-Position
         Note existiert → ersetzen/einfügen; sonst Note anlegen + einfügen
```

- **`CurrentCast` erweitert** um `interpretation?: { answer: string; reasoning: string; model: string } | null`.
  Re-Wurf/Restore setzt sie auf `null`.
- **Streaming-Sperre:** während eines Streams ist „Deutung erzeugen" gesperrt (→ „Abbrechen").
- **Note-Andockung** nutzt die bestehende `writeReading`-Schiene; der Cursor-Gotcha
  (`getMostRecentLeaf(rootSplit)`) bleibt gültig. Marker im Body kommen aus `render.ts`
  (siehe unten).

## render.ts — Marker

`render.ts` platziert (nur im Note-`body`, nicht im `previewBody`) ein unsichtbares
Marker-Paar **direkt vor dem ersten Wurf-Abschnitt** (`## Das Urteil`):

```
<!-- yijing:deutung:start -->
<!-- yijing:deutung:end -->
## Das Urteil
…
```

Leeres Marker-Paar = noch keine Deutung. `insert.insertInterpretation` ersetzt den Inhalt
**zwischen** den Markern idempotent. Fehlen die Marker (Altnoten), fügt `insert` sie vor der
ersten `##`-Überschrift ein (best-effort, per Heading-Scan als Fallback).

## Interpretation-Block (Note)

```markdown
<!-- yijing:deutung:start -->
## KI-Deutung
<Antwort-Text, gestreamt>

> [!note]- Denkprozess          ← nur wenn thinkingInNote ≠ "nein" und reasoning vorhanden
> <Reasoning, zeilen-geprefixt>
<!-- yijing:deutung:end -->
```

- `thinkingInNote`: `closed-callout` (Default, `[!note]-`) · `open-callout` (`[!note]+`) ·
  `text` (`### Denkprozess` + Klartext) · `none` (kein Reasoning).
- Callout-Typ für Reasoning: `note` (bewusst nicht `quote`, damit unterscheidbar vom
  späteren generischen Wilhelm-Quote-Wrapping). Überschriftstexte i18n (DE/EN) nach
  Reading-Sprache — analog `render.ts`-`LABELS`.

## Neue Settings (`PluginSettings`)

```ts
llm: {
  endpoints: string;         // Zeilen-Text (parseEndpointList), 1 aktiv markiert
  activeEndpoint: string;    // normalisierte URL
  apiKey: string;            // optional (leer für lokale Server)
  model: string;             // zuletzt gewähltes Modell
  systemPromptDe: string;    // "" → DEFAULT_SYSTEM_PROMPT.de
  systemPromptEn: string;    // "" → DEFAULT_SYSTEM_PROMPT.en
  requestThinking: boolean;  // Default true
  thinkingInNote: "closed-callout" | "open-callout" | "text" | "none"; // Default "closed-callout"
}
```

`mergeSettings` (shallow) klont das `llm`-Objekt nicht tief → in `onload` analog zu
`frontmatterFields` absichern (`{ ...DEFAULT.llm, ...loaded.llm }`).

Settings-UI (eigener `## KI-Deutung`-Heading-Block): Endpunkt-Zeilen-Editor + Test ·
Modell-Dropdown/„laden"/Fallback · zwei System-Prompt-Textareas + Reset · Thinking-Toggle ·
Thinking→Note-Dropdown.

## Fehlerbehandlung

- Kein aktiver Endpunkt / kein Modell → Button inaktiv + `Notice` mit Settings-Hinweis.
- Server offline / Timeout / kein LLM → `classifyEndpointStatus`-Klartext als `Notice`;
  Panel-Zustand bleibt (Wurf nicht verloren).
- Abbruch (`AbortController`) → Teilausgabe verworfen, kein Note-Schreiben.
- Stream endet ohne Content → `Notice` „keine Deutung erhalten", nichts wird gespeichert.

## Testing & Gates

- **Pure Kern** headless unter vitest: `prompt.ts`, `interpretation.ts`, `callout.ts`
  (mehrzeilig/Listen/Sonderzeichen), `insert.ts` (einfügen · idempotent ersetzen · Marker
  fehlen → Fallback), `defaults.ts`, vendored `sse.ts`/`reasoning.ts`.
- **`chat-client.ts`/`streamSSE`** gegen Fake-XHR/Fake-SSE (wie vault-rag).
- Bestehende Gates unverändert grün: `lint · typecheck · check:pure · check:bundle · test`
  (aktuell 41 Tests, wachsen).
- **Verifikation:** Smoke-Vault `yijing-oracle-smoke` (`.obsidian/plugins/yijing-oracle/`),
  Deutung gegen einen lokalen Endpunkt (OpenClaw/LM Studio) end-to-end.

## Scope-Grenze — NICHT in v2

Ollama-nativ (ND-JSON) · generisches Per-Abschnitt-Callout-Wrapping der Wilhelm-Texte
(eigener Folge-Spec) · Cloud-Modelle · Tageshexagramm · Trigramm-Explorer · Release-Infra
(`github`/Codeberg-Remote + `release.mjs`-Dual-Push).

## Referenzen

- Web-App: `yijing/web/llm.js` (Client/Reasoning-Muster), `yijing/AGENTS.md` §„Reasoning modes".
- Kit: `obsidian-kit/src/pure/{sse,endpoint,endpoint_diagnostics,reasoning}.ts`.
- vault-rag: `src/{chat_client,sse}.ts`, `src/settings.ts` (Endpoint-Zeilen-Editor + Modell-Dropdown).
- REGISTRY §Streaming/SSE/LLM, §Settings, §UI (Endpoint-/Listen-Zeilen-Editor).
