# ADR-004: Typed Message Protocol (Content ↔ Background)

## Status: Accepted
## Date: 2025-01-15

## Context

Chrome MV3 extensions communicate across contexts (content script, popup, service worker)
via `chrome.runtime.sendMessage`. Without a typed protocol, this becomes a stringly-typed
API that is easy to misuse and impossible to refactor safely.

## Decision

All cross-context messages use a `MessageEnvelope { channel, payload }` structure.
Channels are defined as a TypeScript union type `MessageChannel`. Per-channel request
and response types are co-located in `src/shared/messages.ts`.

The background `MessageRouter` is the single entry point that routes all messages to
the appropriate service method.

## Consequences

**Pro:** TypeScript enforces correct payload shapes at call sites.

**Pro:** All channels are discoverable in one file — easy to audit.

**Pro:** Adding a new channel requires only: add to the union, add handler in router,
add request/response types. No other files change.

**Con:** Requires imports of `@shared/messages` in every context that sends/receives.

## Alternatives Considered

- **Direct service calls**: Would require service worker to be persistent (MV3 prohibits). Rejected.
- **tRPC or similar**: Adds a large dependency for a solved problem. Rejected (P7).
