import { describe, it, expect } from "vitest";
import { ThinkSplitter } from "../src/vendor/kit/think";

describe("ThinkSplitter", () => {
  it("zieht <think>…</think> in den reasoning-Kanal", () => {
    const s = new ThinkSplitter();
    const a = s.push("Vor<think>ge");
    const b = s.push("dacht</think>Nach");
    expect(a.content + b.content).toBe("VorNach");
    expect(a.reasoning + b.reasoning).toBe("gedacht");
  });
  it("puffert über push-Grenzen gesplittete Tags", () => {
    const s = new ThinkSplitter();
    const a = s.push("A<thi");
    const b = s.push("nk>x</think>B");
    expect(a.content + b.content).toBe("AB");
    expect(b.reasoning).toBe("x");
  });
});
