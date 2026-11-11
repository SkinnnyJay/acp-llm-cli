# Phase 1: Currency (0.5.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the package onto ACP SDK 2.x, run all four providers over ACP with current commands, make the flag tables match the binaries spawned, and release 0.5.0.

**Architecture:** `IAgentPort` is the seam and does not change. `ACPClient` is rewritten in place against the SDK 2.x `client()` app API. Cursor drops its custom print port and uses the shared ACP runtime like the other three providers.

**Tech Stack:** TypeScript (strict), Node >= 22, `@agentclientprotocol/sdk` ^2.5.0 (stable entrypoint), zod, eventemitter3, vitest, biome, tsup.

**Spec:** `docs/superpowers/specs/2026-11-10-phase-1-currency-design.md` (roadmap: `docs/superpowers/specs/2026-11-10-roadmap.md`)

## Global Constraints

- Branch: `feat/cli-currency-and-sessions`. Never commit to `main`. Never push.
- **Workers do not commit.** Leave changes in the working tree and report. The orchestrator commits each task after an independent review.
- SDK range is exactly `^2.5.0`. Import only from `@agentclientprotocol/sdk`. No `/unstable`, no `/experimental`.
- `IAgentPort` (`src/runtime/agent.port.ts`) keeps its current members. No session methods are added in this phase.
- Biome style: 2 spaces, double quotes, semicolons, 100 columns. Match the surrounding code. Change only what the task needs.
- No magic strings in provider code: commands and flags live in `src/domain/default.commands.ts` and each provider's `constants.ts`.
- After each task: `npm run verify` passes. Run commands once, without watch mode, with no background processes.
- Baseline on `main` at 0.4.0: `npm run verify` green, 405 tests passed, 4 skipped.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `package.json`, `package-lock.json` | SDK ^2.5.0; later dev deps and version 0.5.0 | 1, 5, 7 |
| `src/runtime/acp.client.ts` | ACP client on the 2.x app API | 1 |
| `__tests__/helpers/fake.acp.sdk.ts` (new) | Fake SDK `client()` app for client tests | 1 |
| `__tests__/acp.client.contract.test.ts` | Client contract against the fake app | 1 |
| `src/domain/default.commands.ts` | Default command and args per provider | 2, 3 |
| `src/providers/gemini/constants.ts` | Gemini flags | 2, 4 |
| `src/providers/cursor/*` | Cursor on the shared ACP runtime | 3 |
| `__tests__/fixtures/help/*.txt` (new) | Saved `--help` per spawned binary | 4 |
| `__tests__/provider.flags.drift.test.ts` (new) | Flag tables match fixtures | 4 |
| `scripts/refresh-help-fixtures.mjs` (new) | Regenerate fixtures | 4 |
| `src/cli/generic.options.ts`, `src/domain/models/*` | Remove deprecated exports, refresh models | 5 |
| `scripts/probe-capabilities.mjs` (new), `docs/capabilities.md` (new) | Record advertised capabilities | 6 |
| `README.md`, `docs/api.md`, `src/README.md`, `examples/*`, `.env.sample`, `CHANGELOG.md` | 0.5.0 docs | 7 |

---

### Task 1: Migrate the ACP client to SDK 2.x

**Files:**
- Modify: `package.json` (dependency `@agentclientprotocol/sdk`)
- Modify: `src/runtime/acp.client.ts`
- Create: `__tests__/helpers/fake.acp.sdk.ts`
- Modify: `__tests__/acp.client.contract.test.ts`
- Modify (only if typecheck requires): any other file importing a type that SDK 2.x renamed

**Interfaces:**
- Consumes: SDK 2.x stable exports `client`, `methods`, `PROTOCOL_VERSION`, `ndJsonStream`, `type ClientConnection`, `type Stream`, and the schema types already imported.
- Produces: `createAcpAgentPort(connection, options?)`, `IACPConnectionLike`, `ACPClientOptions`, all with unchanged signatures. The `ACPClient` instance keeps its public methods `requestPermission`, `sessionUpdate`, `readTextFile`, `writeTextFile`, `createTerminal`, `terminalOutput`, `waitForTerminalExit`, `releaseTerminal`, `killTerminal`, because existing tests and `LifecycleAgentPort` call them directly.

SDK 2.x facts (verified against the 2.5.0 type declarations):

```ts
client(options?): ClientApp
ClientApp.onRequest(method, handler)        // handler receives { params, signal, agent, requestId, method }
ClientApp.onNotification(method, handler)   // handler receives { params, signal, agent, method }
ClientApp.connect(stream: Stream): ClientConnection
ClientConnection: { agent: ClientContext; signal: AbortSignal; closed: Promise<void>; close(error?): void }
ClientContext.request(methods.agent.session.new, params): Promise<NewSessionResponse>
methods.agent: { initialize, authenticate, session: { new, load, list, delete, resume, close, setMode, setConfigOption, prompt, cancel } }
methods.client: { session: { requestPermission, update }, fs: { readTextFile, writeTextFile },
                  terminal: { create, output, release, waitForExit, kill } }
```

`ClientSideConnection`, the `Client` interface, and named outbound methods (`rpc.newSession(...)`) no longer exist.

- [ ] **Step 1: Bump the SDK**

