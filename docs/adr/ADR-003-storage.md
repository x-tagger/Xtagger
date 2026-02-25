# ADR-003: IndexedDB for Local Storage

## Status: Accepted
## Date: 2025-01-15

## Context

Tag data must be stored locally (P1: Local-First Data Sovereignty). Options:
- `chrome.storage.local`: Limited to ~5MB, no indexing, synchronous quota constraints
- `chrome.storage.sync`: Syncs via Google cloud — **explicitly prohibited by P1**
- `IndexedDB`: No size limit, indexed queries, full transaction support
- `localStorage`: Synchronous, 5MB limit, no indexing

## Decision

Use IndexedDB as the primary storage engine, accessed via a `StorageAdapter` that
implements `StoragePort`. This provides:
- Indexed queries by username, tag name, and timestamps
- Transaction support for bulk import operations
- No practical size limit for tag collections

## Consequences

**Pro:** Full query capabilities, no size limits, transactional writes for import safety.

**Pro:** Abstracted behind `StoragePort` — can be swapped without touching core code.

**Con:** Async-only API; no synchronous reads. Mitigated by in-memory cache in content script.

**Con:** "Clear browsing data" can delete tags. Mitigated by export reminders and clear docs.

## Alternatives Considered

- **chrome.storage.local**: Too small for large tag collections. Rejected.
- **chrome.storage.sync**: Violates P1 (data transits Google cloud). Explicitly rejected.
- **SQLite (WASM)**: Too heavy for content script. Rejected for now; may reconsider post-v1.
