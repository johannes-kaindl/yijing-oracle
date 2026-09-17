// vendored from obsidian-kit@0.38.0, src/pure/explain-texts.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Erklärtexte für acht wiederkehrende LLM-Endpunkt-Sachverhalte — obsidian-frei, in Node
 *  testbar (PROF-OBS-03/04). Bauart wie `code-kit/pure/endpoint_diagnostics.ts`s `KLARTEXT`:
 *  Schlüssel + Text, hier zusätzlich je Sprache (EN kanonisch, DE daneben) — der Konsument
 *  mappt den Text auf sein eigenes `t()`, dieses Modul bringt keine eigene i18n-Engine mit.
 *
 *  Grundlage: `obsidian-plugins/_Tasks/Wortlaut-Inventur — welche Erklärtexte existieren
 *  mehrfach.md` § „Inventur 2026-09-16" (Session `wortlaut-w4`, 22 Repos). Acht Sachverhalte
 *  erreichen dort n≥3 unabhängige Fassungen (UI-STANDARD.md §10 Punkt 4) — Entscheidung
 *  Johannes 2026-09-16: eigenes Kit-Modul. Je Schlüssel gewinnt beim Zusammenführen die
 *  REICHERE Fassung (§10, Dach-`AGENTS.md`); Umgebungs-Unterschiede (Feature-Name, Inhaltsart)
 *  werden zu Platzhaltern, nicht zu einem zweiten Satz.
 *
 *  Herkunft je Schlüssel (Repo + i18n-Schlüssel der übernommenen Fassung):
 *    corsBlocked                  koda-agent      `error.chatBlocked`               (n=4)
 *    noModelList                  lingotuner      `ep.hint.noList` (deckungsgleich   (n=5)
 *                                                 mit yijing-oracle/slide-deck/i2m)
 *    apiKeyThirdParty             image-to-markdown `settings.endpoints.thirdParty`  (n=4)
 *    endpointUnreachableKeepsModel vault-rag      `modelChoice.hintUnreachable`      (n=6)
 *    reasoningOnlyNoText          obsidian-transmute `error.thoughtOnly`             (n=3)
 *    reasoningIgnoresSuppress     vault-crews     `notice.run.alwaysOnThinker`       (n=4 +1 unbelegte Dublette)
 *    suppressThinkingDesc         vault-rag       `settings.smartApply.suppressThinking.desc` (n=6)
 *    tokenLimitBeforeText         koda-agent      `error.truncatedEmpty`             (n=4)
 *
 *  Zwei begründete Abweichungen vom wörtlichen Original (§10: „reichere Fassung gewinnt",
 *  nicht „reichere Fassung unverändert"):
 *  - `apiKeyThirdParty`: statt „images/your text goes to this provider" trägt der Satz jetzt
 *    ein Subjekt außerhalb des Platzhalters (`the request with your {content}` /
 *    `die Anfrage mit {content}`) — sonst müsste die Verbform (`geht`/`gehen`) mit der Wortart
 *    des eingesetzten Substantivs übereinstimmen (Singular „dein Text" vs. Plural „deine
 *    Bilder"), was ein Platzhalter nicht garantieren kann.
 *  - `suppressThinkingDesc`: „Smart Apply" (vault-rags Feature-Name) → `{feature}`, im
 *    Loanword-Stil der Vorlage beibehalten (`{feature}-Call`, nicht „{feature}-Aufruf").
 *
 *  §10 Punkt 2 (kein Fachbegriff ohne Auflösung): CORS und Token-Budget sind an ihrer
 *  Fundstelle jeweils mit dem Handgriff/Mechanismus erklärt (getestet, s. u.). „Endpunkt"
 *  selbst zählt hier NICHT als unaufgelöster Fachbegriff — die Inventur führt ihn nicht in
 *  ihrer eigenen Fachbegriff-Liste (§ „Fachbegriff ohne Auflösung", Punkt 7: Verdichtung,
 *  Stufe 2/Stubs, Listen-Grenze, Embedding, Streaming), und er ist im Kit bereits durchgängig
 *  unerklärtes, etabliertes Vokabular (`endpoint_diagnostics`, `endpoint-source`,
 *  `buildEndpointList`). Getestet wird stattdessen die schwächere, aber tatsächlich zutreffende
 *  Eigenschaft: „Endpunkt"/"endpoint" taucht hier nie bar auf, sondern immer zusammen mit einem
 *  Status- oder Adress-Wort (erreichbar/unreachable, Modell/model, Verbindung/connection, …).
 */

export interface ExplainText {
  /** Kanonisch — Fallback, wenn eine Sprache fehlt (Dach-Konvention aus `defineStrings`). */
  en: string;
  de: string;
}

export type ExplainTextKey =
  | "corsBlocked"
  | "noModelList"
  | "apiKeyThirdParty"
  | "endpointUnreachableKeepsModel"
  | "reasoningOnlyNoText"
  | "reasoningIgnoresSuppress"
  | "suppressThinkingDesc"
  | "tokenLimitBeforeText";

export const EXPLAIN_TEXTS: Record<ExplainTextKey, ExplainText> = {
  corsBlocked: {
    en: "The endpoint answers the connection test but not the chat request from Obsidian. A local server usually needs CORS enabled for that — LM Studio: turn on “Enable CORS” in the server settings (or start it with `lms server start --cors`); Ollama: set `OLLAMA_ORIGINS`. The test button stays green either way — it takes a different route.",
    de: "Der Endpunkt antwortet dem Verbindungstest, aber nicht der Chat-Anfrage aus Obsidian. Ein lokaler Server braucht dafür meist aktiviertes CORS — LM Studio: „Enable CORS“ in den Server-Einstellungen einschalten (oder mit `lms server start --cors` starten); Ollama: `OLLAMA_ORIGINS` setzen. Der Testknopf bleibt davon unberührt — er nimmt einen anderen Weg.",
  },
  noModelList: {
    en: "The endpoint returns no model list — type the name.",
    de: "Der Endpunkt gibt keine Modell-Liste heraus — Namen eintippen.",
  },
  apiKeyThirdParty: {
    en: "Carries an API key — the request with your {content} goes to this provider, not to a local server.",
    de: "Trägt einen API-Schlüssel — die Anfrage mit {content} geht an diesen Anbieter, nicht an einen lokalen Server.",
  },
  endpointUnreachableKeepsModel: {
    en: 'Endpoint unreachable — the saved value is kept. Use "Fetch models" once it is running.',
    de: "Endpunkt nicht erreichbar — gespeicherter Wert bleibt erhalten. „Modelle abrufen“, sobald er läuft.",
  },
  reasoningOnlyNoText: {
    en: "The model only thought and gave no answer. Turn thinking off in the settings, or pick another model.",
    de: "Das Modell hat nur nachgedacht und nichts geantwortet. Schalte das Denken in den Einstellungen ab oder wähle ein anderes Modell.",
  },
  reasoningIgnoresSuppress: {
    en: "This model kept reasoning despite 'thinking: off' — suppression does not fully apply.",
    de: "Dieses Modell hat trotz 'thinking: off' weitergedacht — die Unterdrückung greift nicht vollständig.",
  },
  suppressThinkingDesc: {
    en: "Sends suppress hints for the {feature} call. On by default: thinking and answer share the same token budget, and a long thinking phase can use it up before the answer even starts. Turn it off only if your model produces better structured output after thinking.",
    de: "Sendet Suppress-Hints für den {feature}-Call. Standardmäßig an: Denken und Antwort teilen sich dasselbe Token-Budget, und eine lange Denkphase kann es aufbrauchen, bevor die Antwort überhaupt beginnt. Nur ausschalten, wenn das Modell nach dem Denken strukturierter schreibt.",
  },
  tokenLimitBeforeText: {
    en: 'The response was cut off at the token limit before any text came out — the usual case with reasoning models, whose thinking eats the budget first. Raise "max_tokens" on the endpoint, or try again.',
    de: "Die Antwort ist am Token-Limit abgeschnitten, bevor Text entstand — der Normalfall bei Reasoning-Modellen, deren Denken das Budget zuerst verbraucht. „max_tokens“ am Endpunkt erhöhen oder erneut versuchen.",
  },
};
