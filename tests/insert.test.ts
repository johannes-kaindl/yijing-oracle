import { describe, it, expect } from "vitest";
import { BrokenZoneError, insertInterpretation, MARKER_START, MARKER_END } from "../src/core/llm/insert";

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

  it("ein Start-Marker ohne Ende wirft, statt einen zweiten Block anzuhängen (Text unter dem Marker bleibt)", () => {
    const body = `# T\n\n${MARKER_START}\n## Mein eigener Text\n\nbleibt`;
    expect(() => insertInterpretation(body, block)).toThrow(BrokenZoneError);
  });

  it("ein Ende-Marker allein ist keine Zone: der Block kommt vor die Überschrift, der fremde Marker bleibt stehen", () => {
    const body = `# T\n\n${MARKER_END}\n## Das Urteil`;
    const out = insertInterpretation(body, block);
    expect(out).toContain(`${MARKER_START}\n${block}\n${MARKER_END}`);
    expect((out.match(new RegExp(MARKER_END, "g")) ?? []).length).toBe(2);
    expect(out.indexOf(MARKER_START)).toBeLessThan(out.indexOf("## Das Urteil"));
  });
});
