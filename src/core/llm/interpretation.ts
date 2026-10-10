import { wrapCallout } from "../../vendor/kit/callout";
import { neutralizeRemoteResources } from "../../vendor/kit/safe-markdown";
import { type Lang } from "../data";
import { MARKER_START_PREFIX } from "./insert";

export type ThinkingInNote = "closed-callout" | "open-callout" | "text" | "none";
export interface InterpretationData { answer: string; reasoning: string }

const LABELS: Record<Lang, { head: string; reasoning: string }> = {
  de: { head: "KI-Deutung", reasoning: "Denkprozess" },
  en: { head: "AI Interpretation", reasoning: "Reasoning" },
};

/** Entschärft Modelltext für die gespeicherte Notiz: Fernquellen laden nicht von selbst, Prozessor-Fences
 *  (dataview/dataviewjs/js-engine) werden Text, und die eigene Marker-Form `<!-- yijing:` kann den Block
 *  nicht vorzeitig beenden. Muss VOR `wrapCallout` laufen: danach schneidet das `> ` der Folgezeile ein
 *  mehrzeiliges Tag ab, und `neutralizeRemoteResources` erkennt es nicht mehr. */
function neutralizeForNote(text: string): string {
  return neutralizeRemoteResources(text).split(MARKER_START_PREFIX).join("&lt;" + MARKER_START_PREFIX.slice(1));
}

/** Rendert den Deutungs-Block (Heading + Antwort + optional Reasoning) OHNE Marker. Pure. */
export function renderInterpretationBlock(
  data: InterpretationData,
  opts: { lang: Lang; thinkingInNote: ThinkingInNote },
): string {
  const L = LABELS[opts.lang];
  // Reihenfolge: Überschrift → Reasoning (über der Deutung) → Antwort.
  const parts = [`## ${L.head}`];
  const reasoning = neutralizeForNote(data.reasoning.trim());
  if (reasoning && opts.thinkingInNote !== "none") {
    if (opts.thinkingInNote === "text") {
      parts.push(`### ${L.reasoning}`, reasoning);
    } else {
      parts.push(wrapCallout(L.reasoning, reasoning, "note", opts.thinkingInNote === "open-callout"));
    }
  }
  parts.push(neutralizeForNote(data.answer.trim()));
  return parts.join("\n\n");
}
