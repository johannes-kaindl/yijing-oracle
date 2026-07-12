import type { ChatMessage } from "../../obsidian/chat-client";
import type { RenderedReading } from "../render";
import { type Lang } from "../data";

const USER_LABEL: Record<Lang, { intro: string; question: string; ask: string }> = {
  de: { intro: "Hier ist der Wurf:", question: "Frage:", ask: "Bitte deute diesen Wurf." },
  en: { intro: "Here is the casting:", question: "Question:", ask: "Please interpret this casting." },
};

/** Baut die Chat-Messages für die Deutung: System-Prompt + User-Message mit dem gerenderten
 *  Reading-Body (Wilhelm-Texte) und optional der Frage. Pure. */
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