Run: `npm install @agentclientprotocol/sdk@^2.5.0 --no-audit --no-fund`
Then run: `npm run typecheck`
Expected: FAIL. Errors name `ClientSideConnection` and `Client` in `src/runtime/acp.client.ts`. Record any error in another file; those are renamed types to fix in Step 6.

- [ ] **Step 2: Add the fake SDK app helper**

Create `__tests__/helpers/fake.acp.sdk.ts`:

```ts
import type { Mock } from "vitest";
import { vi } from "vitest";

type Handler = (context: { params: unknown }) => unknown;

/**
 * Stand-in for the SDK's `client()` app. Records the handlers ACPClient registers and the
 * requests it sends, so tests can drive inbound calls and assert outbound ones without a
 * real JSON-RPC peer.
 */
export interface FakeAcpSdk {
  /** Passed to vi.mock as the replacement for the SDK's `client` export. */
  client: Mock<() => FakeClientApp>;
  /** Outbound agent requests: (method, params). Resolves from `responses`. */
  request: Mock<(method: string, params: unknown) => Promise<unknown>>;
  /** Response per method name. Tests set these in beforeEach. */
  responses: Map<string, unknown>;
  /** Number of times app.connect(stream) ran, i.e. reader loops started. */
  connect: Mock<(stream: unknown) => unknown>;
  /** close() of the most recent connection handle. */
  close: Mock<() => void>;
  /** Invoke a registered inbound request handler as the agent would. */
  callRequest(method: string, params: unknown): Promise<unknown>;
  /** Invoke a registered inbound notification handler as the agent would. */
  callNotification(method: string, params: unknown): Promise<void>;
  reset(): void;
}

interface FakeClientApp {
  onRequest(method: string, handler: Handler): FakeClientApp;
  onNotification(method: string, handler: Handler): FakeClientApp;
  connect(stream: unknown): unknown;
}

export function createFakeAcpSdk(): FakeAcpSdk {
  const requestHandlers = new Map<string, Handler>();
  const notificationHandlers = new Map<string, Handler>();
  const responses = new Map<string, unknown>();
  const request = vi.fn(async (method: string, _params: unknown) => responses.get(method));
  const close = vi.fn();
  const connect = vi.fn((_stream: unknown) => ({
    agent: { request },
    signal: new AbortController().signal,
    closed: new Promise<void>(() => undefined),
    close,
  }));
  const app: FakeClientApp = {
    onRequest(method, handler) {
      requestHandlers.set(method, handler);
      return app;
    },
    onNotification(method, handler) {
      notificationHandlers.set(method, handler);
      return app;
    },
    connect,
  };
  const require = (map: Map<string, Handler>, method: string): Handler => {
    const handler = map.get(method);
    if (!handler) throw new Error(`no handler registered for ${method}`);
    return handler;
  };
  return {
    client: vi.fn(() => app),
    request,
    responses,
    connect,
    close,
    async callRequest(method, params) {
      return require(requestHandlers, method)({ params });
    },
    async callNotification(method, params) {
      await require(notificationHandlers, method)({ params });
    },
    reset() {
      request.mockClear();
      connect.mockClear();
      close.mockClear();
      responses.clear();
    },
  };
}
```

- [ ] **Step 3: Rewrite the contract test's mock**

In `__tests__/acp.client.contract.test.ts`, replace the seven `mock*` consts and the `vi.mock(...)` block (lines 9-33) with:

```ts
import { createFakeAcpSdk } from "./helpers/fake.acp.sdk";

const sdk = createFakeAcpSdk();

vi.mock("@agentclientprotocol/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agentclientprotocol/sdk")>();
  return { ...actual, client: sdk.client };
});
```

Then in every `beforeEach`, replace the `mockX.mockReset().mockResolvedValue(v)` lines with:

```ts
sdk.reset();
sdk.responses.set("initialize", { protocolVersion: 1, agentCapabilities: {} });
sdk.responses.set("session/new", { sessionId: "sess-contract-1" });
sdk.responses.set("session/prompt", { stopReason: "end_turn" });
sdk.responses.set("authenticate", {});
sdk.responses.set("session/set_mode", {});
sdk.responses.set("session/set_config_option", { configOptions: [] });
```

And translate each assertion mechanically, keeping every test and its intent:

| Old assertion | New assertion |
|---|---|
| `expect(mockInitialize).toHaveBeenCalled()` | `expect(sdk.request).toHaveBeenCalledWith("initialize", expect.anything())` |
| `expect(mockNewSession).toHaveBeenCalled()` | `expect(sdk.request).toHaveBeenCalledWith("session/new", expect.anything())` |
| `expect(mockPrompt).toHaveBeenCalled()` | `expect(sdk.request).toHaveBeenCalledWith("session/prompt", expect.anything())` |
| `mockAuthenticate` / `mockSetSessionMode` / `mockSetSessionConfigOption` | same pattern with `"authenticate"`, `"session/set_mode"`, `"session/set_config_option"` |
| `mockX.mock.calls[0][0]` (inspecting params) | `sdk.request.mock.calls.find(([m]) => m === "<method>")?.[1]` |
| `expect(mockConstructed).toHaveBeenCalledTimes(1)` | `expect(sdk.connect).toHaveBeenCalledTimes(1)` |
| a test asserting set-config-option is "not setSessionMode" | assert `sdk.request` was called with `"session/set_config_option"` and never with `"session/set_mode"` |

