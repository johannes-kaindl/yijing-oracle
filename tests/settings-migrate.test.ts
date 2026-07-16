import { describe, expect, it } from "vitest";
import { migrateEndpointList } from "../src/core/settings/migrate";

describe("migrateEndpointList", () => {
  it("parst den alten Textarea-String zeilenweise (Bestands-data.json)", () => {
    expect(migrateEndpointList("http://a:1\nhttp://b:2")).toEqual(["http://a:1", "http://b:2"]);
  });

  it("trimmt und wirft Leerzeilen weg", () => {
    expect(migrateEndpointList("  http://a:1  \n\n\nhttp://b:2")).toEqual([
      "http://a:1",
      "http://b:2",
    ]);
  });

  it("dedupliziert (parseEndpointList-Semantik)", () => {
    expect(migrateEndpointList("http://a:1\nhttp://a:1")).toEqual(["http://a:1"]);
  });

  it("lässt eine bereits migrierte Liste unverändert", () => {
    expect(migrateEndpointList(["http://a:1", "http://b:2"])).toEqual([
      "http://a:1",
      "http://b:2",
    ]);
  });

  it("filtert Leereinträge aus einer bestehenden Liste", () => {
    expect(migrateEndpointList(["http://a:1", "", "  "])).toEqual(["http://a:1"]);
  });

  it("liefert [] für undefined (Feld fehlt in data.json)", () => {
    expect(migrateEndpointList(undefined)).toEqual([]);
  });

  it("liefert [] für einen leeren String", () => {
    expect(migrateEndpointList("")).toEqual([]);
  });

  it("liefert [] für eine leere Liste", () => {
    expect(migrateEndpointList([])).toEqual([]);
  });
});
