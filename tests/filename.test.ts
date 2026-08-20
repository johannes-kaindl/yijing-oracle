import { describe, it, expect } from "vitest";
import { DEFAULT_FILENAME_TEMPLATE, buildFilename, sanitizeFilename, type FilenameValues } from "../src/core/filename";

const V = (over: Partial<FilenameValues> = {}): FilenameValues => ({
  date: "2026-07-12",
  time: "1034",
  hexagram: 3,
  resulting: 54,
  question: "",
  ...over,
});

describe("buildFilename", () => {
  it("default template → '2026-07-12 1034 Yijing H3-H54'", () => {
    expect(buildFilename(DEFAULT_FILENAME_TEMPLATE, V())).toBe("2026-07-12 1034 Yijing H3-H54");
  });

  it("hexpair without changing lines is just H<primary>", () => {
    expect(buildFilename(DEFAULT_FILENAME_TEMPLATE, V({ resulting: null }))).toBe("2026-07-12 1034 Yijing H3");
  });

  it("supports {hex} {resulting} {question} placeholders (invalid chars stripped)", () => {
    const out = buildFilename("{hex}→{resulting} {question}", V({ question: "Was jetzt?" }));
    expect(out).toBe("3→54 Was jetzt"); // '?' ist dateisystem-ungültig → entfernt
  });

  it("{question} is empty when there is no question (no dangling spaces)", () => {
    expect(buildFilename("{date} {question}", V({ question: "" }))).toBe("2026-07-12");
  });

  it("strips filesystem-invalid characters from the result", () => {
    const out = buildFilename("{question} {hexpair}", V({ question: 'a/b:c*?"<>|' }));
    expect(out).toBe("abc H3-H54");
  });

  it("empty/garbage template falls back to date time hexpair", () => {
    expect(buildFilename("", V())).toBe("2026-07-12 1034 H3-H54");
  });

  it("truncates long questions to ~48 chars", () => {
    const long = "x".repeat(80);
    const out = buildFilename("{question}", V({ question: long }));
    expect(out.length).toBeLessThanOrEqual(48);
  });

  // Regression: bis 0.5.1 löste die Substitution mit `subs[key] ?? "{key}"` auf. subs ist ein
  // Objekt-Literal, also war subs["toString"] nicht nullish — der Literal-Fallback feuerte nie
  // und ein geerbtes Prototyp-Member landete im Dateinamen (elfmal Funktions-Quelltext, bei
  // {__proto__} "object Object"). Der Object.hasOwn-Guard im Kit schliesst das. Die Namensliste
  // wird bewusst aus Object.prototype erzeugt statt hart notiert: kommt in einer kuenftigen
  // Engine ein Prototyp-Member dazu, faellt der Test von selbst darauf.
  it("leaves JavaScript prototype names literal instead of leaking inherited members", () => {
    const inherited = Object.getOwnPropertyNames(Object.prototype).filter((n) => /^\w+$/.test(n));
    expect(inherited.length).toBeGreaterThan(0);
    for (const name of inherited) {
      expect(buildFilename(`{${name}} {hexpair}`, V())).toBe(`{${name}} H3-H54`);
    }
  });
});

describe("sanitizeFilename", () => {
  it("removes invalid chars and collapses whitespace", () => {
    expect(sanitizeFilename('  a  /  b:c  ')).toBe("a bc");
  });
});