Add one test in the "session methods" describe block. It proves the agent-initiated path, which the old mock never exercised:

```ts
it("routes an agent-sent session/update notification to the port's sessionUpdate event", async () => {
  const port = createAcpAgentPort(createMockConnection());
  await port.connect();
  const seen: unknown[] = [];
  port.on("sessionUpdate", (u) => seen.push(u));
  const note = {
    sessionId: "s1",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } },
  };
  await sdk.callNotification("session/update", note);
  expect(seen).toEqual([note]);
});

it("answers an agent-sent permission request with cancelled when no handler is set", async () => {
  const port = createAcpAgentPort(createMockConnection());
  await port.connect();
  const result = await sdk.callRequest("session/request_permission", {
    sessionId: "s1",
    toolCall: { toolCallId: "t1" },
    options: [],
  });
  expect(result).toEqual({ outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } });
});

it("closes the SDK connection when the transport reports a terminal state", async () => {
  const connection = createMockConnection();
  const port = createAcpAgentPort(connection);
  await port.connect();
  connection.setStatus(CONNECTION_STATUS.DISCONNECTED);
  expect(sdk.close).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run the contract test and confirm it fails for the right reason**

Run: `npx vitest run __tests__/acp.client.contract.test.ts`
Expected: FAIL. The failure is an import/type error or `ClientSideConnection is not a constructor` from `src/runtime/acp.client.ts`, not a mistake in the test file.

- [ ] **Step 5: Rewrite `ACPClient`**

In `src/runtime/acp.client.ts`:

Replace the value import block so it reads (keep the existing `import type { ... }` block above it as is):

```ts
import {
  type ClientCapabilities,
  type ClientConnection,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  client,
  type KillTerminalRequest,
  type KillTerminalResponse,
  methods,
  PROTOCOL_VERSION,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
```

Change the class declaration and the `attached` field:

```ts
class ACPClient extends EventEmitter<AgentPortEvents> implements IAgentPort {
  /**
   * The live SDK connection and the stream it was built on, held together so "am I usable" has
   * exactly one representation. Keeping the stream lets connect() recognise that it is already
   * attached to it, instead of stacking a second reader loop on the same pipe.
   */
  private attached: { link: ClientConnection; stream: AcpStream } | undefined;
```

Add this private method, and call it nowhere but `connect()`:

```ts
  /** One app per attach: handlers are bound to this client and delegate to its own methods. */
  private buildApp() {
    return client()
      .onRequest(methods.client.session.requestPermission, ({ params }) =>
        this.requestPermission(params)
      )
      .onRequest(methods.client.fs.readTextFile, ({ params }) => this.readTextFile(params))
      .onRequest(methods.client.fs.writeTextFile, ({ params }) => this.writeTextFile(params))
      .onRequest(methods.client.terminal.create, ({ params }) => this.createTerminal(params))
      .onRequest(methods.client.terminal.output, ({ params }) => this.terminalOutput(params))
      .onRequest(methods.client.terminal.waitForExit, ({ params }) =>
        this.waitForTerminalExit(params)
      )
      .onRequest(methods.client.terminal.release, ({ params }) => this.releaseTerminal(params))
      .onRequest(methods.client.terminal.kill, ({ params }) => this.killTerminal(params))
      .onNotification(methods.client.session.update, ({ params }) => this.sessionUpdate(params));
  }
```

Replace `detach()`:

```ts
  private detach(): void {
    const attached = this.attached;
    this.attached = undefined;
    // Closing rejects requests still pending on a link whose process is gone, so callers
    // waiting on prompt() see an error rather than hanging.
    attached?.link.close();
  }
```

In `connect()`, replace the final assignment with:

```ts
    this.attached = { link: this.buildApp().connect(stream), stream };
```

Replace the six outbound methods' bodies:

```ts
  async initialize(params?: Partial<InitializeRequest>): Promise<InitializeResponse> {
    return this.requireAgent().request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: this.clientCapabilities,
      ...params,
    });
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.requireAgent().request(methods.agent.session.new, params);
  }

  async authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return this.requireAgent().request(methods.agent.authenticate, params);
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    return this.requireAgent().request(methods.agent.session.prompt, params);
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    return this.requireAgent().request(methods.agent.session.setMode, params);
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest
  ): Promise<SetSessionConfigOptionResponse> {
    return this.requireAgent().request(methods.agent.session.setConfigOption, params);
  }
