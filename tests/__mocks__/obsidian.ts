// Drop-in fuer `import ... from "obsidian"` in Tests, verdrahtet ueber resolve.alias in
// vitest.config.ts (PROF-OBS-08: der Alias gehoert in vitest, NIE in tsconfig.json).
// Form uebernommen aus koda-agent/tests/__mocks__/obsidian.ts, 2026-09-02.
export * from "../vendor/kit/obsidian-mock";
