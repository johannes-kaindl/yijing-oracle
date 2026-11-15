// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { attachDomGuard } from "../src/vendor/kit-obsidian/dom-guard";
import { probeDomGuard } from "./vendor/kit/dom-guard-probe";

// Linkschutz-Nachweis (Kit-Baustein probeDomGuard, obsidian-kit 0.93.0): die Kopie des Waechters, die das Plugin ausliefert, haelt die Haertungs-Faelle.
describe("Linkschutz-Waechter", () => {
  it("haelt alle Faelle der Kit-Fallliste (kein leak, kein invalid)", async () => {
    expect((await probeDomGuard(attachDomGuard)).filter((x) => x.state !== "held")).toEqual([]);
  });
});
