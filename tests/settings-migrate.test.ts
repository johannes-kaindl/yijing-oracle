import { describe, expect, it } from "vitest";
import { migrateEndpointList, stripLegacyLlmFields } from "../src/core/settings/migrate";

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

describe("stripLegacyLlmFields", () => {
  it("entfernt das alte activeEndpoint-Feld", () => {
    const llm = { endpoints: ["http://a:1"], activeEndpoint: "http://a:1", model: "m" };
    stripLegacyLlmFields(llm);
    expect(llm).toEqual({ endpoints: ["http://a:1"], model: "m" });
  });

  it("ist ein No-Op, wenn das Feld gar nicht da ist", () => {
    const llm = { endpoints: ["http://a:1"] };
    expect(stripLegacyLlmFields(llm)).toEqual({ endpoints: ["http://a:1"] });
  });
});

describe("onload-Migrationskette (Bestands-data.json bis 0.2.0)", () => {
  it("macht aus dem Textarea-String eine Liste und laesst keine Leiche zurueck", () => {
    // Form einer echten 0.2.0-data.json (verifiziert gegen eine echte Bestands-data.json, 2026-07-16):
    const raw = { llm: { endpoints: "http://localhost:1234", activeEndpoint: "http://localhost:1234", model: "qwen3" } };
    // exakt die Kette aus main.ts onload:
    const llm = { ...raw.llm } as Record<string, unknown>;
    llm.endpoints = migrateEndpointList(llm.endpoints as string);
    stripLegacyLlmFields(llm);

    expect(llm.endpoints).toEqual(["http://localhost:1234"]);
    expect(llm.activeEndpoint).toBeUndefined();
    expect(llm.model).toBe("qwen3"); // uebrige Bestandswerte ueberleben
  });
});
