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
