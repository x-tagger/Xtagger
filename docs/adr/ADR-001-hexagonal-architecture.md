# ADR-001: Hexagonal Architecture (Ports & Adapters)

## Status: Accepted
## Date: 2025-01-15

## Context

XTagger faces three structural challenges that all point to the same solution:

1. **Platform fragility**: X.com changes its DOM without notice. Any architecture that couples business logic to DOM operations will require full rewrites when the DOM changes.

2. **Multi-platform ambition**: The roadmap includes Bluesky, Mastodon, and potentially others. Adding each platform should not require touching core logic.

3. **AI-assisted development**: AI coding agents work best with clear, bounded modules. Without explicit architectural boundaries, AI agents produce entangled code that breaks in unexpected ways.

## Decision

We adopt the **Hexagonal Architecture** pattern (also called Ports & Adapters, originally described by Alistair Cockburn).

**Core Domain** (`src/core/`):
- Pure TypeScript — no browser APIs, no DOM access, no network calls
- Defines *ports* (TypeScript interfaces) for everything it needs from the outside world
- Contains all business logic: tag CRUD, import/export, schema migration, conflict resolution
- Can be tested entirely without a browser or DOM

**Adapters** (`src/adapters/`, `src/platforms/`):
- Implement the ports defined by core
- Are the ONLY place where browser APIs, DOM, or chrome.* appear
- Are swappable without changing core logic

**Specific ports defined**:
- `StoragePort` — read/write data. Implemented by `IndexedDBAdapter`
- `PlatformPort` — detect users, inject UI. Implemented by `XPlatformAdapter`
- `BrowserPort` — messaging, lifecycle. Implemented by `ChromeAdapter`
- `LoggerPort` — structured logging. Implemented by `ConsoleLogger` / `NoopLogger`

## Consequences

**Pros:**
- Adding Bluesky support = write a new `BlueskyAdapter` implementing `PlatformPort`. Zero core changes.
- Chrome → Firefox migration = write a `FirefoxAdapter` implementing `BrowserPort`. Zero core changes.
- Core logic is 100% unit testable with mock adapters. No browser required for tests.
- AI agents can work on any single module with full context within their context window.
- DOM changes in X.com only affect `XPlatformAdapter` — core and tests are unaffected.

**Cons:**
- More files and interfaces than a naive implementation.
- New developers (human or AI) must understand the layering before contributing.
- Port interfaces must be thoughtfully designed — changing them later is a breaking change across implementations.

**Mitigations for cons:**
- ARCHITECTURE.md explains the layering clearly with diagrams.
- Module size limits (max 300 lines) keep individual files comprehensible.
- Each ADR explains the rationale for its area.

## Alternatives Considered

**Option A: Flat structure with browser APIs throughout**
- Simple to start, but becomes impossible to test and maintain as complexity grows.
- Rejected: would require browser runtime for any test. DOM changes would affect all files.

**Option B: React + Chrome Extension boilerplate (e.g., CRXJS)**
- Popular pattern, good tooling. But couples the whole app to React's model.
- Content scripts would be too heavy (React alone is 130KB+).
- Rejected: violates the minimal-dependency principle and content script size budget.

**Option C: Layered architecture without strict port interfaces**
- Layers without enforced interfaces are suggestions, not constraints.
- AI agents and contributors routinely violate suggestions.
- Rejected: interface enforcement in TypeScript + lint rules is what makes this real.
