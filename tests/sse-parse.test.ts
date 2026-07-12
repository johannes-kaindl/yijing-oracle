import { describe, it, expect } from "vitest";
import { parseSSE } from "../src/vendor/kit/sse";

describe("parseSSE", () => {
  it("extrahiert content-Deltas", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"Hi"}}]}\n');
    expect(r.content).toEqual(["Hi"]);
    expect(r.done).toBe(false);
  });
  it("trennt reasoning_content vom content", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"reasoning_content":"denk"}}]}\n');
    expect(r.reasoning).toEqual(["denk"]);
    expect(r.content).toEqual([]);
  });
  it("markiert [DONE] und puffert unvollständige letzte Zeile", () => {
    const r = parseSSE('data: [DONE]\ndata: {"choices":[{"delta":');
    expect(r.done).toBe(true);
    expect(r.rest).toBe('data: {"choices":[{"delta":');
  });
});
