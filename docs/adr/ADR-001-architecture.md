# ADR-001: Hexagonal Architecture (Ports & Adapters)

## Status: Accepted
## Date: 2025-01-15

## Context

A Chrome extension must interact with multiple infrastructure concerns: Chrome APIs,
IndexedDB, the X.com DOM, and potentially future platforms. Tightly coupling business
logic to any of these makes platform changes, testing, and future extension painful.

Additionally, this codebase is intended to be maintained primarily by AI coding agents.
AI agents work best with clearly bounded modules that can be understood within a single
context window.

## Decision

Adopt the Hexagonal Architecture (Ports & Adapters) pattern:

- **Core domain** (src/core/): Pure TypeScript, zero browser/DOM/network imports.
  Defines *ports* (interfaces) for all infrastructure needs.
- **Adapters** (src/adapters/, src/platforms/): Implement ports for specific environments.
  Chrome adapter, Firefox adapter (future), X.com platform adapter, etc.
- **UI layer** (src/ui/): Adapters for rendering. Talks to core through ports.

## Consequences

**Pro:** Swapping infrastructure requires zero core changes (Chrome → Firefox,
X.com → Bluesky, IndexedDB → different storage).

**Pro:** Core is 100% unit-testable without browser APIs.

**Pro:** Each module is bounded and understandable in isolation.

**Con:** More initial boilerplate (interface files, dependency injection).

**Con:** Requires discipline to avoid "shortcutting" through the abstraction layers.

## Alternatives Considered

- **Direct coupling**: Simple to start, impossible to maintain. Rejected.
- **Redux/Zustand**: State management pattern doesn't solve architectural coupling. Rejected.
