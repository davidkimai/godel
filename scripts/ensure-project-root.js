#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function findProjectRoot(startDir) {
  let current = path.resolve(startDir);

  while (current !== path.dirname(current)) {
    const packageJsonPath = path.join(current, "package.json");
    const srcPath = path.join(current, "src");

    if (fs.existsSync(packageJsonPath) && fs.existsSync(srcPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        if (pkg && typeof pkg.name === "string" && pkg.name.includes("godel")) {
          return current;
        }
      } catch {
        // Continue walking up if package.json is unreadable.
      }
    }

    current = path.dirname(current);
  }

  return null;
}

function normalizeWithSep(inputPath) {
  const normalized = path.resolve(inputPath);
  return normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`;
}

function ensureProjectRoot() {
  const scriptDir = __dirname;
  const expectedRoot = findProjectRoot(scriptDir);

  if (!expectedRoot) {
    console.error("[godel-guard] Unable to determine project root from script location.");
    process.exit(1);
  }

  const cwd = path.resolve(process.cwd());
  const expectedWithSep = normalizeWithSep(expectedRoot);
  const cwdWithSep = normalizeWithSep(cwd);

  if (!cwdWithSep.startsWith(expectedWithSep)) {
    console.error("[godel-guard] Refusing to run outside the Godel project tree.");
    console.error(`[godel-guard] Current working directory: ${cwd}`);
    console.error(`[godel-guard] Expected inside: ${expectedRoot}`);
    console.error(`[godel-guard] Fix: cd \"${expectedRoot}\"`);
    process.exit(1);
  }
}

ensureProjectRoot();
