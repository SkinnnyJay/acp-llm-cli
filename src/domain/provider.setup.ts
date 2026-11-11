import type { Provider } from "./provider";
import { PROVIDER_IDS } from "./provider.ids";

/** How to get a provider's agent binary, and the command that signs the user in. */
export interface ProviderSetup {
  readonly install: string;
  readonly login: string;
}

/** Setup facts per built-in provider; the source of CLI_NOT_FOUND and AUTH_REQUIRED hints. */
export const PROVIDER_SETUP: Readonly<Record<Provider, ProviderSetup>> = {
  [PROVIDER_IDS.CLAUDE_CLI_ID]: {
    install: "npm install -g @agentclientprotocol/claude-agent-acp",
    login: "claude /login",
  },
  [PROVIDER_IDS.CODEX_CLI_ID]: {
    install: "npm install -g @agentclientprotocol/codex-acp",
    login: "codex login",
  },
  [PROVIDER_IDS.CURSOR_CLI_ID]: {
    install: "curl https://cursor.com/install -fsS | bash",
    login: "cursor-agent login",
  },
  [PROVIDER_IDS.ANTIGRAVITY_CLI_ID]: {
    install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    login: "agy acp --login",
  },
};

/** The setup entry for `providerId`, or undefined for an id not in the table. */
export function providerSetup(providerId: string | undefined): ProviderSetup | undefined {
  return providerId !== undefined && Object.hasOwn(PROVIDER_SETUP, providerId)
    ? PROVIDER_SETUP[providerId as Provider]
    : undefined;
}
