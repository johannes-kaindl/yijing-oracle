import { describe, it, expect } from "vitest";
import { t, setLang } from "../src/vendor/kit/i18n";
import { EXPLAIN_TEXTS } from "../src/vendor/kit/explain-texts";
import { registerI18n } from "../src/i18n/strings";

/* Drei von acht Kit-Erklaertexten (explain-texts.ts@0.38.0) sind auf yijing-oracles eigene
   i18n-Schluessel gemappt (Auftrag yijing-w6). Die uebrigen fuenf (apiKeyThirdParty,
   reasoningOnlyNoText, reasoningIgnoresSuppress, suppressThinkingDesc, tokenLimitBeforeText)
   haben hier keine Entsprechung — yijing-oracle meldet diese Sachverhalte bislang nicht,
   das ist kein Teil dieses Auftrags. Getestet wird die Zuordnung, nicht der Kit-Text selbst
   (der ist obsidian-frei und Sache des Kit-Repos). */
registerI18n();

const MAPPING: { key: string; explainKey: keyof typeof EXPLAIN_TEXTS }[] = [
  { key: "notice.llmBlocked", explainKey: "corsBlocked" },
  { key: "src.modelHint.no-list", explainKey: "noModelList" },
  { key: "src.modelHint.unreachable", explainKey: "endpointUnreachableKeepsModel" },
];

describe("Kit-Erklaertexte (explain-texts.ts@0.38.0) auf yijing-oracles t() gemappt", () => {
  for (const lang of ["en", "de"] as const) {
    for (const { key, explainKey } of MAPPING) {
      it(`${key} liefert den Kit-Text (${lang.toUpperCase()})`, () => {
        setLang(lang);
        expect(t(key)).toBe(EXPLAIN_TEXTS[explainKey][lang]);
      });
    }
  }
});
