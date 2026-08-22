#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Build first, then pack with --ignore-scripts - same reasoning as scripts/pack-smoke.mjs:
// `files` is ["dist"], so an unbuilt pack yields a tarball publint would be linting for nothing,
// and `npm pack` puts the prepack build output on stdout ahead of the tarball name.
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
const tarballName = execFileSync("npm", ["pack", "--ignore-scripts", "--quiet"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const tarball = join(root, tarballName);

try {
  execFileSync("npx", ["publint", tarball], { cwd: root, stdio: "inherit" });
} finally {
  rmSync(tarball, { force: true });
}
