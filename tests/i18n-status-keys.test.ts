import { describe, expect, it } from "vitest";
import { STRINGS } from "../src/i18n/strings";
import { statusKindKey } from "../src/core/settings/endpoint-editor-model";
import type { EndpointStatusKind } from "../src/vendor/kit/endpoint_diagnostics";

// Uebernommen aus obsidian-transmute/tests/i18n-status-keys.test.ts, 2026-09-02 (Form).
// Abweichung: dieses Repo hat keine Endpunkt-Rollen (kein endpoint_config), also nur die
// Statusklassen — dafuer zusaetzlich "checking", das die Oberflaeche selbst erzeugt und
// das deshalb in keiner Kit-Aufzaehlung steht.
//
// Warum ueber STRINGS und nicht ueber t(): die Kit-Engine faellt DE → EN zurueck. Ein
// fehlender deutscher Schluessel saehe ueber t() aus wie ein vorhandener — der Test waere
// blind fuer genau den Fall, den er sichern soll.

/** Vollstaendigkeits-Kanarienvogel (CORE-TEST-04): bringt ein Kit-Nachzug eine neue
 *  Statusklasse mit — 0.29.0 brachte "unauthorized" —, bricht dieser Record am
 *  `typecheck:test`, BEVOR der rohe Schluessel in der Oberflaeche landet. Denn t() faellt
 *  auf den Key zurueck, nicht auf EN: in der Endpunkt-Zeile stuende dann woertlich
 *  "set.ep.status.unauthorized", was wie ein String aussieht und nicht wie ein Fehler.
 *  In markdown-presentation und vault-crews ist genau das eingetreten. */
const ALLE_KLASSEN: Record<EndpointStatusKind, true> = {
  "ok": true,
  "refused": true,
  "unknown-host": true,
  "timeout": true,
  "not-an-llm-api": true,
  "unauthorized": true,
  "unknown": true,
};

describe("i18n-Abdeckung der Endpunkt-Statusklassen", () => {
  it.each(Object.keys(ALLE_KLASSEN) as EndpointStatusKind[])(
    "hat EN und DE fuer den Status %s",
    (kind) => {
      const key = statusKindKey(kind);
      expect(STRINGS.en[key], `EN fehlt: ${key}`).toBeTruthy();
      expect(STRINGS.de[key], `DE fehlt: ${key}`).toBeTruthy();
    },
  );

  // "checking" steht in keiner Kit-Aufzaehlung — die Oberflaeche erzeugt es selbst,
  // waehrend eine Probe laeuft (endpoint-list.ts, image-section.ts).
  it("hat EN und DE fuer den UI-eigenen Zustand checking", () => {
    expect(STRINGS.en["set.ep.status.checking"]).toBeTruthy();
    expect(STRINGS.de["set.ep.status.checking"]).toBeTruthy();
  });
});
