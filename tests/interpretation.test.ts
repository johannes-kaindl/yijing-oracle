import { describe, it, expect } from "vitest";
import { renderInterpretationBlock } from "../src/core/llm/interpretation";
import { insertInterpretation } from "../src/core/llm/insert";

const data = { answer: "Das Urteil ist günstig.", reasoning: "Ich prüfe Trigramme." };

describe("renderInterpretationBlock", () => {
  it("closed-callout: Antwort + geschlossener note-Callout", () => {
    const md = renderInterpretationBlock(data, { lang: "de", thinkingInNote: "closed-callout" });
    expect(md).toContain("## KI-Deutung");
    expect(md).toContain("Das Urteil ist günstig.");
    expect(md).toContain("> [!note]- Denkprozess");
    expect(md).toContain("> Ich prüfe Trigramme.");
  });
  it("Reasoning steht ÜBER der Antwort", () => {
    const md = renderInterpretationBlock(data, { lang: "de", thinkingInNote: "closed-callout" });
    expect(md.indexOf("Denkprozess")).toBeLessThan(md.indexOf("Das Urteil ist günstig."));
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

  describe("Entschärfung beim Speichern", () => {
    const MODES = ["closed-callout", "open-callout", "text", "none"] as const;
    const evilAnswer = "Text\n\n![x](https://evil.example/pixel.png)\n\n```dataviewjs\ndv.paragraph(1)\n```";

    for (const mode of MODES) {
      it(`${mode}: Fernbild und dataviewjs-Fence in der Antwort werden Text`, () => {
        const md = renderInterpretationBlock({ answer: evilAnswer, reasoning: "" }, { lang: "en", thinkingInNote: mode });
        expect(md).not.toContain("![x](");
        expect(md).toContain("x (https://evil.example/pixel.png)");
        expect(md).toContain("```text");
        expect(md).not.toContain("```dataviewjs");
      });
    }

    for (const mode of ["closed-callout", "open-callout", "text"] as const) {
      it(`${mode}: Fernbild und dataviewjs-Fence in der Denkspur werden Text`, () => {
        const md = renderInterpretationBlock({ answer: "A", reasoning: evilAnswer }, { lang: "en", thinkingInNote: mode });
        expect(md).not.toContain("![x](");
        expect(md).toContain("x (https://evil.example/pixel.png)");
        expect(md).not.toMatch(/dataviewjs/);
      });
    }

    for (const mode of ["closed-callout", "open-callout"] as const) {
      it(`${mode}: mehrzeiliges <img>-Tag in der Denkspur wird VOR dem Wickeln escaped`, () => {
        const md = renderInterpretationBlock(
          { answer: "A", reasoning: '<img\nsrc="https://evil.example/x">' },
          { lang: "en", thinkingInNote: mode },
        );
        expect(md).toContain("&lt;img");
        expect(md).not.toContain("> <img");
      });
    }

    it("none: keine Denkspur im Ergebnis", () => {
      const md = renderInterpretationBlock({ answer: "A", reasoning: "GEHEIM-DENKSPUR" }, { lang: "en", thinkingInNote: "none" });
      expect(md).not.toContain("GEHEIM-DENKSPUR");
    });

    it("normale Formatierung, Codeblöcke und Listen ohne Fernquelle bleiben byte-gleich", () => {
      const answer = "**fett** und *kursiv*\n\n- eins\n- zwei\n\n1. a\n2. b\n\n```ts\nconst x = 1;\n```\n\n[Link](https://example.org) ![[lokal.png]] <!-- Kommentar --> $=dv.current()";
      const reasoning = "Schritt 1\n\n- Punkt\n\n```js\nlet y;\n```";
      for (const mode of MODES) {
        const md = renderInterpretationBlock({ answer, reasoning }, { lang: "en", thinkingInNote: mode });
        expect(md).toContain(answer);
        if (mode === "text") expect(md).toContain(reasoning);
      }
    });

    it("eigener End-Marker in der Antwort beendet den Block nicht vorzeitig", () => {
      const md = renderInterpretationBlock({ answer: "vorn <!-- yijing:deutung:end --> hinten", reasoning: "" }, { lang: "en", thinkingInNote: "none" });
      expect(md).not.toContain("<!-- yijing:");
      expect(md).toContain("&lt;!-- yijing:deutung:end -->");
    });

    for (const mode of ["closed-callout", "open-callout", "text"] as const) {
      it(`${mode}: eigener End-Marker in der Denkspur beendet den Block nicht vorzeitig`, () => {
        const md = renderInterpretationBlock({ answer: "A", reasoning: "x <!-- yijing:deutung:end --> y" }, { lang: "en", thinkingInNote: mode });
        expect(md).not.toContain("<!-- yijing:");
        expect(md).toContain("&lt;!-- yijing:deutung:end -->");
      });
    }

    it("Round-Trip: insertInterpretation + Nachtragen lässt keinen Rest stehen", () => {
      const block = renderInterpretationBlock({ answer: "a <!-- yijing:deutung:end --> REST", reasoning: "" }, { lang: "en", thinkingInNote: "none" });
      const once = insertInterpretation("# N\n", block);
      const twice = insertInterpretation(once, renderInterpretationBlock({ answer: "neu", reasoning: "" }, { lang: "en", thinkingInNote: "none" }));
      expect(twice).not.toContain("REST");
    });
  });
});
