// Regressions-Guard (übernommen aus vault-crews): ein natives dynamisches
// `import("node:…")` im gebauten Bundle wird von Obsidians Desktop-Renderer als
// Modul-URL-Fetch behandelt und per CSP/CORS geblockt. Node-Builtins MÜSSEN als
// statische top-level-Imports geschrieben sein, damit esbuild sie im cjs-Bundle zu
// `require("node:…")` umschreibt.
import { readFileSync } from "node:fs";

const BUNDLE = "main.js";
let src;
try {
  src = readFileSync(BUNDLE, "utf8");
} catch {
  console.error(`check:bundle: ${BUNDLE} nicht gefunden — erst bauen (node esbuild.config.mjs --production).`);
  process.exit(1);
}

const offenders = src.match(/import\(\s*["']node:[^"']+["']\s*\)/g);
if (offenders) {
  console.error(
    "check:bundle: FATAL — natives dynamisches import() von node:-Builtin(s) im Bundle.\n" +
      "  Node-Builtins als STATISCHE top-level-Imports schreiben.\n  Gefunden: " +
      [...new Set(offenders)].join(", "),
  );
  process.exit(1);
}

console.log("check:bundle: ok — kein natives node:-import() im Bundle.");
