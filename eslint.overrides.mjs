// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
export default [
  {
    // Type-aware Linting braucht das Build-tsconfig des Repos. Achtung Falle
    // (json_viewer 1.9.0): ein obsidian→Mock-paths-Alias im referenzierten tsconfig
    // laesst die type-aware Regeln auf einen losen Mock aufloesen → no-unsafe-*-Kaskade.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Alt: eine Datei src/obsidian/settings.ts. Seit 04a6125 (Aufteilung der
    // 447-Zeilen-Klasse) liegt die SettingsTab-Klasse (display()) in settings/index.ts —
    // Pfad hier entsprechend nachgezogen, sonst liefe der Override ins Leere.
    files: ["src/obsidian/settings/index.ts"],
    rules: {
      // Deklarative Settings-API (getSettingDefinitions) setzt Obsidian >=1.13.0 voraus;
      // manifest minAppVersion ist 1.8.7 < 1.13.0, also ist display() der einzig
      // unterstuetzte Weg — die Empfehlung ist hier ein Fehlalarm des Versionskonflikts.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      // display() ist seit 1.13.0 zugunsten getSettingDefinitions() deprecated, aber unter
      // minAppVersion 1.8.7 der einzig unterstuetzte Settings-Weg (auch fuer this.display()
      // zum Re-Render) — die Deprecation-Warnung ist hier ein Versionskonflikt-Fehlalarm.
      "@typescript-eslint/no-deprecated": "off",
    },
  },
  {
    // Sentence-case-Override, ebenfalls aus dem alten settings.ts uebernommen, jetzt auf
    // die Sektionsdateien verteilt, in denen die betroffenen Placeholder liegen.
    files: ["src/obsidian/settings/image-section.ts", "src/obsidian/settings/note-section.ts"],
    rules: {
      // Alle drei betroffenen Strings sind keine Satztexte, sondern technische Werte:
      // - "http://127.0.0.1:7860" (image-section.ts): URL-Placeholder.
      // - "Yijing/Readings" (note-section.ts): Vault-PFAD (Eigenname).
      // - "quote" (note-section.ts): Obsidian-Callout-Typ-Keyword ([!quote]) — muss
      //   kleingeschrieben bleiben, sentence-case wuerde die Callout-Syntax brechen.
      // sentence-case wuerde alle drei faelschlich umschreiben.
      "obsidianmd/ui/sentence-case": "off",
    },
  },
];
