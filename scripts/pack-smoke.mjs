#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Build explicitly, then pack with --ignore-scripts.
//
// `files` is ["dist"], so on a clean checkout an unbuilt pack produces a tarball of just
// package.json, README and LICENSE - one in which every exports subpath resolves to nothing.
// That is what this smoke test exists to catch, so it must not depend on a dist left over from
// an earlier command.
//
// Packing with scripts disabled keeps stdout clean: `npm pack` fires the prepack lifecycle and
// that build output goes to stdout alongside the tarball name, so parsing the stream yields the
// build log plus the name. Neither --quiet nor --json suppresses lifecycle script output.
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
const tarballName = execFileSync("npm", ["pack", "--ignore-scripts", "--quiet"], {
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
      [
        "const root = await import('@simpill/acp-llm-cli');",
        "if (!root.getDefaultFactory) throw new Error('missing root export: getDefaultFactory');",
        "if (typeof root.HarnessRegistry !== 'function') throw new Error('HarnessRegistry is not a value export');",
        // The ./runtime export condition was never imported end to end, so a module that threw on
        // import - or a broken subpath - would have shipped undetected.
        "const runtime = await import('@simpill/acp-llm-cli/runtime');",
        "if (!runtime.StdioConnection) throw new Error('missing runtime export: StdioConnection');",
        "if (runtime.HarnessRegistry !== root.HarnessRegistry) throw new Error('shared symbol has two identities');",
        "console.log('pack-smoke-ok');",
      ].join("\n"),
    ],
    { cwd: tmp, stdio: "inherit" }
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
