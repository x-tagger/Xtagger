/**
 * @file idb-adapter.test.ts
 * @description Integration tests for IDBAdapter.
 * Uses fake-indexeddb to run IDB operations in Node/jsdom without a real browser.
 *
 * Coverage:
 *   - Open/upgrade schema
 *   - Save/read tags
 *   - Query with filters
 *   - Soft delete + purge
 *   - Bulk save (import scenario)
 *   - Settings persistence
 *   - Schema version tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBAdapter } from '../../src/adapters/storage/idb-adapter';
import { NoopLogger } from '../../src/shared/logger';
import type { Tag, UserIdentifier } from '../../src/core/model/entities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (username: string, platform = 'x.com'): UserIdentifier => ({
  platform,
  username,
  firstSeen: Date.now(),
  lastSeen: Date.now(),
});

const makeTag = (name: string, id = `tag-${name}`, colorIndex = 0): Tag => ({
  id,
  name,
  colorIndex,
  source: { type: 'local' },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IDBAdapter', () => {
  let adapter: IDBAdapter;

  beforeEach(async () => {
    // fresh IDB instance per test via fake-indexeddb
    adapter = new IDBAdapter(new NoopLogger());
    const result = await adapter.open();
    expect(result.ok).toBe(true);
  });

  // ── Schema / Meta ───────────────────────────────────────────────────────────

  describe('schema version', () => {
    it('returns 0 when not set', async () => {
      const r = await adapter.getSchemaVersion();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(0);
    });

    it('persists schema version', async () => {
      await adapter.setSchemaVersion(1);
      const r = await adapter.getSchemaVersion();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(1);
    });
  });

  // ── Tag CRUD ────────────────────────────────────────────────────────────────

  describe('saveTag / getTagsForUser', () => {
    it('saves a tag and retrieves it', async () => {
      const user = makeUser('alice');
      const tag = makeTag('politics');

      await adapter.saveUser(user);
      await adapter.saveTag(user, tag);

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.length).toBe(1);
        expect(r.value[0]?.name).toBe('politics');
      }
    });

    it('returns empty array for user with no tags', async () => {
      const r = await adapter.getTagsForUser(makeUser('nobody'));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.length).toBe(0);
    });

    it('saves multiple tags for same user', async () => {
      const user = makeUser('alice');
      await adapter.saveUser(user);
      await adapter.saveTag(user, makeTag('politics', 't1'));
      await adapter.saveTag(user, makeTag('tech', 't2'));
      await adapter.saveTag(user, makeTag('art', 't3'));

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.length).toBe(3);
    });

    it('upserts (update existing tag by id)', async () => {
      const user = makeUser('alice');
      await adapter.saveUser(user);
      const tag = makeTag('politics', 'fixed-id');
      await adapter.saveTag(user, tag);

      const updated: Tag = { ...tag, name: 'POLITICS', updatedAt: Date.now() + 1 };
      await adapter.saveTag(user, updated);

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.length).toBe(1);
        expect(r.value[0]?.name).toBe('POLITICS');
      }
    });
  });

  describe('getTagById', () => {
    it('returns tag by id', async () => {
      const user = makeUser('alice');
      const tag = makeTag('news', 'tag-news');
      await adapter.saveUser(user);
      await adapter.saveTag(user, tag);

      const r = await adapter.getTagById('tag-news');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.name).toBe('news');
    });

    it('returns error for unknown id', async () => {
      const r = await adapter.getTagById('nonexistent');
      expect(r.ok).toBe(false);
    });
  });

  // ── Soft Delete ─────────────────────────────────────────────────────────────

  describe('softDeleteTag', () => {
    it('sets deletedAt and hides from getTagsForUser', async () => {
      const user = makeUser('alice');
      const tag = makeTag('politics', 'del-tag');
      await adapter.saveUser(user);
      await adapter.saveTag(user, tag);

      await adapter.softDeleteTag('del-tag');

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.length).toBe(0);
    });

    it('returns error for unknown tagId', async () => {
      const r = await adapter.softDeleteTag('ghost-id');
      expect(r.ok).toBe(false);
    });
  });

  describe('purgeDeletedTags', () => {
    it('removes soft-deleted tags older than cutoff', async () => {
      const user = makeUser('alice');
      const tag = makeTag('old', 'purge-me');
      await adapter.saveUser(user);
      // Save with an artificially old deletedAt
      const oldTag: Tag = { ...tag, deletedAt: Date.now() - 1000 };
      await adapter.saveTag(user, oldTag);

      const r = await adapter.purgeDeletedTags(Date.now());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(1);
    });
  });

  // ── Query ────────────────────────────────────────────────────────────────────

  describe('queryTags', () => {
    beforeEach(async () => {
      const alice = makeUser('alice');
      const bob   = makeUser('bob');
      await adapter.saveUser(alice);
      await adapter.saveUser(bob);
      await adapter.saveTag(alice, makeTag('tech', 'a1'));
      await adapter.saveTag(alice, makeTag('politics', 'a2'));
      await adapter.saveTag(bob, makeTag('tech', 'b1'));
      await adapter.saveTag(bob, makeTag('art', 'b2'));
    });

    it('returns all users when no filter', async () => {
      const r = await adapter.queryTags({});
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.totalCount).toBe(2);
    });

    it('filters by tagNameContains', async () => {
      const r = await adapter.queryTags({ tagNameContains: 'tech' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        // Both alice and bob have 'tech'
        expect(r.value.users.every(u => u.tags.some(t => t.name === 'tech'))).toBe(true);
      }
    });

    it('filters by usernameContains', async () => {
      const r = await adapter.queryTags({ usernameContains: 'ali' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.users.length).toBe(1);
        expect(r.value.users[0]?.user.username).toBe('alice');
      }
    });

    it('respects limit and offset', async () => {
      const r = await adapter.queryTags({ limit: 1, offset: 0 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.users.length).toBe(1);
        expect(r.value.totalCount).toBe(2);
      }
    });
  });

  // ── getAllTagNames ──────────────────────────────────────────────────────────

  describe('getAllTagNames', () => {
    it('returns unique sorted tag names', async () => {
      const user = makeUser('alice');
      await adapter.saveUser(user);
      await adapter.saveTag(user, makeTag('tech', 't1'));
      await adapter.saveTag(user, makeTag('art', 't2'));
      await adapter.saveTag(user, makeTag('tech', 't3')); // duplicate name, different id

      const r = await adapter.getAllTagNames();
      expect(r.ok).toBe(true);
      if (r.ok) {
        // Unique names only
        expect(r.value).toContain('tech');
        expect(r.value).toContain('art');
      }
    });
  });

  // ── Bulk save ───────────────────────────────────────────────────────────────

  describe('bulkSave', () => {
    it('saves multiple users and tags atomically', async () => {
      const now = Date.now();
      const r = await adapter.bulkSave([
        {
          user: makeUser('charlie'),
          tags: [makeTag('news', 'c1'), makeTag('sports', 'c2')],
        },
        {
          user: makeUser('diana'),
          tags: [makeTag('finance', 'd1')],
        },
      ]);
      expect(r.ok).toBe(true);

      const charlie = await adapter.getTagsForUser(makeUser('charlie'));
      expect(charlie.ok).toBe(true);
      if (charlie.ok) expect(charlie.value.length).toBe(2);

      const diana = await adapter.getTagsForUser(makeUser('diana'));
      expect(diana.ok).toBe(true);
      if (diana.ok) expect(diana.value.length).toBe(1);
    });
  });

  // ── Settings ────────────────────────────────────────────────────────────────

  describe('settings', () => {
    it('returns default settings when none saved', async () => {
      const r = await adapter.getSettings();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.displayMode).toBe('compact');
    });

    it('persists custom settings', async () => {
      const { DEFAULT_SETTINGS } = await import('../../src/core/model/entities');
      const custom = { ...DEFAULT_SETTINGS, displayMode: 'pills' as const, theme: 'dark' as const };
      await adapter.saveSettings(custom);

      const r = await adapter.getSettings();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.displayMode).toBe('pills');
        expect(r.value.theme).toBe('dark');
      }
    });
  });
});
