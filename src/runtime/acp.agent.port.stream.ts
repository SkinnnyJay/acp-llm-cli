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
 * Wraps an IAgentPort to add optional streamPrompt, restart, open, close and capability metadata.
 * Keeps envelope and lifecycle logic in one place so providers stay thin.
 */
export function wrapAgentPortWithStream(
  inner: IAgentPort,
  options: WrapAgentPortOptions = {}
): IAgentPort {
  const { envelopeMode = ENVELOPE_MODE.BOTH, modelId } = options;

  const capabilities: AgentPortCapabilities = {
    [PORT_CAPABILITY.STREAM_PROMPT]: true,
    [PORT_CAPABILITY.RESTART]: true,
    [PORT_CAPABILITY.OPEN_CLOSE]: true,
    [PORT_CAPABILITY.CANCEL]: typeof inner.cancel === "function",
  };

  const wrapped = new (class WrappedPort
    extends EventEmitter<AgentPortEvents>
    implements IAgentPort
  {
    readonly capabilities = capabilities;

    get connectionStatus() {
      return inner.connectionStatus;
    }

    async connect(): Promise<void> {
      return inner.connect();
    }
    async disconnect(): Promise<void> {
      return inner.disconnect();
    }
    async initialize(...args: Parameters<IAgentPort["initialize"]>) {
      return inner.initialize(...args);
    }
    async newSession(...args: Parameters<IAgentPort["newSession"]>) {
      return inner.newSession(...args);
    }
    async prompt(...args: Parameters<IAgentPort["prompt"]>) {
      return inner.prompt(...args);
    }
    async authenticate(...args: Parameters<IAgentPort["authenticate"]>) {
      return inner.authenticate(...args);
    }
    async sessionUpdate(...args: Parameters<IAgentPort["sessionUpdate"]>) {
      return inner.sessionUpdate(...args);
    }
    get setSessionMode() {
      return inner.setSessionMode;
    }
    get setSessionModel() {
      return inner.setSessionModel;
    }
    get cancel() {
      const innerCancel = inner.cancel;
      return innerCancel ? innerCancel.bind(inner) : undefined;
    }

    async *streamPrompt(
      params: PromptRequest,
      streamOptions?: StreamPromptOptions
    ): AsyncIterable<StreamEnvelope> {
      const mode = streamOptions?.envelopeMode ?? envelopeMode;
      const queue = createStreamPromptQueue();
      const handler = (update: SessionNotification) => queue.push(update);
      inner.on(AGENT_PORT_EVENT.SESSION_UPDATE, handler);

      const promptPromise = inner.prompt(params);
      let promptError: Error | undefined;
      let promptSettled = false;
      // Route rejection into the queue (delivered in order, after queued
      // updates) and swallow it on this chain: a bare promptPromise.finally()
      // chain re-raises the rejection with no handler attached, which is an
      // unhandledRejection — a process crash under Node defaults — even
      // though the generator awaits promptPromise later.
      const settled = promptPromise.then(
        () => {
          promptSettled = true;
          queue.close();
        },
        (err: unknown) => {
          promptSettled = true;
          promptError = err instanceof Error ? err : new Error(String(err));
          queue.pushError(promptError);
        }
      );

      let finished = false;
      try {
        for await (const update of queue.consume()) {
          const envelopes = sessionUpdateToEnvelopes(update, mode, { modelId });
          for (const env of envelopes) yield env;
        }
        await settled;
        if (promptError) throw promptError;
        finished = true;
        if (mode === ENVELOPE_MODE.OPENAI || mode === ENVELOPE_MODE.BOTH) {
          yield createOpenAIFinishEnvelope({
            modelId,
            finishReason: OPENAI_COMPAT.FINISH_REASON_STOP,
          });
        }
      } finally {
        // Runs on normal completion, on error, AND on early consumer break —
        // the frozen version only detached the listener when the prompt
        // settled, and never stopped the turn for a consumer that walked away.
        inner.off(AGENT_PORT_EVENT.SESSION_UPDATE, handler);
        queue.close();
        if (!finished && !promptSettled && inner.cancel) {
          void inner
            .cancel({ sessionId: params.sessionId })
            .catch(() => {
              /* best-effort turn cancellation */
            });
        }
      }
    }

    async restart(): Promise<void> {
      await inner.disconnect();
      await inner.connect();
      await inner.initialize();
    }

    async open(): Promise<void> {
      return inner.connect();
    }
    async close(): Promise<void> {
      return inner.disconnect();
    }
  })();

  inner.on(AGENT_PORT_EVENT.STATE, (status: ConnectionStatus) =>
    wrapped.emit(AGENT_PORT_EVENT.STATE, status)
  );
  inner.on(AGENT_PORT_EVENT.SESSION_UPDATE, (update: SessionNotification) =>
    wrapped.emit(AGENT_PORT_EVENT.SESSION_UPDATE, update)
  );
  inner.on(AGENT_PORT_EVENT.PERMISSION_REQUEST, (request: RequestPermissionRequest) =>
    wrapped.emit(AGENT_PORT_EVENT.PERMISSION_REQUEST, request)
  );
  inner.on(AGENT_PORT_EVENT.ERROR, (error: Error) =>
    wrapped.emit(AGENT_PORT_EVENT.ERROR, error)
  );

  return wrapped;
}
