# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Source layout: `constants/` and top-level `types/` merged into `src/domain/`, `core/` renamed to `src/runtime/`, `summon.ts` renamed to `bootstrap.ts`.
- Subpath export `./runtime` added; `./core` remains as an alias to the same build (deprecated; prefer `./runtime`).
- Source filenames use dot-separated segments (e.g. `env.keys.ts`, `provider.factory.ts`) under `domain/`, `runtime/`, `providers/`, and `cli/`.

## [0.1.0] - 2026-04-02

### Added

- Initial release: ACP LLM CLI harness layer, provider adapters, and documentation.
