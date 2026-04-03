# `src/` layout

| Directory | Role |
|-----------|------|
| **`domain/`** | Pure constants, types, and validation messages. No harness I/O, no process spawning. |
| **`runtime/`** | Harness, stdio, registry, factories, metrics, ports, lifecycle. May import `domain/`. |
| **`providers/`** | Per-CLI adapters (`adapter`, `schema`, `constants`, `cli.definition`). Import `domain/` and `runtime/`. |
| **`cli/`** | Cross-provider CLI helpers (args, help, shared schemas). |
| **`bootstrap.ts`** | Default registry and factory wiring. |

## File naming

Use **dot-separated** lowercase segments: `env.keys.ts`, `provider.factory.ts`, `stdio.connection.ts`.  
Avoid kebab-case filenames in new code. Barrel files are named `index.ts`.
