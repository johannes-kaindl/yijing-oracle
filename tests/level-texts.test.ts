import { describe, expect, it } from "vitest";
import { STRINGS } from "../src/i18n/strings";
import { THINKING_LEVELS } from "../src/vendor/kit/sampling-profiles";

// Seit code-kit 0.39.0 hat `ThinkingLevel` sechs Werte; die Modellzeile (Kit 0.73.0) zeigt sie als Auswahl und fragt `t("request.level.<stufe>")`.
// Fehlt ein Schlüssel, steht in der Auswahl der rohe Schlüssel („request.level.xhigh“), der aussieht wie ein Text. Der Wächter geht über die Liste
// des Kits, nicht über eine eigene (CORE-TEST-07), und über beide Sprachen.
describe("Textschlüssel der Denkstufen", () => {
  for (const lang of ["en", "de"] as const) {
    it(`${lang}: jede Stufe des Kits hat einen Text, der nicht der Schlüssel ist`, () => {
      expect(THINKING_LEVELS.length).toBeGreaterThanOrEqual(6);
      for (const level of THINKING_LEVELS) {
        const text = STRINGS[lang][`request.level.${level}`];
        expect(text, `request.level.${level} (${lang})`).toBeTruthy();
        expect(text).not.toBe(`request.level.${level}`);
      }
    });
  }
});
