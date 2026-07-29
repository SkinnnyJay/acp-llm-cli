import type {
  PromptRequest,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { AGENT_PORT_EVENT } from "../domain/agent.port.events";
import type { ConnectionStatus } from "../domain/connection.status";
import { ENVELOPE_MODE } from "../domain/envelope.mode";
import type { EnvelopeMode } from "../domain/envelope.mode";
import { OPENAI_COMPAT } from "../domain/openai.compat";
import { PORT_CAPABILITY } from "../domain/port.capabilities";
import type { StreamEnvelope } from "../domain/stream.envelopes";
import type {
  AgentPortCapabilities,
  AgentPortEvents,
  IAgentPort,
  StreamPromptOptions,
} from "./agent.port";
import { createOpenAIFinishEnvelope, sessionUpdateToEnvelopes } from "./envelope.mapper";
import { createStreamPromptQueue } from "./stream.prompt.queue";

export interface WrapAgentPortOptions {
  envelopeMode?: EnvelopeMode;
  modelId?: string;
}

/**
 * Wraps an IAgentPort to add streamPrompt (dual-envelope ACP→OpenAI bridging),
 * plus restart, open, and close capability metadata.
 * Keeps envelope logic in one place so providers remain thin.
 */
export class StreamAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities: AgentPortCapabilities;

  private readonly inner: IAgentPort;
  private readonly envelopeMode: EnvelopeMode;
  private readonly modelId: string | undefined;

  constructor(inner: IAgentPort, options: WrapAgentPortOptions = {}) {
    super();
    this.inner = inner;
    this.envelopeMode = options.envelopeMode ?? ENVELOPE_MODE.BOTH;
    this.modelId = options.modelId;

    this.capabilities = {
      [PORT_CAPABILITY.STREAM_PROMPT]: true,
      [PORT_CAPABILITY.RESTART]: true,
      [PORT_CAPABILITY.OPEN_CLOSE]: true,
    };

    inner.on(AGENT_PORT_EVENT.STATE, (status: ConnectionStatus) =>
      this.emit(AGENT_PORT_EVENT.STATE, status)
    );
    inner.on(AGENT_PORT_EVENT.SESSION_UPDATE, (update: SessionNotification) =>
      this.emit(AGENT_PORT_EVENT.SESSION_UPDATE, update)
    );
    inner.on(AGENT_PORT_EVENT.PERMISSION_REQUEST, (request: RequestPermissionRequest) =>
      this.emit(AGENT_PORT_EVENT.PERMISSION_REQUEST, request)
    );
    inner.on(AGENT_PORT_EVENT.ERROR, (error: Error) => this.emit(AGENT_PORT_EVENT.ERROR, error));
  }

  get connectionStatus(): ConnectionStatus {
    return this.inner.connectionStatus;
  }

  async connect(): Promise<void> {
    return this.inner.connect();
  }

  async disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  async initialize(...args: Parameters<IAgentPort["initialize"]>) {
    return this.inner.initialize(...args);
  }

  async newSession(...args: Parameters<IAgentPort["newSession"]>) {
    return this.inner.newSession(...args);
  }

  async prompt(...args: Parameters<IAgentPort["prompt"]>) {
    return this.inner.prompt(...args);
  }

  async authenticate(...args: Parameters<IAgentPort["authenticate"]>) {
    return this.inner.authenticate(...args);
  }

  async sessionUpdate(...args: Parameters<IAgentPort["sessionUpdate"]>) {
    return this.inner.sessionUpdate(...args);
  }

  get setSessionMode() {
    return this.inner.setSessionMode?.bind(this.inner);
  }

  get setSessionModel() {
    return this.inner.setSessionModel?.bind(this.inner);
  }

  async *streamPrompt(
    params: PromptRequest,
    streamOptions?: StreamPromptOptions
  ): AsyncIterable<StreamEnvelope> {
    const mode = streamOptions?.envelopeMode ?? this.envelopeMode;
    const modelId = this.modelId;
    const queue = createStreamPromptQueue();
    const handler = (update: SessionNotification) => queue.push(update);
    this.inner.on(AGENT_PORT_EVENT.SESSION_UPDATE, handler);

    const promptPromise = this.inner.prompt(params);
    promptPromise
      .finally(() => {
        this.inner.off(AGENT_PORT_EVENT.SESSION_UPDATE, handler);
        queue.close();
        // Suppress the dangling rejection here; it is re-thrown below via `await promptPromise`.
      })
      .catch(() => {});

    try {
      for await (const update of queue.consume()) {
        const envelopes = sessionUpdateToEnvelopes(update, mode, { modelId });
        for (const env of envelopes) yield env;
      }
      await promptPromise;
      if (mode === ENVELOPE_MODE.OPENAI || mode === ENVELOPE_MODE.BOTH) {
        yield createOpenAIFinishEnvelope({
          modelId,
          finishReason: OPENAI_COMPAT.FINISH_REASON_STOP,
        });
      }
    } catch (err) {
      queue.pushError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async restart(): Promise<void> {
    await this.inner.disconnect();
    await this.inner.connect();
    await this.inner.initialize();
  }

  async open(): Promise<void> {
    return this.inner.connect();
  }

  async close(): Promise<void> {
    return this.inner.disconnect();
  }
}

/** Factory function — ergonomic wrapper around StreamAgentPort constructor. */
export function wrapAgentPortWithStream(
  inner: IAgentPort,
  options: WrapAgentPortOptions = {}
): IAgentPort {
  return new StreamAgentPort(inner, options);
}
