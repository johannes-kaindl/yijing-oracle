// ComfyProgressSocket: speist NUR die Anzeige. Getestet wird deshalb nicht, ob Bilder
// entstehen, sondern ob ein Scheitern der Verbindung oben ankommt — genau daran hing der
// Befund vom 2026-08-16 (GUI-Smoke D4): der Socket starb am Origin-Check von ComfyUI,
// und das Panel zeigte weiter "Bild wird generiert…", als liefe alles.
import { describe, expect, it, vi } from "vitest";
import { ComfyProgressSocket } from "../src/obsidian/comfy-progress";

/** Minimaler WebSocket-Ersatz: merkt sich die Zuhörer und lässt den Test feuern. */
class FakeSocket {
  static letzte: FakeSocket | null = null;
  readonly hoerer = new Map<string, ((ev: unknown) => void)[]>();
  geschlossen = false;

  constructor(readonly url: string) {
    FakeSocket.letzte = this;
  }

  addEventListener(typ: string, fn: (ev: unknown) => void): void {
    const bisher = this.hoerer.get(typ) ?? [];
    bisher.push(fn);
    this.hoerer.set(typ, bisher);
  }

  feuere(typ: string, ev: unknown = {}): void {
    for (const fn of this.hoerer.get(typ) ?? []) fn(ev);
  }

  close(): void {
    this.geschlossen = true;
  }
}

function mitFakeSocket<T>(fn: () => T): T {
  const vorher = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket as unknown;
  try {
    return fn();
  } finally {
    (globalThis as { WebSocket?: unknown }).WebSocket = vorher;
  }
}

describe("ComfyProgressSocket", () => {
  it("baut die ws-URL aus der HTTP-Basis und trägt die clientId", () => {
    mitFakeSocket(() => {
      new ComfyProgressSocket("http://127.0.0.1:8000", "abc-123", vi.fn()).open();
      expect(FakeSocket.letzte?.url).toBe("ws://127.0.0.1:8000/ws?clientId=abc-123");
    });
  });

  it("nutzt wss für https-Endpunkte", () => {
    mitFakeSocket(() => {
      new ComfyProgressSocket("https://gpu.example:8188", "x", vi.fn()).open();
      expect(FakeSocket.letzte?.url.startsWith("wss://gpu.example:8188/ws")).toBe(true);
    });
  });

  it("reicht progress-Nachrichten durch", () => {
    const onProgress = vi.fn();
    mitFakeSocket(() => {
      new ComfyProgressSocket("http://127.0.0.1:8000", "x", onProgress).open();
      FakeSocket.letzte?.feuere("message", { data: JSON.stringify({ type: "progress", data: { value: 3, max: 8 } }) });
    });
    expect(onProgress).toHaveBeenCalledWith({ value: 3, max: 8 });
  });

  it("ignoriert fremde Nachrichtentypen und Binärframes", () => {
    const onProgress = vi.fn();
    mitFakeSocket(() => {
      new ComfyProgressSocket("http://127.0.0.1:8000", "x", onProgress).open();
      FakeSocket.letzte?.feuere("message", { data: JSON.stringify({ type: "executing", data: {} }) });
      FakeSocket.letzte?.feuere("message", { data: new ArrayBuffer(4) });
      FakeSocket.letzte?.feuere("message", { data: "kein json" });
    });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("meldet einen gescheiterten Verbindungsaufbau nach oben", () => {
    const onUnavailable = vi.fn();
    mitFakeSocket(() => {
      new ComfyProgressSocket("http://127.0.0.1:8000", "x", vi.fn(), onUnavailable).open();
      // Chromium feuert bei abgewiesenem Handshake error + close(1006).
      FakeSocket.letzte?.feuere("error", {});
      FakeSocket.letzte?.feuere("close", { code: 1006 });
    });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("meldet auch einen Abriss vor der ersten Fortschrittsmeldung", () => {
    const onUnavailable = vi.fn();
    mitFakeSocket(() => {
      new ComfyProgressSocket("http://127.0.0.1:8000", "x", vi.fn(), onUnavailable).open();
      FakeSocket.letzte?.feuere("close", { code: 1006 });
    });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("schweigt, wenn der Socht nach gelieferten Fortschritten schliesst", () => {
    const onUnavailable = vi.fn();
    mitFakeSocket(() => {
      new ComfyProgressSocket("http://127.0.0.1:8000", "x", vi.fn(), onUnavailable).open();
      FakeSocket.letzte?.feuere("message", { data: JSON.stringify({ type: "progress", data: { value: 8, max: 8 } }) });
      FakeSocket.letzte?.feuere("close", { code: 1000 });
    });
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("meldet nach dem eigenen close() nichts mehr — sonst faerbt das Aufraeumen die Anzeige", () => {
    const onUnavailable = vi.fn();
    mitFakeSocket(() => {
      const s = new ComfyProgressSocket("http://127.0.0.1:8000", "x", vi.fn(), onUnavailable);
      s.open();
      s.close();
      FakeSocket.letzte?.feuere("close", { code: 1000 });
    });
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
