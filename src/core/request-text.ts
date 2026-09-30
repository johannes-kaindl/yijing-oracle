// uebernommen aus lingotuner/src/core/request-text.ts, 2026-09-30 (plus fieldStateText aus lingotuner/src/obsidian/settings-tab.ts, hier pure)
import { t } from "../vendor/kit/i18n";
import type { Deviation, DeviationKind, FieldExplain } from "../vendor/kit/sampling-profiles";

/** Textbausteine fuer Abweichungen (Spec § 5.3): eine Zuordnung, von der Session-Notice UND
 *  dem Abschnitt „Anfrage" (Statuszeile) genutzt — nie zweimal formuliert. */
const KEY: Record<DeviationKind, string> = {
  "thinking-despite-off": "request.dev.thinkingDespiteOff",
  "empty-by-budget": "request.dev.emptyByBudget",
  "family-mismatch": "request.dev.familyMismatch",
  "family-detected": "request.dev.familyDetected",
  "rejected": "request.dev.rejected",
};

export function deviationDetail(kind: DeviationKind, detail?: string): string {
  return detail !== undefined ? t(KEY[kind], detail) : t(KEY[kind]);
}

/** Notice-Text: nur fuer Abweichungen mit `affectsResult` aufgerufen (Vertrag von
 *  `createRequestSession`), deshalb ohne den (dort ungenutzten) `thinking-despite-off`-Fall. */
export function deviationNotice(d: Deviation): string {
  return `${deviationDetail(d.kind, d.detail)} ${t("request.dev.seeSettings")}`;
}

/** Beschreibungszeile je Feld im Abschnitt „Anfrage": Zustand plus optionale Notiz. */
export function fieldStateText(e: FieldExplain): string {
  const key = {
    "sent-effective": "request.state.sentEffective",
    "sent-unproven": "request.state.sentUnproven",
    "not-sent-ignored": "request.state.notSentIgnored",
    "not-sent-unsupported": "request.state.notSentUnsupported",
    "not-sent-unknown-family": "request.state.notSentUnknownFamily",
    "not-sent-no-value": "request.state.notSentNoValue",
  }[e.state];
  let s = t(key);
  const noteKey = e.note ? {
    "raised-to-reserve": "request.note.raisedToReserve",
    "raised-to-thinking-floor": "request.note.raisedToThinkingFloor",
    "below-thinking-floor": "request.note.belowThinkingFloor",
    "off-not-possible": "request.note.offNotPossible",
  }[e.note] : undefined;
  if (noteKey) s += ` ${t(noteKey)}`;
  if (e.field === "top_p") s += t("request.top_p.hint");
  return s;
}