```

Replace `requireConnection()` with:

```ts
  private requireAgent(): ClientConnection["agent"] {
    if (!this.attached) {
      throw new Error(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
    }
    return this.attached.link.agent;
  }
```

Leave the constructor, the EXIT ownership check, `disconnect()`, `requestPermission`, `sessionUpdate`, the seven tool-host methods and `requireToolHost` untouched. If a `request(...)` return type is wider than the declared return type (for example `X | void`), narrow at that one call site and say so in the report; do not change `IAgentPort`.

- [ ] **Step 6: Fix remaining type errors**

Run: `npm run typecheck`
Expected: PASS. If a type import elsewhere was renamed in 2.x, fix it at the import site only. `src/runtime/stdio.connection.ts` keeps `ndJsonStream` and `Stream`, both still exported.

- [ ] **Step 7: Run the client tests**

Run: `npx vitest run __tests__/acp.client.contract.test.ts __tests__/acp.client.permission.tool.test.ts __tests__/transport.client.integration.test.ts`
Expected: PASS. `transport.client.integration.test.ts` uses the real SDK over a real stream; if it fails, the client is wrong, not the test.

- [ ] **Step 8: Full verification**

Run: `npm run verify`
Expected: PASS, with at least 408 tests passed (405 baseline plus the three added).

- [ ] **Step 9: Live check**

Run: `npx tsx examples/minimal-claude.ts` with `ACP_LLM_CLI_CLAUDE_COMMAND=npx` and `ACP_LLM_CLI_CLAUDE_ARGS='-y @agentclientprotocol/claude-agent-acp@0.106.0'` if `claude-agent-acp` is not on PATH. Use a 120 second timeout.
Expected: the example completes a prompt round trip. If the environment has no Claude login, report that and the exact error; do not treat it as a pass.

- [ ] **Step 10: Report.** Do not commit.

---

### Task 2: Current commands for Gemini and the renamed wrapper packages

**Files:**
- Modify: `src/domain/default.commands.ts`
- Modify: `src/providers/gemini/constants.ts`
- Modify: `__tests__/default.commands.acpx-align.test.ts` (and any test asserting `--experimental-acp`)

**Interfaces:**
- Produces: `DEFAULT_COMMANDS.GEMINI_DEFAULT_ARGS` equal to `["--acp"]`; `GEMINI_CLI_ARG.ACP === "--acp"`.

- [ ] **Step 1: Change the test first.** In `__tests__/default.commands.acpx-align.test.ts`, change the Gemini expectation to `["--acp"]`. Run `npx vitest run __tests__/default.commands.acpx-align.test.ts`. Expected: FAIL, received `["--experimental-acp"]`.

- [ ] **Step 2: Update the defaults.** In `src/domain/default.commands.ts` set `GEMINI_DEFAULT_ARGS: ["--acp"] as const` and rewrite the header comment to:

```ts
/**
 * Default CLI command and args per provider. No literal command or arg strings in provider implementations.
 *
 * - Claude → `claude-agent-acp` (npm: @agentclientprotocol/claude-agent-acp)
 * - Codex → `codex-acp` (npm: @agentclientprotocol/codex-acp)
 * - Cursor → `cursor-agent acp`
 * - Gemini → `gemini --acp`
 */
```

(The Cursor line becomes true in Task 3; write it now so the comment is edited once.)

- [ ] **Step 3: Update Gemini's flag constant.** In `src/providers/gemini/constants.ts` rename the key `EXPERIMENTAL_ACP: "--experimental-acp"` to `ACP: "--acp"`. In `src/providers/codex/constants.ts` delete the `EXPERIMENTAL_ACP` entry (the wrapper has no such flag). Fix any reference `npm run typecheck` reports.

- [ ] **Step 4: Verify Codex's wrapper.** Run `npm install --no-save --prefix "$TMPDIR/codex-acp-probe" @agentclientprotocol/codex-acp`, then send one `initialize` request to `"$TMPDIR/codex-acp-probe/node_modules/.bin/codex-acp"` over stdin (newline-delimited JSON, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}`) with a 60 second timeout. Report the full response, or the stderr and exit code if there is none. If it needs arguments to start, add them to `CODEX_DEFAULT_ARGS` and its test.

- [ ] **Step 5: Verify.** Run `grep -rn "experimental-acp" src __tests__` (expected: no output) and `npm run verify` (expected: PASS).

- [ ] **Step 6: Report.** Do not commit.

---

### Task 3: Cursor on ACP, print port removed

**Files:**
- Modify: `src/domain/default.commands.ts`, `src/providers/cursor/adapter.ts`, `src/providers/cursor/schema.ts`, `src/providers/cursor/cli.definition.ts`, `src/providers/cursor/constants.ts`
- Delete: `src/providers/cursor/cursor.agent.port.ts`, `cursor.mode.utils.ts`, `cursor.ndjson.utils.ts`, `cursor.spawn.utils.ts`
- Delete: `__tests__/cursor.agent.port.spawn.test.ts`, `cursor.agent.port.test.ts`, `cursor.mode.test.ts`, `cursor.ndjson.test.ts`, `cursor.runtime.options.test.ts`, `cursor.timeout.test.ts`, `__tests__/helpers/cursor.config.ts`
- Delete: `examples/cursor-print.ts` (replaced in Task 7; remove its entry from `tsconfig.examples.json` if listed)
- Modify: `src/index.ts`, `src/runtime/index.ts`, `__tests__/public.surface.test.ts`, and any `src/domain/*` constant used only by the deleted files
- Create: `__tests__/cursor.adapter.acp.test.ts`

**Interfaces:**
- Consumes: `createStandardAcpRuntime`, `acpCliConfigSchema`, `createStandardCliSpec`.
- Produces: `cursorAdapter` with the same id/name; `CursorConfig = z.infer<typeof acpCliConfigSchema>`; `DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS` equal to `["acp"]`.

