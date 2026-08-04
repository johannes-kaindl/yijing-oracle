// WebSocket-Fortschritt von ComfyUI. Bewusst NUR Anzeige: ob der Lauf gelang, steht in
// /history (siehe core/comfy/client.ts). Fällt der Socket aus, fehlt der Balken — mehr nicht.
import { type ComfyProgress } from "../core/comfy/client";

/** ws:// bzw. wss:// aus der HTTP-Basis ableiten. */
function wsUrl(base: string, clientId: string): string {
  const scheme = base.startsWith("https:") ? "wss:" : "ws:";
  return `${scheme}${base.replace(/^https?:/, "")}/ws?clientId=${encodeURIComponent(clientId)}`;
}

export class ComfyProgressSocket {
  private socket: WebSocket | null = null;

  /** clientId MUSS derselbe sein, der an /prompt geht — sonst kommen die Events nie an
   *  und der Balken bleibt stumm bei 0 %, während das Bild ganz normal entsteht. */
  constructor(
    private readonly base: string,
    private readonly clientId: string,
    private readonly onProgress: (p: ComfyProgress) => void,
  ) {}

  open(): void {
    try {
      this.socket = new WebSocket(wsUrl(this.base, this.clientId));
      this.socket.addEventListener("message", (ev) => this.handle(ev));
      this.socket.addEventListener("error", () => this.close());
    } catch {
      this.socket = null; // Anzeige entfällt, der Lauf geht weiter.
    }
  }

  private handle(ev: MessageEvent): void {
    if (typeof ev.data !== "string") return; // Binär-Frames sind Vorschaubilder
    try {
      const msg = JSON.parse(ev.data) as { type?: string; data?: { value?: number; max?: number } };
      if (msg.type !== "progress") return;
      const { value, max } = msg.data ?? {};
      if (typeof value === "number" && typeof max === "number" && max > 0) {
        this.onProgress({ value, max });
      }
    } catch {
      /* kaputte Nachricht → ignorieren, sie speist nur die Anzeige */
    }
  }

  close(): void {
    try {
      this.socket?.close();
    } catch {
      /* schon zu */
    }
    this.socket = null;
  }
}
