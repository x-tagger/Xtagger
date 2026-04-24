# Changelog

All notable changes to XTagger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version scheme: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-04-24

### Changed
- Trim extension description to 132-char Chrome Web Store limit

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

### Added (Phase 2 — Platform Adapter)
- `SelectorEngine` — 4-strategy fallback chain (testid → aria → structural → text)
  - External JSON config loading
  - Per-selector failure counting + recovery detection
  - `selector:failed` / `selector:recovered` EventBus integration
  - Diagnostics API for popup debug panel
- `UserDetector` — finds `@username` from tweet cards via href parsing + @ text
  - Deduplication within a scan pass
  - Reserved path filtering (/home, /explore, etc.)
  - Username normalisation (lowercase)
- `NavigationObserver` — SPA navigation detection via History API patching + popstate
  - `navigation:changed` EventBus integration
  - Correct previous/current URL tracking
- `InjectionManager` — Shadow DOM tag pill injection
  - `compact` mode: coloured 8px dots with hover tooltips
  - `pills` mode: coloured pill with tag name text
  - WeakRef tracking for GC-safe element management
  - `remove()` / `removeAll()` for cleanup on navigation
- `InjectionPipeline` — full MutationObserver-driven injection orchestrator
  - In-memory tag cache (Map<username, Tag[]>) to avoid redundant IPC
  - requestAnimationFrame batching (max 20 elements/frame)
  - Cache invalidation on tag:created/updated/deleted events
  - Navigation-triggered cleanup + re-scan
  - Settings change propagation (displayMode switches)
- `FailureNotifier` — Shadow DOM notification banner for selector failures
  - Auto-dismisses after 8 seconds
  - Deduplicated (one banner at a time)
- `XPlatformAdapter` — wires above modules into `PlatformPort`
- Full content script entry point (`src/ui/content/index.ts`)
  - Settings-aware boot (respects `hidden` display mode)
  - Bundled selector config loading via `chrome.runtime.getURL`
  - Duplicate-init guard
- ADR-005: Platform adapter design decisions
- Unit tests: SelectorEngine (15), UserDetector (9), InjectionManager (11), NavigationObserver (7)

### Added (Phase 3 — Interactive UI)
- `HoverTrigger` — event-delegation hover listener shows 🏷️ icon on username hover
  - Stamped with `data-username` for callback identification
  - Click on icon → `onAddTag` callback
  - Click on existing pill → `onEditTag` callback
  - Deduplication (one icon at a time), auto-hide on mouse-leave
- `TagEditorPopover` — full inline tag editor in Shadow DOM
  - Add mode: empty form, saves via `tags:create` IPC
  - Edit mode: pre-filled form with delete button, saves via `tags:update` IPC
  - 16-swatch colour palette grid with selection indicator
  - Tag name autocomplete from all existing tag names
  - Optional notes field (toggle, 500-char limit with counter)
  - Existing user tags shown as mini pills (click to switch to edit mode)
  - Keyboard shortcuts: Enter to save, Escape to close / close autocomplete
  - Viewport-aware positioning (flips above anchor near screen bottom)
  - Singleton — opening a new popover closes the previous
- Popup dashboard (`src/ui/popup/`) — full management UI
  - Home: search bar (username + tag name filter), tagged user list with pills, empty state
  - Import: drag-and-drop / file browse / paste, preview (stats + checksum badge), conflict strategy radio, apply
  - Export: JSON download, compact XTAG copy-to-clipboard, per-format size info
  - Settings: display mode, theme, extended palette, hover-to-edit; auto-saved on change
  - Full CSS theming: dark/light with CSS custom properties, respects OS preference
  - Broadcasts `settings:push` to open X.com tabs after settings change
- `InjectionManager` updated to stamp `data-username` and `data-color-index` on pills
- Content script entry point wires HoverTrigger + TagEditorPopover into the pipeline
- ADR-005 preserved; no new architectural decisions needed (follows established patterns)
- Unit tests: TagEditorPopover (9), HoverTrigger (8)

### Added (Phase 4 — Polish, Onboarding & Accessibility)
- `ContextMenuManager` — right-click "Tag @username" entry on X.com links/selection
  - Extracts username from profile URLs or @-prefixed selected text
  - "Open XTagger" popup shortcut
  - Registered on install/update/startup (handles update refresh)
- Onboarding page (`public/onboarding.html` + `src/ui/onboarding/main.ts`)
  - 4-step walkthrough: hover → add tag → see in feed → share
  - Keyboard navigation (← / → arrow keys)
  - Progress dots (clickable)
  - Privacy assurance callout
  - Auto-opens as a tab on fresh install via `onInstalled` handler
- `Announcer` — ARIA live region for screen reader notifications
  - Announces tag saved/deleted events politely
  - Visually hidden, accessible to all screen readers
  - Auto-clears after 3 seconds
