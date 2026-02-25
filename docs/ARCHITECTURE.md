# XTagger Architecture

## Layered Overview

```
┌─────────────────────────────────────────────────────────┐
│                    UI LAYER (src/ui/)                   │
│  content/ — injected tag pills (Shadow DOM, Vanilla TS) │
│  popup/   — extension popup dashboard                   │
│  onboarding/ — first-run experience                     │
├─────────────────────────────────────────────────────────┤
│          PLATFORM ADAPTERS (src/platforms/)             │
│  x.com/  — UserDetector, InjectionManager, selectors   │
│  (bsky.app future)                                      │
├─────────────────────────────────────────────────────────┤
│          BROWSER ADAPTERS (src/adapters/)               │
│  chrome/ — messaging, service worker lifecycle          │
│  storage/— IndexedDB wrapper (implements StoragePort)   │
├═════════════════════════════════════════════════════════╡
│            CORE DOMAIN (src/core/)   ← NO browser APIs │
│  services/ — TagService, ImportExportService            │
│  model/    — entities, Zod schemas                      │
│  ports/    — StoragePort, PlatformPort, BrowserPort     │
│  events/   — TypedEventBus, EventMap                    │
│  migrations/ — schema migration functions               │
│  shared/   — Result<T,E>, error types, constants        │
└─────────────────────────────────────────────────────────┘
```

## Key Patterns

### Result Types
All fallible operations return `Result<T, E>` — never throw. See `src/core/shared/result.ts`.

### EventBus
Modules communicate via `eventBus.emit/on`. Never import another module's implementation directly.
See `src/core/events/event-bus.ts` for the full event catalogue.

### Ports & Adapters
Core defines port interfaces. Adapters implement them.
- `StoragePort` → `IndexedDBAdapter`
- `PlatformPort` → `XPlatformAdapter`
- `BrowserPort` → `ChromeAdapter`

### Module Size Limits
- Max 300 lines per file (AI context window constraint)
- Max 50 lines per function
- Max 5 inter-module imports

## Data Flow: Tag Creation

```
User clicks tag icon in feed
  → TagEditorComponent (ui/content)
    → eventBus.emit('tag:created', ...) — NO, wait
    → TagService.createTag(userId, input)
      → CreateTagInputSchema.safeParse(input) — validate
      → storage.saveTag(userId, tag) — persist
      → eventBus.emit('tag:created', ...) — notify
        → TagPillComponent listens → re-renders pill
        → PopupDashboard listens → updates count
```

## Data Flow: Import

```
User selects .xtagger.json file
  → ImportExportService.previewImport(raw)
    → Zod parse + checksum verify
    → Returns ImportPreview (no changes yet)
  → User confirms
  → ImportExportService.applyImport(manifest, options)
    → ConflictResolver.merge() for each user
    → storage.bulkSave(entries)
    → eventBus.emit('import:completed', stats)
```