- [ ] **Step 1: Write the failing test.** Create `__tests__/cursor.adapter.acp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands";
import { PORT_CAPABILITY } from "../src/domain/port.capabilities";
import { claudeAdapter } from "../src/providers/claude/adapter";
import { cursorAdapter } from "../src/providers/cursor/adapter";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";

describe("cursor adapter over ACP", () => {
  it("defaults to `cursor-agent acp`", () => {
    expect(DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND).toBe("cursor-agent");
    expect([...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS]).toEqual(["acp"]);
  });

  it("builds the same kind of port as the other ACP providers", () => {
    const cursor = cursorAdapter.createRuntime({ command: "cursor-agent", args: ["acp"], env: {} });
    const claude = claudeAdapter.createRuntime({ command: "claude-agent-acp", args: [], env: {} });
    expect(cursor.constructor).toBe(claude.constructor);
    expect(cursor.capabilities?.[PORT_CAPABILITY.RESTART]).toBe(true);
    expect(cursor.capabilities?.[PORT_CAPABILITY.STREAM_PROMPT]).toBe(true);
    expect(typeof cursor.streamPrompt).toBe("function");
  });

  it("honours session persistence instead of ignoring it", () => {
    const port = cursorAdapter.createRuntime(
      { command: "cursor-agent", args: ["acp"], env: {} },
      { sessionPersistence: createMemorySessionPersistence() }
    );
    expect(port.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(true);
  });

  it("rejects the removed print-mode config fields as unknown input no longer typed", () => {
    const parsed = cursorAdapter.configSchema.parse({
      command: "cursor-agent",
      args: ["acp"],
      env: {},
    });
    expect(parsed).not.toHaveProperty("mode");
  });
});
```

Run: `npx vitest run __tests__/cursor.adapter.acp.test.ts`. Expected: FAIL (args are `[]`, constructors differ). If `capabilities[STREAM_PROMPT]` is not set by the shared runtime for Claude either, drop that one line and keep the `typeof streamPrompt` assertion.

- [ ] **Step 2: Defaults.** In `src/domain/default.commands.ts` set `CURSOR_DEFAULT_ARGS: ["acp"] as const`.

- [ ] **Step 3: Schema.** Replace `src/providers/cursor/schema.ts` with:

```ts
import type { z } from "zod";
import { acpCliConfigSchema } from "../../cli/provider.config.schema";

/**
 * Cursor CLI config: base command/args/cwd/env plus generic LLM options. Cursor runs as an ACP
 * server (`cursor-agent acp`), so mode and model are selected over the protocol, not by flags.
 */
export const cursorConfigSchema = acpCliConfigSchema;

export type CursorConfig = z.infer<typeof cursorConfigSchema>;
```

- [ ] **Step 4: Adapter.** Replace `src/providers/cursor/adapter.ts` with:

```ts
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { PROVIDER_IDS } from "../../domain/provider.ids";
import type { IAgentPort } from "../../runtime/agent.port";
import { createCliHarnessAdapter } from "../../runtime/create.cli.harness.adapter";
import type { AcpSharedRuntimeOptions } from "../acp.shared";
import { createStandardAcpRuntime } from "../acp.shared";
import { cursorCliSpec } from "./cli.definition";
import { CURSOR_CONFIG_KEYS } from "./constants";
import type { CursorConfig } from "./schema";
import { cursorConfigSchema } from "./schema";

const createRuntime = (
  config: CursorConfig,
  runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort =>
  createStandardAcpRuntime(
    config,
    {
      command: DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND,
      args: [...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS],
    },
    {
      commandKey: CURSOR_CONFIG_KEYS.COMMAND_KEY,
      argsKey: CURSOR_CONFIG_KEYS.ARGS_KEY,
    },
    cursorConfigSchema,
    {
      ...runtimeOptions,
      providerId: runtimeOptions?.providerId ?? PROVIDER_IDS.CURSOR_CLI_ID,
    }
  );

export const cursorAdapter = createCliHarnessAdapter<CursorConfig>({
  id: PROVIDER_IDS.CURSOR_CLI_ID,
  name: PROVIDER_IDS.CURSOR_CLI_NAME,
  configSchema: cursorConfigSchema,
  createRuntime,
  cliSpec: cursorCliSpec,
});
```

- [ ] **Step 5: CLI definition and constants.** Replace `src/providers/cursor/cli.definition.ts` with:

```ts
import { createStandardCliSpec } from "../../cli/standard.cli.factory";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { CURSOR_CLI_ARG, CURSOR_GENERIC_FLAG_MAP } from "./constants";
import type { CursorConfig } from "./schema";

export const cursorCliSpec = createStandardCliSpec<CursorConfig>(
  DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS,
  CURSOR_GENERIC_FLAG_MAP,
  CURSOR_CLI_ARG
);
```

In `src/providers/cursor/constants.ts` keep `CURSOR_CONFIG_KEYS`, `CURSOR_CLI_ARG`, `CURSOR_GENERIC_FLAG_MAP` and add `CURSOR_CLI_SUBCOMMAND = { ACP: "acp" } as const` in place of `CREATE_CHAT`. Delete `CURSOR_OUTPUT_FORMAT`, `CURSOR_CONFIG_OPTION`, `CURSOR_MODE`, `CURSOR_NDJSON_TYPE`, `CURSOR_NDJSON_SUBTYPE`, `CURSOR_UUID_PATTERN`, `CURSOR_HEALTH_CHECK_PROMPT`. (The contents of `CURSOR_CLI_ARG` are corrected in Task 4; leave them here.)

