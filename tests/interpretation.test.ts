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
