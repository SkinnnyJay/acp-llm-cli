# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Source layout: `constants/` and top-level `types/` merged into `src/domain/`, `core/` renamed to `src/runtime/`, `summon.ts` renamed to `bootstrap.ts`.
- Subpath export `./runtime` added; `./core` remains as an alias to the same build (deprecated; prefer `./runtime`).
- Source filenames use dot-separated segments (e.g. `env.keys.ts`, `provider.factory.ts`) under `domain/`, `runtime/`, `providers/`, and `cli/`.

## [0.1.2] - 2026-07-29

### Added

- Live provider matrix test (`ACP_LLM_CLI_LIVE=1`) for Claude / Codex / Cursor.
- Unit assertion that defaults stay aligned with ACPX preferred binaries.
- README section documenting mesh/ACPX vs this package's Cursor print-mode split.

## [0.1.1] - 2026-07-29

### Changed

- Default Claude ACP binary: `claude-agent-acp` (was `claude-code-acp`), matching ACPX's preferred wrapper for `@agentclientprotocol/claude-agent-acp`.
- Default Codex ACP binary: `codex-acp` with no args (was `codex --experimental-acp`), matching ACPX's preferred wrapper for `@zed-industries/codex-acp`.
- Cursor remains `cursor-agent` print/stream-json in this package; ACP mode (`cursor-agent acp`) stays the ACPX path used by llm-mesh.

## [0.1.0] - 2026-04-02

### Added

- Initial release: ACP LLM CLI harness layer, provider adapters, and documentation.
