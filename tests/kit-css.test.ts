// uebernommen aus obsidian-transmute/tests/kit-css.test.ts, 2026-10-09
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findVendoredCss, missingKitCss } from "./vendor/kit/kit-css";

// Kit-Vertrag: vendort wird das Verhalten, die Darstellung (`*_CSS`) ist eine Kopie in styles.css.
describe("Kit-CSS in styles.css", () => {
  const vendorDir = "src/vendor/kit-obsidian";
  it("der Waechter findet gevendorte Konstanten", () => {
    expect(findVendoredCss(vendorDir).length).toBeGreaterThan(0);
  });
  it("jede steht wortgleich in styles.css", () => {
    expect(missingKitCss(vendorDir, readFileSync("styles.css", "utf8"))).toEqual([]);
  });
});
