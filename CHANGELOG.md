# Changelog

All notable changes to XTagger are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Project scaffold: TypeScript strict config, pnpm, Biome, Vite
- Core domain types: `Result<T,E>`, complete error hierarchy, entity types
- Port interfaces: `StoragePort`, `PlatformPort`, `BrowserPort`, `LoggerPort`
- Typed `EventBus` with full event map
- `TagService` stub (interface + dependency wiring; implementation in Phase 1)
- Curated 16-color standard palette + 16-color extended palette
- Zod validation schemas for all domain entities
- X.com selector configuration JSON (v1, priority chain: testid → aria → structural)
- Chrome Extension Manifest V3 with correct permissions
- Forgejo Actions CI pipeline (lint → typecheck → test → build → size check)
- Daily selector verification workflow
- Architecture documentation with module map and event flow diagrams
- ADR-001 (Hexagonal Architecture), ADR-004 (Result Types)
- README, CONTRIBUTING, CHANGELOG

---

*Phase 0 complete — foundation scaffold. All compilation targets wired. Ready for Phase 1: Core Domain implementation.*

## [0.1.0] — Phase 0 Foundation
*Target: internal development only. Not for distribution.*
