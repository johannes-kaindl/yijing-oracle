import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { streamSSE } from "../src/obsidian/sse";

class FakeXHR {
  status = 200;
  responseText = "";
  onprogress: (() => void) | undefined;
  onload: (() => void) | undefined;
  onerror: (() => void) | undefined;
  onabort: (() => void) | undefined;
  method = "";
  url = "";
  open(m: string, u: string): void { this.method = m; this.url = u; }
  setRequestHeader(): void { /* noop */ }
  send(): void {
    // Zwei Deltas + DONE in einem load-Zyklus.
    this.responseText =
      'data: {"model":"m","choices":[{"delta":{"content":"Hallo"}}]}\n' +
      'data: {"choices":[{"delta":{"reasoning_content":"denk"}}]}\n' +
      'data: [DONE]\n';
    this.onprogress?.();
    this.onload?.();
  }
  abort(): void { this.onabort?.(); }
}

beforeEach(() => { (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR; });
afterEach(() => { delete (globalThis as unknown as { XMLHttpRequest?: unknown }).XMLHttpRequest; });

describe("streamSSE", () => {
  it("ruft onContent/onReasoning und akkumuliert", async () => {
    const content: string[] = [];
    const reasoning: string[] = [];
    const r = await streamSSE(
      "http://x/v1/chat/completions",
      { method: "POST", headers: {}, body: "{}" },
      (t) => content.push(t),
      (t) => reasoning.push(t),
    );
    expect(r.content).toBe("Hallo");
    expect(r.reasoning).toBe("denk");
    expect(r.model).toBe("m");
    expect(content.join("")).toBe("Hallo");
    expect(reasoning.join("")).toBe("denk");
  });
});
