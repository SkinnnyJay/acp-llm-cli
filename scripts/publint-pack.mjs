#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarballName = execFileSync("npm", ["pack", "--quiet"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const tarball = join(root, tarballName);

try {
  execFileSync("npx", ["publint", tarball], { cwd: root, stdio: "inherit" });
} finally {
  rmSync(tarball, { force: true });
}
