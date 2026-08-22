#!/usr/bin/env node
/**
 * Typecheck the ```ts fences in README.md and docs/api.md against the real public surface.
 *
 * examples/ is compiled by `verify`; the markdown is not, and that asymmetry is exactly how a
 * broken streaming snippet survived in the README — it read `envelope.object`, which is not a
 * property of every member of the StreamEnvelope union, while examples/stream-prompt.ts did the
 * same thing correctly with the exported guard.
 *
 * Fences are narrative rather than standalone: later ones use identifiers earlier ones declared,
 * and not always in order. So each fence is checked in its OWN function scope against a typed
 * ambient preamble - a fence that declares `const port = ...` simply shadows the ambient one.
 *
 * Precede a fence with `<!-- snippet:skip -->` to exclude it (for deliberately partial code).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DOCS = ["README.md", "docs/api.md"];
const PKG = "@simpill/acp-llm-cli";

/** Identifiers the narrative introduces in one fence and reuses in another. */
const PREAMBLE = `
import type { IAgentPort } from "${PKG}";
import type { IHarnessAdapter } from "${PKG}/runtime";
import type { BaseCliConfig } from "${PKG}";
declare const port: IAgentPort;
declare const sessionId: string;
declare const adapter: IHarnessAdapter<BaseCliConfig>;
`;

function extractFences(markdown) {
  const lines = markdown.split("\n");
  const fences = [];
  let buf = null;
  let startLine = 0;
  for (const [i, line] of lines.entries()) {
    if (buf === null) {
      if (line.trim() === "```ts") {
        const prev = (lines[i - 1] ?? "").trim();
        if (prev === "<!-- snippet:skip -->") continue;
        buf = [];
        startLine = i + 2;
      }
      continue;
    }
    if (line.trim() === "```") {
      fences.push({ code: buf.join("\n"), startLine });
      buf = null;
      continue;
    }
    buf.push(line);
  }
  return fences;
}

/** Imports must sit at module scope; the rest goes in a function so fences cannot collide. */
function splitImports(code) {
  const importRe = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["'];?$/gm;
  const specs = [];
  const body = code.replace(importRe, (_m, isType, names, from) => {
    for (const raw of names.split(",")) {
      const name = raw.trim();
      if (name) specs.push({ name, from, type: Boolean(isType) });
    }
    return "";
  });
  return { specs, body };
}

/** One import statement per module, each name emitted once, so fences cannot redeclare. */
function renderImports(specs) {
  const byModule = new Map();
  for (const { name, from, type } of specs) {
    const key = `${type ? "type " : ""}${from}`;
    if (!byModule.has(key)) byModule.set(key, { from, type, names: new Set() });
    byModule.get(key).names.add(name);
  }
  return [...byModule.values()].map(
    ({ from, type, names }) =>
      `import ${type ? "type " : ""}{ ${[...names].sort().join(", ")} } from "${from}";`
  );
}

// Generated inside the repo, not in os.tmpdir(): TypeScript resolves `types: ["node"]` and the
// package imports through node_modules, which only works from a path under the project root.
const tmp = join(ROOT, ".docs-snippets");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
let failed = false;
try {
  const parts = [];
  const allSpecs = [];
  const index = [];
  for (const doc of DOCS) {
    const fences = extractFences(readFileSync(join(ROOT, doc), "utf8"));
    for (const [n, fence] of fences.entries()) {
      const { specs, body } = splitImports(fence.code);
      allSpecs.push(...specs);
      parts.push(`async function snippet_${doc.replace(/\W/g, "_")}_${n}() {\n${body}\n}`);
      parts.push(`void snippet_${doc.replace(/\W/g, "_")}_${n};`);
      index.push(`${doc}:${fence.startLine}`);
    }
  }
  if (index.length === 0) {
    console.error("No ```ts fences found — the extractor is probably broken.");
    process.exit(1);
  }

  writeFileSync(
    join(tmp, "snippets.ts"),
    [...renderImports(allSpecs), PREAMBLE, ...parts].join("\n\n")
  );
  writeFileSync(
    join(tmp, "tsconfig.json"),
    JSON.stringify({
      extends: join(ROOT, "tsconfig.json"),
      compilerOptions: {
        noEmit: true,
        rootDir: ROOT,
        declaration: false,
        declarationMap: false,
        // Snippets illustrate; they are not required to consume every binding they create.
        noUnusedLocals: false,
        noUnusedParameters: false,
        baseUrl: ROOT,
        paths: { [PKG]: ["src/index.ts"], [`${PKG}/runtime`]: ["src/runtime/index.ts"] },
      },
      include: [join(tmp, "snippets.ts")],
    })
  );

  try {
    execFileSync("npx", ["tsc", "-p", join(tmp, "tsconfig.json")], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
    console.log(`Docs snippets OK — ${index.length} fences typechecked (${index.join(", ")}).`);
  } catch (err) {
    failed = true;
    console.error("Docs snippets FAILED to typecheck.\n");
    console.error(String(err.stdout || "") + String(err.stderr || ""));
    console.error(`\nFences checked, in order: ${index.join(", ")}`);
    console.error(`Generated file kept for inspection: ${join(tmp, "snippets.ts")}`);
  }
} finally {
  if (!failed) rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
