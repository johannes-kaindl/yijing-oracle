import { describe, expect, it } from "vitest";
import {
  activeIndexFromStatuses,
  applyEndpointEdit,
  statusKindKey,
  warnRuleKey,
} from "../src/core/settings/endpoint-editor-model";

describe("applyEndpointEdit", () => {
  it("hängt einen nicht-leeren Wert aus der Adder-Zeile an", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "http://b:2", true)).toEqual([
      "http://a:1",
      "http://b:2",
    ]);
  });

  it("ist ein No-Op, wenn die Adder-Zeile leer bleibt", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "   ", true)).toEqual(["http://a:1"]);
  });

  it("ersetzt eine bestehende Zeile an ihrer Stelle", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "http://c:3", false)).toEqual([
      "http://c:3",
      "http://b:2",
    ]);
  });

  it("entfernt eine bestehende Zeile, die geleert wurde", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "", false)).toEqual(["http://b:2"]);
  });

  it("trimmt den Wert", () => {
    expect(applyEndpointEdit([], 0, "  http://a:1  ", true)).toEqual(["http://a:1"]);
  });

  it("filtert Leereinträge aus der Liste heraus", () => {
    expect(applyEndpointEdit(["", "http://a:1"], 1, "http://a:1", false)).toEqual(["http://a:1"]);
  });

  it("mutiert die Eingabeliste nicht", () => {
    const list = ["http://a:1"];
    applyEndpointEdit(list, 0, "http://c:3", false);
    expect(list).toEqual(["http://a:1"]);
  });
});

describe("activeIndexFromStatuses", () => {
  it("liefert den ersten erreichbaren Index (resolveActiveEndpoint-Semantik)", () => {
    expect(activeIndexFromStatuses(["refused", "ok", "ok"])).toBe(1);
  });

  it("liefert -1, wenn keiner erreichbar ist", () => {
    expect(activeIndexFromStatuses(["refused", "timeout"])).toBe(-1);
  });

  it("liefert -1, solange noch nichts geprobt wurde", () => {
    expect(activeIndexFromStatuses([null, null])).toBe(-1);
  });

  it("überspringt noch nicht geprobte Zeilen vor einem erreichbaren", () => {
    expect(activeIndexFromStatuses([null, "ok"])).toBe(1);
  });
});

describe("i18n-Key-Ableitung", () => {
  it("bildet Status-Kinds auf set.ep.status.* ab", () => {
    expect(statusKindKey("not-an-llm-api")).toBe("set.ep.status.not-an-llm-api");
    expect(statusKindKey("ok")).toBe("set.ep.status.ok");
  });

  it("bildet Warn-Regeln auf set.ep.warn.* ab", () => {
    expect(warnRuleKey("placeholder-ip")).toBe("set.ep.warn.placeholder-ip");
  });
});
