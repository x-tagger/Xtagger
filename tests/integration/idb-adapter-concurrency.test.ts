/**
 * Concurrency contract for IDBAdapter.open().
 *
 * The service worker issues open() from three independent entry points
 * (module-load initialise, onInstalled, onStartup-triggered migrations)
 * and they can race on cold start. The adapter must collapse concurrent
 * opens into a single indexedDB.open request so router registration
 * doesn't see a spurious err() from the losing path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBAdapter } from '../../src/adapters/storage/idb-adapter';
import { NoopLogger } from '../../src/shared/logger';

let _dbCounter = 0;
function freshAdapter(): IDBAdapter {
  return new IDBAdapter(new NoopLogger(), `test_xtagger_concurrency_${++_dbCounter}`);
}

describe('IDBAdapter concurrency', () => {
  // Inferred spy type — vi.spyOn generics are brittle when quoted through
  // `ReturnType<typeof vi.spyOn>`, so we initialise eagerly and let tsc infer.
  let openSpy = vi.spyOn(indexedDB, 'open');

  beforeEach(() => {
    openSpy = vi.spyOn(indexedDB, 'open');
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  describe('deduplication of concurrent opens', () => {
    it('two concurrent open() calls share one indexedDB.open request', async () => {
      const adapter = freshAdapter();
      const [a, b] = await Promise.all([adapter.open(), adapter.open()]);

      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('three concurrent open() calls share one indexedDB.open request', async () => {
      const adapter = freshAdapter();
      const [a, b, c] = await Promise.all([adapter.open(), adapter.open(), adapter.open()]);

      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(c.ok).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('concurrent callers observe the same Result value (structural equality)', async () => {
      const adapter = freshAdapter();
      const results = await Promise.all([adapter.open(), adapter.open(), adapter.open()]);

      // All three resolve to ok(undefined) — the promise is literally shared.
      for (const r of results) {
        expect(r).toEqual({ ok: true, value: undefined });
      }
    });
  });

  describe('fast-path after successful open', () => {
    it('sequential opens after success do not issue new indexedDB.open calls', async () => {
      const adapter = freshAdapter();
      const first = await adapter.open();
      expect(first.ok).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(1);

      const second = await adapter.open();
      const third = await adapter.open();
      expect(second.ok).toBe(true);
      expect(third.ok).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(1); // still 1 — served from this.db
    });
  });

  describe('retry after failure', () => {
    it('subsequent open() after a failed open issues a fresh request', async () => {
      const adapter = freshAdapter();

      // First call: force indexedDB.open to synthesise an error.
      openSpy.mockImplementationOnce(() => {
        const stub = {
          onsuccess: null as ((e: Event) => void) | null,
          onerror: null as ((e: Event) => void) | null,
          onupgradeneeded: null as ((e: Event) => void) | null,
          error: new DOMException('forced failure', 'UnknownError'),
        };
        // Fire onerror on the microtask queue so the caller has time to attach handlers.
        queueMicrotask(() => {
          stub.onerror?.({ target: stub } as unknown as Event);
        });
        return stub as unknown as IDBOpenDBRequest;
      });

      const failed = await adapter.open();
      expect(failed.ok).toBe(false);
      expect(openSpy).toHaveBeenCalledTimes(1);

      // Second call: default fake-indexeddb path succeeds because the cached
      // failed promise was nulled, so the adapter issues a fresh request.
      const retried = await adapter.open();
      expect(retried.ok).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(2);
    });
  });
});
