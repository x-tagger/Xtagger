# Changelog

All notable changes to XTagger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version scheme: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added (Phase 1 — Storage Layer)
- `IDBAdapter` — full `StoragePort` implementation using IndexedDB
  - Tag CRUD with indexed queries
  - Soft delete with `purgeDeletedTags`
  - Bulk save for import operations
  - Settings persistence
  - Schema version tracking
- `MigrationService` — versioned forward-only schema migrations
- `ChromeAdapter` — `BrowserPort` implementation for Chrome MV3 messaging
- `MessageRouter` — typed request/response channel routing in service worker
- `ConsoleLogger` / `NoopLogger` — `LoggerPort` implementations
- Typed message protocol (`src/shared/messages.ts`) — all 12 channels defined
- Fully-wired background service worker with proper MV3 lifecycle handling
- Integration tests: IDBAdapter (17 tests), ImportExport (9 tests), MigrationService (4 tests)
- `fake-indexeddb` dev dependency for Node-based IDB testing

### Added (Phase 0 — Foundation)
- Core domain: `Result<T,E>`, `EventBus`, entity types, Zod schemas
- Port interfaces: `StoragePort`, `PlatformPort`, `BrowserPort`, `LoggerPort`
- Services: `TagService`, `ImportExportService`, `ConflictResolver`, `ColorPalette`
- Schema migration skeleton
- Chrome MV3 manifest
- X.com selector config v1
- ADRs 001–003
- Forgejo Actions CI/CD pipeline