- Keyboard navigation in `TagEditorPopover` colour palette
  - Arrow keys (←/→/↑/↓), Home/End for palette navigation
  - `role="radiogroup"` + `role="radio"` + `aria-pressed` for full ARIA compliance
  - Roving `tabindex` pattern (only selected swatch is in tab order)
- `settings:push` message handling in content script
  - Popup broadcasts settings changes to all open X.com tabs
  - Display mode changes take effect immediately without page reload
- `content:open-tag-editor` message channel
  - Background sends this from context menu clicks to the active tab
- Background worker updated with context menu registration and onboarding tab open
- Manifest v2 → added `contextMenus` + `tabs` permissions, `onboarding.html` web_accessible_resource
- Extension icons generated (16, 32, 48, 128px PNG) from Python Pillow
- Vite build config updated with `onboarding` entry point
- Unit tests: Announcer (5), ContextMenuManager (6)

### Added (Phase 5 — E2E Tests, CI & Packaging)
- Playwright E2E test suite (`tests/e2e/`)
  - `fixtures.ts` — extension loading fixture using `launchPersistentContext`
  - `global-setup.ts` — auto-builds extension before tests
  - `popup.test.ts` — 10 tests: popup loads, nav, settings, export, import error
  - `tag-creation.test.ts` — 3 tests: hover icon, editor opens, full create flow
  - `import-export.test.ts` — 5 tests: export, clipboard, preview, apply, error
  - `mock-feed.html` — X.com DOM mock for content script testing (no auth needed)
- `playwright.config.ts` — chromium-only, global setup, CI-aware reporters
- `scripts/verify-selectors.js` — daily X.com selector health check
  - Opens X.com explore page in headless Chromium
  - Tests each strategy for each selector key
  - Writes `selector-report/report.json` + screenshots
  - Referenced by `.forgejo/workflows/selector-check.yml`
- `scripts/package-extension.ts` — production build + zip + SHA-256 checksum
  - Validates all required files are present
  - Enforces bundle size budgets before packaging
  - Outputs `xtagger-v<version>.zip` + `.sha256` file
- CI workflow updated (`.forgejo/workflows/ci.yml`)
  - Split into 4 jobs: `test` → `build` → `e2e` → `release`
  - `build` uploads dist/ artifact (shared to E2E and release jobs)
  - `e2e` downloads dist/, installs Playwright, runs full suite
  - `release` job fires on `v*` tags, packages and attaches zip + checksum
  - Bundle size check improved: per-file budgets with pass/fail output
- `package.json` scripts: `test:e2e:headed`, `test:e2e:ui`, `package`, `verify-selectors`
- `README.md` — complete documentation
  - Installation (from source + from zip)
  - Usage guide (tagging, editing, sharing, popup)
  - Display mode table
  - Export format explanations
  - Development commands reference
  - Architecture overview + contribution guide
  - Privacy statement

### Added (Phase 5 — E2E Tests, CI/CD & Packaging)
- E2E test fixtures rewritten with `mockFeedPage` fixture
  - Uses `page.route()` to serve mock HTML at `https://x.com/mock-feed`
  - Content script runs normally (URL matches manifest's `x.com/*`)
  - Replaces brittle `file://` approach that couldn't trigger the content script
- `tag-creation.test.ts` — 6 scenarios: hover shows icon, click opens popover,
  username shown in title, Escape closes, 16 swatches, complete create+verify-in-popup flow
- `popup.test.ts` — 10 scenarios: load, empty state, search filter, all nav views,
  settings save, settings persist after reopen, export, import error, theme toggle
- `import-export.test.ts` — 7 scenarios: export generates output, compact format,
  copy confirms, import preview, import apply, imported user in list, roundtrip
- `verify-selectors.js` completed — opens x.com/explore, tests all selectors,
  writes JSON report + failure screenshots, auto-updates `lastVerified` on success
- `package-extension.ts` fixed — sync JSON read, proper checksum computation
- `vitest.config.ts` updated — coverage now includes `src/platforms/**` + `src/ui/**`
- `package.json` — added `tsx` devDependency (required for package script)
- `README.md` — comprehensive: install, usage, architecture, privacy, contributing, roadmap

### Fixed (Phase 6 — Final Polish & Bug Fixes)
- `tag:deleted` EventBus emission in content script now includes required `soft: boolean` field
- `public/popup.html` stub removed — was silently overwriting the real built popup from `src/ui/popup/index.html`
- `public/onboarding.html` moved to `src/ui/onboarding/index.html` alongside its script; Vite entry updated accordingly
- E2E mock feed updated with real test accounts: @elonmusk, @DonaldTrump, @RupertLowe10 (plus @alice_dev for deterministic assertions)
- E2E import test fixture uses valid UUID v4 for tag `id` (TagSchema enforces this)
- E2E import test `VALID_EXPORT` uses correct `ExportManifest` shape (`entries` Record, not `users` array)
- E2E popup test backslash typo removed
- Vitest config updated to include `src/platforms/**` and `src/ui/**` in coverage
