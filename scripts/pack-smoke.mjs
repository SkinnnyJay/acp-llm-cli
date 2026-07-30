#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarballName = execFileSync("npm", ["pack", "--quiet"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const tarball = join(root, tarballName);
const tmp = mkdtempSync(join(tmpdir(), "acp-llm-cli-pack-"));

try {
  execFileSync("npm", ["init", "-y"], { cwd: tmp, stdio: "ignore" });
  execFileSync("npm", ["install", tarball], { cwd: tmp, stdio: "inherit" });
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('@simpill/acp-llm-cli').then((m) => { if (!m.getDefaultFactory) throw new Error('missing export'); console.log('pack-smoke-ok'); })",
    ],
    { cwd: tmp, stdio: "inherit" }
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
