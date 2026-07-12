// Obsidian-Guideline-Gate (PROF-OBS-08): type-checked gegen ECHTE obsidian-Typen.
// KEIN Inline-`// eslint-disable` — genuin unvermeidbare Ausnahmen NUR als file-scoped
// Override unten, mit Begruendung (Review verbietet Inline-disables).
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/", "tests/"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // --- file-scoped Overrides (mit Begruendung) ------------------------------
  {
    files: ["src/obsidian/settings.ts"],
    rules: {
      // Deklarative Settings-API (getSettingDefinitions) setzt Obsidian >=1.13.0 voraus;
      // manifest minAppVersion ist 1.8.7 < 1.13.0, also ist display() der einzig
      // unterstuetzte Weg — die Empfehlung ist hier ein Fehlalarm des Versionskonflikts.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      // Der Ordner-Placeholder "Yijing/Readings" ist ein Vault-PFAD (Eigenname), kein
      // Satztext — sentence-case wuerde ihn faelschlich kleinschreiben.
      "obsidianmd/ui/sentence-case": "off",
      // display() ist seit 1.13.0 zugunsten getSettingDefinitions() deprecated, aber unter
      // minAppVersion 1.8.7 der einzig unterstuetzte Settings-Weg (auch fuer this.display()
      // zum Re-Render) — die Deprecation-Warnung ist hier ein Versionskonflikt-Fehlalarm.
      "@typescript-eslint/no-deprecated": "off",
    },
  },
);
