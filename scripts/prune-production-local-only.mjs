import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

export function pruneProductionLocalOnlyAssets(outDir = join(projectRoot, "out")) {
  const targets = [
    join(outDir, "homeworld"),
    join(outDir, "local-only"),
  ];

  for (const target of targets) {
    if (!existsSync(target)) continue;
    rmSync(target, { force: true, recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  pruneProductionLocalOnlyAssets();
}
