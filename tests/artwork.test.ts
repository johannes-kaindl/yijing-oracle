import { describe, expect, it } from "vitest";
import { ARTWORK_MARKER_END, ARTWORK_MARKER_START, insertArtwork, renderArtworkBlock } from "../src/core/artwork";
import { MARKER_END, MARKER_START } from "../src/core/llm/insert";

const CAL = { enabled: true, type: "quote" };

describe("renderArtworkBlock", () => {
  it("wickelt Embed + Szene in ein Callout", () => {
    const b = renderArtworkBlock({ embed: "![[bild.png]]", scene: "a lake, at dusk", lang: "de", callout: CAL });
    expect(b).toContain("[!quote]");
    expect(b).toContain("Bildmeditation");
    expect(b).toContain("![[bild.png]]");
    expect(b).toContain("*a lake, at dusk*");
  });

  it("englisches Label + ohne Callout eine ###-Überschrift", () => {
    const b = renderArtworkBlock({ embed: "![[x.png]]", scene: "s", lang: "en", callout: { enabled: false, type: "quote" } });
    expect(b).toContain("### Meditation Image");
    expect(b).not.toContain("[!");
  });
});

describe("insertArtwork", () => {
  const block = "BLOCK";

  it("ersetzt idempotent zwischen vorhandenen Markern", () => {
    const body = `kopf\n\n${ARTWORK_MARKER_START}\nALT\n${ARTWORK_MARKER_END}\n\n## Ursprungsbild`;
    const out = insertArtwork(body, block);
    expect(out).toContain(`${ARTWORK_MARKER_START}\nBLOCK\n${ARTWORK_MARKER_END}`);
    expect(out).not.toContain("ALT");
    expect(insertArtwork(out, block)).toBe(out);
  });

  it("setzt nach dem Deutungs-Marker ein, wenn vorhanden", () => {
    const body = `kopf\n\n${MARKER_START}\n${MARKER_END}\n\n## Ursprungsbild\n\ntext`;
    const out = insertArtwork(body, block);
    const deutungEnd = out.indexOf(MARKER_END);
    const artStart = out.indexOf(ARTWORK_MARKER_START);
    expect(artStart).toBeGreaterThan(deutungEnd);
    expect(artStart).toBeLessThan(out.indexOf("## Ursprungsbild"));
  });

  it("sonst vor der ersten ##-Überschrift", () => {
    const body = "kopf\n\n## Ursprungsbild\n\ntext";
    const out = insertArtwork(body, block);
    expect(out.indexOf(ARTWORK_MARKER_START)).toBeLessThan(out.indexOf("## Ursprungsbild"));
  });

  it("sonst ans Ende", () => {
    const out = insertArtwork("nur text\n", block);
    expect(out.endsWith(`${ARTWORK_MARKER_START}\nBLOCK\n${ARTWORK_MARKER_END}`)).toBe(true);
  });
});
