import { wrapCallout } from "./callout";
import { type Lang } from "../data";

export type ThinkingInNote = "closed-callout" | "open-callout" | "text" | "none";
export interface InterpretationData { answer: string; reasoning: string }

const LABELS: Record<Lang, { head: string; reasoning: string }> = {
  de: { head: "KI-Deutung", reasoning: "Denkprozess" },
  en: { head: "AI Interpretation", reasoning: "Reasoning" },
};

/** Rendert den Deutungs-Block (Heading + Antwort + optional Reasoning) OHNE Marker. Pure. */
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
