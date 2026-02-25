# ADR-004: Result Types Over Exceptions

## Status: Accepted
## Date: 2025-01-15

## Context

JavaScript/TypeScript's standard error handling uses thrown exceptions. The problem:
- TypeScript cannot type-check what `catch (e)` receives — `e` is `unknown`
- Callers have no compile-time indication that a function can fail
- It's easy to forget error handling; TypeScript won't tell you
- Async exception handling across Promise chains is error-prone

For XTagger, data integrity is paramount. Tag data must never be silently lost or corrupted due to an unhandled error path. We need errors to be explicit, typed, and impossible to ignore.

## Decision

**All fallible operations in core logic return `Result<T, E>` instead of throwing.**

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

The caller MUST check `result.ok` before using `result.value`. TypeScript enforces this.

**The only place `try/catch` appears is at adapter boundaries**, where we catch untyped browser API errors and convert them to typed `Result` values.

Error types are typed discriminated unions:
```typescript
type StorageError =
  | { type: 'STORAGE_READ_FAILED'; message: string }
  | { type: 'STORAGE_WRITE_FAILED'; message: string }
  // ...
```

This makes `switch (error.type)` exhaustive-checkable by TypeScript.

## Consequences

**Pros:**
- Every error path is visible in the type signature of the function
- TypeScript enforces handling: you can't use `result.value` without checking `result.ok`
- Error types are discriminated unions — switches over them are exhaustive-checkable
- Composable: `andThen`, `mapOk`, `mapErr` utilities enable clean chaining
- AI agents are forced to handle errors correctly — the types demand it

**Cons:**
- Verbose compared to `await someFunction()` without any error handling
- Developers (human and AI) unfamiliar with the pattern need orientation
- Some patterns (re-throwing for logging purposes) need to be adapted

**Mitigations:**
- Utility functions (`andThen`, `mapOk`, `unwrapOr`) reduce boilerplate
- This ADR and code examples in the codebase explain the pattern
- AI prompt templates explicitly mention Result types and include examples

## Alternatives Considered

**Option A: Standard try/catch throughout**
- Familiar to all JS developers.
- Rejected: untyped errors, easy to miss, TypeScript gives no help.

**Option B: neverthrow library**
- A popular Result type library for TypeScript.
- Good API, well-maintained.
- Rejected: we prefer a minimal hand-rolled implementation to avoid the dependency and to keep the exact API we want (e.g., `{ ok: true, value }` shape rather than a class).

**Option C: Exceptions in core, Result types at ports**
- Partial approach — exceptions inside core, converted at boundaries.
- Rejected: exceptions inside core are still untyped and can still be forgotten. Full Result types everywhere is the only way to make error handling truly impossible to miss.
