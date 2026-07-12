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
