import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUT_DIR = join(process.cwd(), "out");

const bannedOutputPatterns = [
  "/homeworld/skins",
  "homeworld-stage",
  "homeworld-furniture",
  "outdoor-adventure-room",
  "event_piggy_block",
  "relic_half_lollipop",
  "game-rank-test/outdoor-adventure/v1",
  "game-rank-test/homeworld/v1",
  "local-only/styles",
];

function walkTextFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTextFiles(path, files);
      continue;
    }
    if (/\.(?:css|html|js|txt)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

export function verifyProductionLocalOnlyPruned(outDir = DEFAULT_OUT_DIR) {
  const failures = [];

  for (const directory of ["homeworld", "local-only"]) {
    const path = join(outDir, directory);
    if (existsSync(path)) {
      failures.push(`Unexpected production directory: ${path}`);
    }
  }

  if (!existsSync(outDir)) {
    failures.push(`Production output directory does not exist: ${outDir}`);
  } else {
    for (const file of walkTextFiles(outDir)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of bannedOutputPatterns) {
        if (source.includes(pattern)) {
          failures.push(`Unexpected local-only production pattern "${pattern}" in ${file}`);
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  verifyProductionLocalOnlyPruned(process.argv[2] ?? DEFAULT_OUT_DIR);
}