- [ ] **Step 6: Delete the print port.** `git rm` the four source files and seven test files listed above and `examples/cursor-print.ts`.

- [ ] **Step 7: Remove orphans.** Run `npm run typecheck` and `npm run lint`. For every error, remove the dead import, export or constant your deletion orphaned (public exports in `src/index.ts` and `src/runtime/index.ts`, Cursor-only entries in `src/domain/timeouts.ts`, `src/domain/error.messages.ts`, `src/domain/limits.ts`, and assertions in `__tests__/public.surface.test.ts`, `__tests__/provider.config.parity.test.ts`, `__tests__/factory.runtime.options.test.ts`, `__tests__/branch.coverage.test.ts`). To find Cursor-only constants: for each key in those domain files, `grep -rn "<KEY>" src` and delete keys with no remaining reader. List every removed public export in the report; Task 7 needs them for the CHANGELOG.

- [ ] **Step 8: Verify.** Run `npm run verify`. Expected: PASS. Then `npm run test:coverage`. Expected: thresholds met.

- [ ] **Step 9: Live check.** Write a throwaway script outside the repo (in `$TMPDIR`) that imports from the repo's `src/index.ts` with `tsx`, creates the Cursor runtime with default config, then runs `connect()`, `initialize()`, `newSession({ cwd: <an empty temp directory>, mcpServers: [] })`, one `prompt` asking for the single word "ok", prints the stop reason and collected text, and calls `disconnect()` in a `finally`. Use a 120 second timeout. Expected: a stop reason of `end_turn` and non-empty text. If Cursor asks for authentication, call `authenticate({ methodId: "cursor_login" })` after `initialize()` and report that it was needed. Report the exact output. A failure here blocks the task: with the print port gone there is no fallback.

- [ ] **Step 10: Report.** Do not commit.

---

### Task 4: Truthful flag tables with a drift test

**Files:**
- Create: `scripts/refresh-help-fixtures.mjs`, `__tests__/fixtures/help/{claude,codex,cursor,gemini}.txt`, `__tests__/provider.flags.drift.test.ts`
- Modify: `src/providers/{claude,codex,cursor,gemini}/constants.ts`, `src/cli/generic.options.ts`, `package.json` (script `refresh:help`), tests that assert removed flags

**Interfaces:**
- Produces: each `*_CLI_ARG` contains only flags present in that provider's fixture; `npm run refresh:help` regenerates fixtures.

- [ ] **Step 1: Refresh script.** Create `scripts/refresh-help-fixtures.mjs`:

```js
#!/usr/bin/env node
// Saves the --help output of each binary this package spawns, so the flag tables in
// src/providers/*/constants.ts can be checked against what the binary really accepts.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "__tests__", "fixtures", "help");

// One entry per provider: every invocation whose help contributes accepted flags.
const TARGETS = {
  claude: { bin: "claude-agent-acp", help: [["--help"]], version: ["--version"] },
  codex: { bin: "codex-acp", help: [["--help"]], version: ["--version"] },
  cursor: { bin: "cursor-agent", help: [["--help"], ["acp", "--help"]], version: ["--version"] },
  gemini: { bin: "gemini", help: [["--help"]], version: ["--version"] },
};

function run(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 30_000 });
  if (result.error) return undefined;
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
}

mkdirSync(outDir, { recursive: true });
for (const [provider, target] of Object.entries(TARGETS)) {
  const version = run(target.bin, target.version);
  if (version === undefined) {
    console.log(`skip ${provider}: ${target.bin} is not installed`);
    continue;
  }
  const sections = target.help.map((args) => `$ ${target.bin} ${args.join(" ")}\n${run(target.bin, args) ?? ""}`);
  const body = `# ${target.bin} ${version.split("\n")[0]}\n\n${sections.join("\n\n")}\n`;
  writeFileSync(join(outDir, `${provider}.txt`), body);
  console.log(`wrote ${provider}.txt`);
}
```

Add to `package.json` scripts: `"refresh:help": "node scripts/refresh-help-fixtures.mjs"`.

- [ ] **Step 2: Generate fixtures.** Make the two wrappers available first: `npm install -g @agentclientprotocol/claude-agent-acp @agentclientprotocol/codex-acp` is NOT allowed (no global installs). Instead run the script with a PATH prefix: install both into `$TMPDIR/acp-wrappers` with `npm install --prefix "$TMPDIR/acp-wrappers" @agentclientprotocol/claude-agent-acp @agentclientprotocol/codex-acp`, then `PATH="$TMPDIR/acp-wrappers/node_modules/.bin:$PATH" npm run refresh:help`. Expected: four `wrote` lines. If a wrapper prints no help (it starts an ACP server and waits on stdin, hitting the 30s timeout), its fixture holds the version line and an empty body; that is the truthful result and its flag table becomes empty.

- [ ] **Step 3: Write the drift test.** Create `__tests__/provider.flags.drift.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CLI_ARG } from "../src/providers/claude/constants";
import { CODEX_CLI_ARG } from "../src/providers/codex/constants";
import { CURSOR_CLI_ARG } from "../src/providers/cursor/constants";
import { GEMINI_CLI_ARG } from "../src/providers/gemini/constants";

