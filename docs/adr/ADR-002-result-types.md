# ADR-002: Result Types over Exceptions

## Status: Accepted
## Date: 2025-01-15

## Context

JavaScript exceptions are untyped (`catch (e)` gives `unknown`) and invisible in
function signatures. A caller cannot know whether a function can fail without reading
its implementation. This is especially problematic with AI-assisted development where
context is limited.

## Decision

All core functions that can fail return `Result<T, E>` discriminated unions.
`try/catch` blocks are only permitted in adapter code at infrastructure boundaries,
where they catch platform exceptions (IndexedDB errors, chrome.runtime errors)
and convert them to typed `Result` errors.

The `Result` type is:
```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }
```

## Consequences

**Pro:** Error handling is explicit and type-safe. TypeScript enforces handling.

**Pro:** Function signatures document failure modes — no need to read implementations.

**Pro:** Composable via `flatMapResult` for chaining fallible operations.

**Con:** More verbose than try/catch for simple cases.

**Con:** AI/developers must be explicitly told about this pattern in every prompt.

## Alternatives Considered

- **Thrown exceptions**: Untyped, invisible in signatures, easy to forget to handle. Rejected.
- **Nullable returns (T | null)**: Loses error information. Rejected.
- **neverthrow library**: Adds a dependency for something implementable in ~50 lines. Rejected.
