import { describe, it, expect } from "vitest";
import { ChatClient } from "../src/obsidian/chat-client";

describe("ChatClient.listModels", () => {
  it("parst /v1/models .data[].id sortiert", async () => {
    const httpGet = async (url: string): Promise<{ status: number; json: unknown }> => {
      expect(url).toBe("http://h:1234/v1/models");
      return { status: 200, json: { data: [{ id: "qwen" }, { id: "gemma" }] } };
    };
    const c = new ChatClient("http://h:1234/v1/", "qwen", httpGet);
    expect(await c.listModels()).toEqual(["gemma", "qwen"]);
  });
  it("liefert [] bei nicht-200", async () => {
    const c = new ChatClient("http://h:1234", "m", async () => ({ status: 500, json: null }));
    expect(await c.listModels()).toEqual([]);
  });
});
