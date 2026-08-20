import type {
  PromptRequest,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { AGENT_PORT_EVENT } from "../domain/agent.port.events";
import type { ConnectionStatus } from "../domain/connection.status";
import type { EnvelopeMode } from "../domain/envelope.mode";
import { ENVELOPE_MODE } from "../domain/envelope.mode";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { LIMIT } from "../domain/limits";
import { OPENAI_COMPAT } from "../domain/openai.compat";
import { PORT_CAPABILITY } from "../domain/port.capabilities";
import { notificationSessionId } from "../domain/session.notification";
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

/** Adds streamPrompt only. Restart/open/close belong to LifecycleAgentPort. */
export class StreamAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities: AgentPortCapabilities;

  private readonly inner: IAgentPort;
  private readonly envelopeMode: EnvelopeMode;
  private readonly modelId: string | undefined;
  private streamBusy = false;
  private chunkSeq = 0;

  constructor(inner: IAgentPort, options: WrapAgentPortOptions = {}) {
    super();
    this.inner = inner;
    this.envelopeMode = options.envelopeMode ?? ENVELOPE_MODE.BOTH;
    this.modelId = options.modelId;
    this.capabilities = {
      ...inner.capabilities,
      [PORT_CAPABILITY.STREAM_PROMPT]: true,
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
  get setSessionConfigOption() {
    return this.inner.setSessionConfigOption?.bind(this.inner);
  }

  async *streamPrompt(
    params: PromptRequest,
    streamOptions?: StreamPromptOptions
  ): AsyncIterable<StreamEnvelope> {
    if (this.streamBusy) throw new Error(ERROR_MESSAGE.STREAM_PROMPT_IN_PROGRESS);
    this.streamBusy = true;
    const mode = streamOptions?.envelopeMode ?? this.envelopeMode;
    const modelId = this.modelId;
    const sessionId = params.sessionId;
    const streamCreated = Math.floor(Date.now() / LIMIT.MS_PER_SECOND);
    const chunkId = () => `chunk-${++this.chunkSeq}`;
    const queue = createStreamPromptQueue();
    const handler = (update: SessionNotification) => {
      const updateSessionId = notificationSessionId(update);
      if (sessionId && updateSessionId && updateSessionId !== sessionId) return;
      queue.push(update);
    };
    this.inner.on(AGENT_PORT_EVENT.SESSION_UPDATE, handler);
    const promptPromise = this.inner.prompt(params);
    promptPromise
      .finally(() => {
        this.inner.off(AGENT_PORT_EVENT.SESSION_UPDATE, handler);
        queue.close();
      })
      .catch(() => {});
    try {
      for await (const update of queue.consume()) {
        for (const env of sessionUpdateToEnvelopes(update, mode, {
          modelId,
          chunkId,
          created: streamCreated,
        })) {
          yield env;
        }
      }
      await promptPromise;
      if (mode === ENVELOPE_MODE.OPENAI || mode === ENVELOPE_MODE.BOTH) {
        yield createOpenAIFinishEnvelope({
          modelId,
          finishReason: OPENAI_COMPAT.FINISH_REASON_STOP,
          chunkId: chunkId(),
          created: streamCreated,
        });
      }
    } catch (err) {
      queue.pushError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this.streamBusy = false;
    }
  }
}

export function wrapAgentPortWithStream(
  inner: IAgentPort,
  options: WrapAgentPortOptions = {}
): IAgentPort {
  return new StreamAgentPort(inner, options);
}
