// vendored from obsidian-kit, src/pure/endpoint_diagnostics.ts
export type EndpointStatusKind =
  | "ok" | "refused" | "unknown-host" | "timeout" | "not-an-llm-api" | "unknown";

export interface EndpointStatus {
  reachable: boolean;         // true nur bei kind === "ok"
  kind: EndpointStatusKind;
  klartext: string;           // deutsche, handlungsleitende Meldung (Tooltip-Text)
  raw?: string;               // rohe Fehlermeldung, nur bei kind === "unknown"
}

/** Rohsignal einer Erreichbarkeits-Probe: erfolgreiche Response, gefangener Fehler, oder Timeout. */
export type ProbeInput =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "error"; message: string }
  | { kind: "timeout" };

const KLARTEXT: Record<Exclude<EndpointStatusKind, "unknown">, string> = {
  "ok": "Verbunden",
  "refused": "Verbindung abgelehnt — Server läuft nicht oder Port falsch.",
  "unknown-host": "Hostname unbekannt — Tippfehler in der Adresse?",
  "timeout": "Zeitüberschreitung — Netz nicht erreichbar (falsches Netz / VPN aus?).",
  "not-an-llm-api": "Antwortet, ist aber kein OpenAI-kompatibler Endpunkt — falscher Pfad/Dienst?",
};

function hasModelListForm(body: unknown): boolean {
  return Array.isArray((body as { data?: unknown } | null | undefined)?.data);
}

/** Übersetzt ein Probe-Rohsignal in einen benannten Status + Klartext. */
export function classifyEndpointStatus(input: ProbeInput): EndpointStatus {
  if (input.kind === "timeout") {
    return { reachable: false, kind: "timeout", klartext: KLARTEXT["timeout"] };
  }
  if (input.kind === "response") {
    if (input.status === 200 && hasModelListForm(input.body)) {
      return { reachable: true, kind: "ok", klartext: KLARTEXT["ok"] };
    }
    return { reachable: false, kind: "not-an-llm-api", klartext: KLARTEXT["not-an-llm-api"] };
  }
  const m = input.message;
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(m)) {
    return { reachable: false, kind: "refused", klartext: KLARTEXT["refused"] };
  }
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(m)) {
    return { reachable: false, kind: "unknown-host", klartext: KLARTEXT["unknown-host"] };
  }
  if (/ETIMEDOUT|ERR_CONNECTION_TIMED_OUT|timed out/i.test(m)) {
    return { reachable: false, kind: "timeout", klartext: KLARTEXT["timeout"] };
  }
  return { reachable: false, kind: "unknown", klartext: `Nicht erreichbar — ${m}`, raw: m };
}

export interface EndpointPreset { label: string; url: string; }

/** Benannte Ein-Klick-Presets für den Endpunkt-Editor. Base-URLs ohne /v1
 *  (normalizeEndpoint strippt es ohnehin). */
export const ENDPOINT_PRESETS: EndpointPreset[] = [
  { label: "LM Studio", url: "http://localhost:1234" },
  { label: "Ollama", url: "http://localhost:11434" },
];

export interface EndpointWarning { rule: string; message: string; }

const PLACEHOLDER_IP = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./];

/** Nicht-blockierende Eingabe-Prüfung: gibt Hinweise, blockiert nie. */
export function validateEndpointInput(url: string): EndpointWarning[] {
  const warnings: EndpointWarning[] = [];
  const v = url.trim();
  if (!v) return warnings;
  if (!/^https?:\/\//i.test(v)) {
    warnings.push({ rule: "scheme", message: "Adresse braucht http:// oder https://" });
    return warnings;
  }
  let host = "";
  let port = "";
  try {
    const u = new URL(v);
    host = u.hostname;
    port = u.port;
  } catch {
    warnings.push({ rule: "malformed", message: "Adresse ist keine gültige URL" });
    return warnings;
  }
  const isHttp = /^http:\/\//i.test(v);
  const isLocalOrIp = host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isHttp && isLocalOrIp && !port) {
    warnings.push({ rule: "port", message: "Lokale LLM-Server brauchen fast immer einen Port (z. B. :1234)" });
  }
  if (host === "0.0.0.0" || PLACEHOLDER_IP.some(re => re.test(host))) {
    warnings.push({ rule: "placeholder-ip", message: "Sieht aus wie eine Beispiel-/Platzhalter-Adresse" });
  }
  return warnings;
}
