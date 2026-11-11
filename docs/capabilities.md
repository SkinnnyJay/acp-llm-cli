# Agent capabilities

This file records what each ACP agent advertises in its `initialize` response
(`agentCapabilities.loadSession` and `agentCapabilities.sessionCapabilities`), so code that
branches on session load, resume, list and close starts from measured facts. Regenerate it
with `npm run probe` (put `claude-agent-acp` and `codex-acp` on `PATH` first); the script
prints JSON keyed by provider id. To replace one provider, swap its table row and its key in
the JSON block, and leave the rest alone. `yes` means the flag or key is present, `no` means
the agent answered without it, `not measured` means the agent did not answer.

Measured on 2026-11-10.

| Provider | Agent (version) | loadSession | list | resume | close | delete | fork | additionalDirectories |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-cli | @agentclientprotocol/claude-agent-acp 0.106.0 | yes | yes | yes | yes | yes | yes | yes |
| codex-cli | @agentclientprotocol/codex-acp 2.6.0 | yes | yes | yes | yes | yes | yes | yes |
| cursor-cli | not reported | yes | yes | no | no | no | no | no |
| gemini-cli | gemini-cli 0.33.2 | yes | no | no | no | no | no | no |

## Raw output

```json
{
  "claude-cli": {
    "command": "claude-agent-acp",
    "agentInfo": {
      "name": "@agentclientprotocol/claude-agent-acp",
      "title": "Claude Agent",
      "version": "0.106.0"
    },
    "protocolVersion": 1,
    "agentCapabilities": {
      "_meta": {
        "claudeCode": {
          "promptQueueing": true
        },
        "authStatus": {}
      },
      "promptCapabilities": {
        "image": true,
        "embeddedContext": true
      },
      "mcpCapabilities": {
        "http": true,
        "sse": true
      },
      "auth": {
        "logout": {},
        "status": {}
      },
      "providers": {},
      "loadSession": true,
      "sessionCapabilities": {
        "additionalDirectories": {},
        "close": {},
        "delete": {},
        "fork": {},
        "list": {},
        "options": {},
        "resume": {},
        "status": {},
        "systemPrompt": {
          "mode": {
            "override": {}
          }
        },
        "title": {}
      }
    },
    "authMethods": []
  },
  "codex-cli": {
    "command": "codex-acp",
    "agentInfo": {
      "name": "@agentclientprotocol/codex-acp",
      "title": "Codex",
      "version": "2.6.0"
    },
    "protocolVersion": 1,
    "agentCapabilities": {
      "auth": {
        "logout": {}
      },
      "providers": {},
      "loadSession": true,
      "promptCapabilities": {
        "embeddedContext": true,
        "image": true
      },
      "sessionCapabilities": {
        "resume": {},
        "list": {},
        "close": {},
        "delete": {},
        "fork": {},
        "title": {},
        "additionalDirectories": {},
        "subagents": {},
        "systemPrompt": {}
      },
      "mcpCapabilities": {
        "acp": false,
        "http": true,
        "sse": false
      },
      "_meta": {
        "authStatus": {}
      }
    },
    "authMethods": [
      "api-key",
      "chat-gpt"
    ]
  },
  "cursor-cli": {
    "command": "cursor-agent acp",
    "agentInfo": null,
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "mcpCapabilities": {
        "http": true,
        "sse": true
      },
      "promptCapabilities": {
        "audio": false,
        "embeddedContext": false,
        "image": true
      },
      "sessionCapabilities": {
        "list": {}
      }
    },
    "authMethods": [
      "cursor_login"
    ]
  },
  "gemini-cli": {
    "command": "gemini --acp",
    "agentInfo": {
      "name": "gemini-cli",
      "title": "Gemini CLI",
      "version": "0.33.2"
    },
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {
        "image": true,
        "audio": true,
        "embeddedContext": true
      },
      "mcpCapabilities": {
        "http": true,
        "sse": true
      }
    },
    "authMethods": [
      "oauth-personal",
      "gemini-api-key",
      "vertex-ai",
      "gateway"
    ]
  }
}
```
