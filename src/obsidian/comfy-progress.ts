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
  /** Kam schon ein Fortschritt an? Danach ist ein `close` das normale Ende, kein Ausfall. */
  private hatteFortschritt = false;
  /** Der Ausfall wird höchstens einmal gemeldet — error und close feuern beide. */
  private ausfallGemeldet = false;
  /** Von uns selbst geschlossen: dann ist das folgende `close` erwartet. */
  private beendet = false;

  /** clientId MUSS derselbe sein, der an /prompt geht — sonst kommen die Events nie an
   *  und der Balken bleibt stumm bei 0 %, während das Bild ganz normal entsteht.
   *
   *  `onUnavailable` meldet, dass für diesen Lauf **kein** Fortschritt mehr kommt. Ohne
   *  diese Meldung sieht ein struktureller Ausfall aus wie ein hängender Lauf: gemessen
   *  am 2026-08-16 gegen ComfyUI 0.30.0, deren Origin-Prüfung jede Verbindung aus dem
   *  Obsidian-Renderer mit 403 abweist (`Origin: app://obsidian.md` ≠ Host). Die
   *  Bild-Requests selbst laufen über `requestUrl` im Main-Prozess, senden also gar keinen
   *  Origin — deshalb entsteht das Bild, und nur die Anzeige bleibt blind. */
  constructor(
    private readonly base: string,
    private readonly clientId: string,
    private readonly onProgress: (p: ComfyProgress) => void,
    private readonly onUnavailable?: () => void,
  ) {}

  open(): void {
    try {
      this.socket = new WebSocket(wsUrl(this.base, this.clientId));
      this.socket.addEventListener("message", (ev) => this.handle(ev));
      this.socket.addEventListener("error", () => {
        this.meldeAusfall();
        this.close();
      });
      // Ein abgewiesener Handshake feuert error UND close(1006); ein Abriss mitten im Lauf
      // nur close. Beide Wege müssen ankommen, gemeldet wird trotzdem nur einmal.
      this.socket.addEventListener("close", () => this.meldeAusfall());
    } catch {
      this.socket = null;
      this.meldeAusfall();
    }
  }

  private meldeAusfall(): void {
    if (this.beendet || this.hatteFortschritt || this.ausfallGemeldet) return;
    this.ausfallGemeldet = true;
    this.onUnavailable?.();
  }

  private handle(ev: MessageEvent): void {
    if (typeof ev.data !== "string") return; // Binär-Frames sind Vorschaubilder
    try {
      const msg = JSON.parse(ev.data) as { type?: string; data?: { value?: number; max?: number } };
      if (msg.type !== "progress") return;
      const { value, max } = msg.data ?? {};
      if (typeof value === "number" && typeof max === "number" && max > 0) {
        this.hatteFortschritt = true;
        this.onProgress({ value, max });
      }
    } catch {
      /* kaputte Nachricht → ignorieren, sie speist nur die Anzeige */
    }
  }

  close(): void {
    this.beendet = true;
    try {
      this.socket?.close();
    } catch {
      /* schon zu */
    }
    this.socket = null;
  }
}
