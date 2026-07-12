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
