#!/usr/bin/env node
// Developer tool, not published. Spawns each provider's default command, sends one ACP
// `initialize`, and prints what the agent advertises. Later phases branch on these
// capabilities, so this is how they are checked against the installed versions.
import { spawn } from "node:child_process";

const TARGETS = {
  "claude-cli": ["claude-agent-acp"],
  "codex-cli": ["codex-acp"],
  "cursor-cli": ["cursor-agent", "acp"],
  "gemini-cli": ["gemini", "--acp"],
};
const TIMEOUT_MS = 30_000;

function probe([command, ...args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ error: `no reply within ${TIMEOUT_MS}ms` }), TIMEOUT_MS);
    child.on("error", (error) => finish({ error: error.message }));
    child.on("exit", (code) => finish({ error: `exited with code ${code} before replying` }));
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          if (message.id === 1) finish(message.result ?? { error: message.error });
        } catch {
          // Not JSON: an agent log line on stdout. Ignore it.
        }
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1, clientCapabilities: {} },
      })}\n`
    );
  });
}

const results = {};
for (const [provider, command] of Object.entries(TARGETS)) {
  const result = await probe(command);
  results[provider] = result.error
    ? { command: command.join(" "), error: result.error }
    : {
        command: command.join(" "),
        agentInfo: result.agentInfo ?? null,
        protocolVersion: result.protocolVersion,
        agentCapabilities: result.agentCapabilities ?? {},
        authMethods: (result.authMethods ?? []).map((method) => method.id),
      };
}
console.log(JSON.stringify(results, null, 2));
