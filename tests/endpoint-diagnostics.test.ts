import { describe, expect, it } from "vitest";
import { classifyEndpointStatus } from "../src/vendor/kit/endpoint_diagnostics";

// Regressionstest fuer eine VERHALTENSAENDERUNG, die mit einem Kit-Nachzug hereinkommt:
// ein 401/403 galt hier bis 2026-09-02 als "not-an-llm-api" ("Antwortet, ist aber kein
// OpenAI-kompatibler Endpunkt") — der falscheste denkbare Rat, wenn der Endpunkt in
// Wahrheit korrekt antwortet und nur den Schluessel ablehnt.
//
// Warum der Test hier steht, obwohl die Datei vendoriert ist und im Kit eigene Tests hat:
// Lesson aus 2d6edc5 (Kit 0.27.0) — beim Vendoring kommen stille Verhaltensaenderungen
// mit, und die 211 Tests liefen davor wie danach gruen. Wer die alte Fassung
// zuruecklegt, soll hier rot werden, nicht in der Oberflaeche eines Nutzers.

describe("classifyEndpointStatus — Authentifizierung", () => {
  it("wertet 401 als unauthorized, nicht als not-an-llm-api", () => {
    const s = classifyEndpointStatus({ kind: "response", status: 401, body: undefined });
    expect(s.kind).toBe("unauthorized");
    expect(s.reachable).toBe(false);
  });

  it("wertet 403 ebenso als unauthorized", () => {
    expect(classifyEndpointStatus({ kind: "response", status: 403, body: undefined }).kind)
      .toBe("unauthorized");
  });

  it("laesst eine gueltige Modell-Liste weiterhin ok sein", () => {
    const s = classifyEndpointStatus({ kind: "response", status: 200, body: { data: [] } });
    expect(s.kind).toBe("ok");
    expect(s.reachable).toBe(true);
  });

  it("bleibt bei einer 404-Antwort auf not-an-llm-api", () => {
    expect(classifyEndpointStatus({ kind: "response", status: 404, body: undefined }).kind)
      .toBe("not-an-llm-api");
  });
});