const TABLES: Record<string, Record<string, string>> = {
  claude: CLAUDE_CLI_ARG,
  codex: CODEX_CLI_ARG,
  cursor: CURSOR_CLI_ARG,
  gemini: GEMINI_CLI_ARG,
};

/** Every flag token (`-p`, `--model`) that appears in a help text. */
function flagsIn(help: string): Set<string> {
  return new Set(help.match(/(?<![\w-])--?[A-Za-z][\w-]*/g) ?? []);
}

describe("provider flag tables match the spawned binary's --help", () => {
  for (const [provider, table] of Object.entries(TABLES)) {
    it(`${provider}: every declared flag exists in the saved help`, () => {
      const help = readFileSync(join(__dirname, "fixtures", "help", `${provider}.txt`), "utf8");
      const known = flagsIn(help);
      const unknown = Object.values(table).filter((flag) => !known.has(flag));
      expect(unknown).toEqual([]);
    });
  }

  it("flagsIn does not treat hyphenated words as flags", () => {
    expect([...flagsIn("use stream-json with --output-format or -p")]).toEqual([
      "--output-format",
      "-p",
    ]);
  });
});
```

Run: `npx vitest run __tests__/provider.flags.drift.test.ts`. Expected: FAIL for claude and codex at least, listing flags such as `--print`.

- [ ] **Step 4: Correct the tables.** For each provider, delete from `*_CLI_ARG` every flag the test reports, and delete the matching `*_GENERIC_FLAG_MAP` entry. Then add the flags below when, and only when, they appear in that provider's fixture, mapping a generic key where one exists:

| Provider | Add if present in fixture |
|---|---|
| gemini | `ACP: "--acp"`, `APPROVAL_MODE: "--approval-mode"`, `INCLUDE_DIRECTORIES: "--include-directories"`, `SANDBOX: "--sandbox"`, `ALLOWED_MCP_SERVER_NAMES: "--allowed-mcp-server-names"`, `DEBUG: "--debug"` |
| cursor | `MODEL: "--model"`, `WORKSPACE: "--workspace"`, `ADD_DIR: "--add-dir"`, `WORKTREE: "--worktree"`, `WORKTREE_BASE: "--worktree-base"`, `PLUGIN_DIR: "--plugin-dir"`, `APPROVE_MCPS: "--approve-mcps"`, `TRUST: "--trust"`, `SANDBOX: "--sandbox"`, `MODE: "--mode"` |
| claude, codex | only what the wrapper's own help lists |

Remove from Cursor's table the print-only flags `-p`, `--output-format`, `--stream-partial-output`, `--resume`, and their flag-map entries: they do not apply to `cursor-agent acp`.

Add this comment above `CURSOR_CLI_ARG`:

```ts
/**
 * Flags `cursor-agent` accepts. They are global options placed before the `acp` subcommand
 * (`cursor-agent --model x acp`); `acp` itself takes none.
 */
