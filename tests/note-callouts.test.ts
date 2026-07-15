import { describe, it, expect } from "vitest";
import { mergeCallouts, DEFAULT_CALLOUTS, CALLOUT_SECTIONS } from "../src/core/note-callouts";

describe("mergeCallouts", () => {
  it("liefert die Defaults bei undefined", () => {
    expect(mergeCallouts(undefined)).toEqual(DEFAULT_CALLOUTS);
  });
  it("füllt fehlende Sektionen auf und erhält gesetzte Werte", () => {
    const merged = mergeCallouts({ judgment: { enabled: false } });
    expect(merged.judgment.enabled).toBe(false);
    expect(merged.judgment.type).toBe("quote"); // Feld ergänzt
    expect(merged.image).toEqual(DEFAULT_CALLOUTS.image); // Sektion ergänzt
    expect(Object.keys(merged).sort()).toEqual([...CALLOUT_SECTIONS].sort());
  });
  it("ergänzt die neue artwork-Sektion in alten Configs", () => {
    const legacy = { overview: { enabled: false, type: "note" } };
    const merged = mergeCallouts(legacy as never);
    expect(merged.artwork).toEqual({ enabled: true, type: "quote" });
    expect(merged.overview.enabled).toBe(false);
  });
});
