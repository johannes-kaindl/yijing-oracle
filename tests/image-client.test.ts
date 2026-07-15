import { describe, expect, it } from "vitest";
import { Txt2ImgClient, type ImageRequest } from "../src/obsidian/image-client";

const REQ: ImageRequest = { prompt: "a lake", negativePrompt: "text", width: 768, height: 768, steps: 28, seed: 42 };

function fakePost(status: number, json: unknown) {
  const calls: { url: string; body: unknown }[] = [];
  const post = async (url: string, body: unknown) => {
    calls.push({ url, body });
    return { status, json };
  };
  return { post, calls };
}

describe("Txt2ImgClient", () => {
  it("postet den A1111-Request an /sdapi/v1/txt2img und liefert images[0]", async () => {
    const { post, calls } = fakePost(200, { images: ["QkFTRTY0"] });
    const client = new Txt2ImgClient("http://127.0.0.1:7860/", post);
    const png = await client.generate(REQ);
    expect(png).toBe("QkFTRTY0");
    expect(calls[0].url).toBe("http://127.0.0.1:7860/sdapi/v1/txt2img");
    expect(calls[0].body).toEqual({
      prompt: "a lake", negative_prompt: "text", width: 768, height: 768, steps: 28, seed: 42,
    });
  });

  it("wirft bei non-200", async () => {
    const { post } = fakePost(500, undefined);
    await expect(new Txt2ImgClient("http://x", post).generate(REQ)).rejects.toThrow(/500/);
  });

  it("wirft bei leerem/fehlendem images-Array", async () => {
    const { post } = fakePost(200, { images: [] });
    await expect(new Txt2ImgClient("http://x", post).generate(REQ)).rejects.toThrow();
    const { post: p2 } = fakePost(200, {});
    await expect(new Txt2ImgClient("http://x", p2).generate(REQ)).rejects.toThrow();
  });
});
