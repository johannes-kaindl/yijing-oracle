#!/usr/bin/env node
// Enforces the Global Constraint that `src/core/` and `src/vendor/kit/` must
// never import `obsidian`. Unlike a shell `grep -rl ... | !` one-liner, this
// script fails loudly (non-zero exit) instead of silently passing when the
// scanned directories don't exist, and it matches both quote styles.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/core", "src/vendor/kit"];
const IMPORT_PATTERN = /from\s+["']obsidian["']/;

function collectTsFiles(dir) {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return []; // directory doesn't exist yet — nothing to scan, not a failure
  }
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of collectTsFiles(root)) {
    const contents = readFileSync(file, "utf8");
    if (IMPORT_PATTERN.test(contents)) {
      offenders.push(file);
    }
  }
}

if (offenders.length > 0) {
  console.error("check:pure FAILED — 'obsidian' imported from a pure module:");
  for (const file of offenders) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

console.log("check:pure OK — no 'obsidian' imports in src/core or src/vendor/kit.");
process.exit(0);
