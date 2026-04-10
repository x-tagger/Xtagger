# 🏷️ XTagger

**Personal, local-first annotation layer for X.com.** Tag people with custom labels, see them in your feed, share collections — all without cloud storage, accounts, or tracking.

> Your tags never leave your browser. Zero telemetry. Open source.

---

## What it does

XTagger injects coloured tag indicators next to usernames throughout X.com — in your feed, search results, replies, and profile pages. You decide the tags. They stay on your device.

**Tag a user:**  hover over any username → click the 🏷️ icon → type a name, pick a colour → save.

**See them everywhere:** compact dots or text pills appear next to their name, everywhere they appear.

**Share collections:** export your tags as a compact `XTAG:` string → paste it in a DM or tweet → someone else can import it in one click.

---

## Install

### From source (developer mode)

```bash
git clone https://forgejo.xtagger.dev/xtagger/xtagger.git
cd xtagger
pnpm install
pnpm run build
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. Visit `x.com` — the 🏷️ icon appears on first install

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9  (`npm install -g pnpm`)
- Chrome / Chromium 88+

---

## Usage

### Tagging a user

1. On X.com, hover over any username
2. A small 🏷️ icon appears next to the name
3. Click it to open the tag editor:
   - **Name** — e.g. `journalist`, `bot`, `must-follow`
   - **Colour** — 16 accessible colours (32 in extended mode)
   - **Notes** — optional context (e.g. `"Met at conference 2024"`)
4. Click **Add tag** — the tag appears immediately

### Managing tags

- **Click an existing tag pill/dot** to edit or delete it
- **Right-click any username** → "Tag @username" from the context menu
- **Popup** (click the toolbar icon) → search, filter, bulk view

### Import / Export

- **Export:** popup → Export → copy compact `XTAG:` string or download `.xtagger.json`
- **Import:** popup → Import → paste/drag/drop → preview conflicts → apply
- Conflict resolution: keep mine / keep theirs / keep both

### Settings

- **Display mode:** compact dots · text pills · hidden (pause display)
- **Theme:** auto · dark · light
- **Extended palette:** 16 → 32 colours

---

## Development

### Project structure

```
src/
  core/           Pure domain logic (no browser APIs)
    model/        Entities, schemas, Zod validators
    services/     TagService, ImportExportService, ConflictResolver
    ports/        Port interfaces (StoragePort, PlatformPort, …)
    events/       TypedEventBus
    shared/       Result<T,E>, errors, constants
  adapters/
    storage/      IDBAdapter (IndexedDB), MigrationService
    chrome/       MessageRouter, ChromeAdapter, ContextMenuManager
  platforms/
    x.com/        SelectorEngine, UserDetector, InjectionManager,
                  InjectionPipeline, NavigationObserver, XPlatformAdapter
  ui/
    content/      HoverTrigger, TagEditorPopover, Announcer, entry point
    popup/        Full popup dashboard (HTML + vanilla TS)
    onboarding/   First-run walkthrough
  shared/
    logger.ts     ConsoleLogger / NoopLogger
    messages.ts   Typed IPC protocol (12 channels)
```

### Commands

```bash
pnpm run build          # Production build → dist/
pnpm run build:watch    # Rebuild on changes
pnpm run typecheck      # TypeScript type checking
pnpm run lint           # Biome linter
pnpm run lint:fix       # Auto-fix lint issues
pnpm run test           # Unit + integration tests (vitest)
pnpm run test:coverage  # Tests with coverage report
pnpm run test:e2e       # E2E tests (Playwright + real Chromium)
pnpm run test:e2e:headed # E2E with visible browser window
pnpm run package        # Build + zip for distribution
pnpm run verify-selectors # Check X.com selectors are still working
pnpm run ci             # Full CI pipeline (typecheck + lint + test + build)
```

### Architecture

XTagger uses a **hexagonal architecture** — core domain logic has zero browser or DOM imports. All I/O goes through port interfaces:

```
[InjectionPipeline] ──▶ [PlatformPort] ──▶ [XPlatformAdapter]
[MessageRouter]     ──▶ [StoragePort]  ──▶ [IDBAdapter]
[TagService]        ──▶ [EventBus]
```

Key ADRs in `docs/adr/`:
- **ADR-001** — Hexagonal architecture
- **ADR-002** — Result types (no exceptions in core)
- **ADR-003** — IndexedDB (local-first, never chrome.storage.sync)
- **ADR-004** — Typed message protocol (12 channels)
- **ADR-005** — Platform adapter design (selector resilience)

### Adding a new platform

1. Implement `PlatformPort` in `src/platforms/<platform>/`
2. Add selector config to `selector-configs/<platform>.json`
3. Update content script entry point to detect the hostname
4. Write unit tests for your `UserDetector`

### Selector maintenance

X.com's CSS class names are obfuscated and rotate on each deploy.
XTagger uses a 4-level fallback chain: `testid → aria → structural → text`.

When selectors break (you'll see the in-page notification):
1. Update `selector-configs/x.com.json` with new strategies
2. Bump `selectorVersion` and update `lastVerified`
3. Run `pnpm run verify-selectors` to validate
4. Submit a PR — it's a 5-minute fix

The nightly CI job (`selector-check.yml`) catches breaks before users report them.

### Testing

```bash
pnpm run test           # All unit + integration tests
pnpm run test:e2e       # E2E against real Chromium (requires dist/ to be built first)
```

Unit tests use `vitest` + `jsdom`. Integration tests use `fake-indexeddb`.
E2E tests use Playwright's `launchPersistentContext` with the extension loaded.
The mock feed (`tests/e2e/mock-feed.html`) is served via `page.route()` at
`https://x.com/mock-feed` so the content script runs normally.

---

## Privacy

XTagger is fully local-first:
- All tag data is stored in **IndexedDB** in your browser profile
- **No network requests** are made by the extension (no telemetry, no sync)
- Export files live on your device — sharing is explicit and manual
- The selector verification script accesses x.com/explore once daily in CI — this is a development/maintenance tool, not part of the extension itself

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Access to IndexedDB (local data only) |
| `activeTab` | Open tag editor from the current tab |
| `contextMenus` | Right-click "Tag @username" menu entry |
| `tabs` | Broadcast settings changes to open X.com tabs |
| `host: x.com/*` | Inject the tag display into X.com pages |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Key points:

- One feature per PR
- Tests required for new logic
- Run `pnpm run ci` before pushing
- Selector updates are especially welcome — they're the most time-sensitive changes

---

## Roadmap

- [ ] Firefox / Manifest V2 support
- [ ] Bluesky platform adapter
- [ ] Tag search from keyboard shortcut
- [ ] Colour-blind mode (pattern fills)
- [ ] Nested tags / tag groups
- [ ] Optional encrypted sync (end-to-end, self-hosted)

---

## License

GPL-3.0-or-later — see [LICENSE](./LICENSE).

Built with ❤️ by the XTagger contributors.
