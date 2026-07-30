# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-30

### Changed

- **Breaking:** Default permission handler cancels when no `permissionHandler` is configured (no longer auto-selects the first option).
- **Breaking:** Cursor CLI no longer hardcodes `--trust`; pass `trust: true` in config to enable it.
- Session persistence saves from inbound `sessionUpdate` events and stores session `cwd` for resume.
- Memory persistence keys are length-prefixed to avoid `providerId`/`workspace` collisions.
- Help extraction and Cursor disconnect force-kill orphaned child processes.
- Public API exports `createAcpCliHarnessRuntime`, `createStandardAcpRuntime`, and session persistence types.
- Subpath export is `./runtime` only (the former `./core` alias was removed).
- README / CONTRIBUTING / AGENTS / `.env.sample` aligned with real defaults and GitHub Flow.

## [0.1.2] - 2026-07-29

### Added

- Live provider matrix test (`ACP_LLM_CLI_LIVE=1`) for Claude / Codex / Cursor.
- Unit assertion that defaults stay aligned with ACPX preferred binaries.
- README section documenting mesh/ACPX vs this package's Cursor print-mode split.

## [0.1.1] - 2026-07-29

### Changed

- Default Claude ACP binary: `claude-agent-acp` (was `claude-code-acp`).
- Default Codex ACP binary: `codex-acp` with no args (was `codex --experimental-acp`).
- Cursor remains `cursor-agent` print/stream-json in this package.

## [0.1.0] - 2026-04-02

### Added

- Initial release: ACP LLM CLI harness layer, provider adapters, and documentation.