```

- [ ] **Step 5: Prune generic options.** In `src/cli/generic.options.ts`, for each key in `GENERIC_OPTION_KEY`, run `grep -rn "GENERIC_OPTION_KEY.<KEY>" src/providers`. Delete keys with no result from `GENERIC_OPTION_KEY` and `genericLlmCliOptionsSchema`, plus `INPUT_FORMAT`/`OUTPUT_FORMAT`/`SANDBOX_MODE` imports that become unused. Keep `model` regardless: `createStandardAcpRuntime` reads `config.model`. Fix the tests that referenced removed keys (`arg.builder.test.ts`, `provider.cli.spec.test.ts`, `provider.schema.model.test.ts`, `config.passthrough.test.ts`) by deleting only the cases for removed keys. List removed keys in the report.

- [ ] **Step 6: Verify.** `npx vitest run __tests__/provider.flags.drift.test.ts` (PASS), then `npm run verify` (PASS).

- [ ] **Step 7: Report.** Do not commit.

---

### Task 5: Remove deprecated exports, refresh models, update dev dependencies

**Files:**
- Modify: `src/cli/generic.options.ts`, `src/cli/index.ts`, `src/index.ts`, `src/domain/models/*.ts`, `__tests__/public.surface.test.ts`, `__tests__/model.constants.test.ts`, `package.json`, `package-lock.json`

- [ ] **Step 1: Remove `GENERIC_OPTION_DEFAULTS`.** Delete the constant and its doc comment from `src/cli/generic.options.ts`, its re-exports, and its entry in `__tests__/public.surface.test.ts`.

- [ ] **Step 2: Remove `*_MODEL_ID_LIST`.** Run `grep -rn "_MODEL_ID_LIST" src __tests__ scripts README.md docs/api.md`. Delete each definition, re-export and test assertion. If `scripts/update-models.ts` or `scripts/model.constants.ts` generates them, remove that generation too so the next refresh does not bring them back.

- [ ] **Step 3: Refresh models.** Run `npm run update-models` with a 120 second timeout. If it needs API keys that are not set, or network access that fails, leave the model files untouched and report the exact message. Otherwise review `git diff src/domain/models` and keep the result.

- [ ] **Step 4: Dev dependencies.** Run `npm outdated`. Update each devDependency to its latest version within the current major with `npm install -D <name>@<range>`. For a new major (for example TypeScript, tsup, `@types/node`), try it, run `npm run verify`, and keep it only if green with no source changes beyond config; otherwise revert that one package and list it as deferred with the error. `@types/node` stays on major 22 to match `engines.node`.

- [ ] **Step 5: Verify.** `npm run verify`, `npm run pack:smoke`, `npm run publint`. Expected: all PASS.

- [ ] **Step 6: Report** removed exports, model changes, and each dependency's old and new version. Do not commit.

---

### Task 6: Capability probe

**Files:**
- Create: `scripts/probe-capabilities.mjs`, `docs/capabilities.md`
- Modify: `package.json` (script `probe`)

- [ ] **Step 1: Script.** Create `scripts/probe-capabilities.mjs`:

```js
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
    const finish = (result) => {
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
```

Add to `package.json` scripts: `"probe": "node scripts/probe-capabilities.mjs"`.

- [ ] **Step 2: Run it.** `PATH="$TMPDIR/acp-wrappers/node_modules/.bin:$PATH" npm run --silent probe` (reuse the wrapper install from Task 4, or reinstall it the same way). Use a 180 second timeout. Expected: JSON with four keys; a provider that is not installed or does not answer has an `error` field.

- [ ] **Step 3: Save the result.** Create `docs/capabilities.md` with: a one-paragraph explanation of what the file is and how to regenerate it (`npm run probe`), the date, a table with one row per provider and one column each for `loadSession`, `list`, `resume`, `close`, `delete`, `fork`, `additionalDirectories` (yes / no / not measured, read from `agentCapabilities.loadSession` and `agentCapabilities.sessionCapabilities`), and the raw JSON in a fenced block. A provider with an `error` is "not measured" with the error text beneath the table.

- [ ] **Step 4: Verify.** `npm run lint` and `npm run verify`. Expected: PASS.

- [ ] **Step 5: Report.** Do not commit.

---

### Task 7: Documentation and version 0.5.0

**Files:**
- Modify: `README.md`, `docs/api.md`, `src/README.md`, `.env.sample`, `CHANGELOG.md`, `package.json` (version), `AGENTS.md` if it names removed things
- Create: `examples/cursor-acp.ts` (add to `tsconfig.examples.json` if examples are listed there)

- [ ] **Step 1: Example.** Create `examples/cursor-acp.ts` by copying `examples/minimal-claude.ts` and changing only the provider to Cursor and the comments to say `cursor-agent acp`. Run `npm run typecheck:examples`. Expected: PASS.

- [ ] **Step 2: Docs.** Run `grep -rn -i "experimental-acp\|ClientSideConnection\|zed-industries\|cursor-print\|stream-json\|print port\|GENERIC_OPTION_DEFAULTS\|_MODEL_ID_LIST\|workspacePath\|approveMcps" README.md docs/api.md src/README.md .env.sample AGENTS.md examples`. Rewrite each hit to describe the new behaviour. Document: the four default commands and the npm package that provides each binary; that Cursor now needs `cursor-agent` with the `acp` subcommand; the `refresh:help` and `probe` scripts; a link to `docs/capabilities.md`. Every code snippet must still pass `npm run check:docs`.

- [ ] **Step 3: CHANGELOG.** Add a `## 0.5.0` section above the previous release, in the file's existing style, with these subsections filled from the earlier tasks' reports:

  - **Breaking**: ACP SDK peer/dependency `^2.5.0`; Cursor runs over ACP and the print port, its config fields (`mode`, `workspacePath`, `force`, `browser`, `approveMcps`, `approvalTimeoutMs`) and each removed export are gone; `GENERIC_OPTION_DEFAULTS` and `*_MODEL_ID_LIST` removed; each removed generic option key.
  - **Changed**: Gemini default arg `--acp`; flag tables corrected; wrapper package names.
  - **Added**: flag drift test and `refresh:help`; `probe` and `docs/capabilities.md`.
  - **Migration**: a short before/after for a Cursor caller (old config with `mode`/`workspacePath` → new config, with mode set through `setSessionMode` and model through `setSessionConfigOption`).

- [ ] **Step 4: Version.** Run `npm version 0.5.0 --no-git-tag-version`.

- [ ] **Step 5: Final verification.** Run each and expect PASS: `npm run verify:coverage`, `npm run pack:smoke`, `npm run publint`. Then `grep -rn "experimental-acp\|ClientSideConnection\|zed-industries" src examples README.md docs/api.md`. Expected: no output.

- [ ] **Step 6: Report.** Do not commit.

---

## Self-review notes

- Spec section 1 → Task 1. Section 2 → Tasks 2 and 3. Section 3 → Task 4. Section 4 → Tasks 5 and 7. Section 5 → Task 6. "Done when" items 1, 2, 5 → Task 7 Step 5; item 3 → Task 1 Step 9 and Task 3 Step 9; item 4 → Task 6.
- The spec's commit groups 2 to 8 are Tasks 1 to 7 in order.
- Names used across tasks: `DEFAULT_COMMANDS.*_DEFAULT_ARGS`, `*_CLI_ARG`, `*_GENERIC_FLAG_MAP`, `CURSOR_CLI_SUBCOMMAND.ACP`, `GEMINI_CLI_ARG.ACP`, `createFakeAcpSdk`, `sdk.request` / `sdk.connect` / `sdk.close` / `sdk.callRequest` / `sdk.callNotification`.
