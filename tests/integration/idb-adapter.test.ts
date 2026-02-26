/**
 * @file idb-adapter.test.ts
 * @description Integration tests for IDBAdapter using fake-indexeddb.
 *
 * Isolation: each test gets a unique DB name (test_xtagger_N) so there is
 * zero state bleed between tests.
 *
 * Contract notes (tested here, not guesses):
 *   - getTagById: returns err() when tag not found (StoragePort returns Result<Tag, err>)
 *   - queryTags: filter uses usernameContains (partial, case-insensitive substring)
 *   - getSettings: returns DEFAULT_SETTINGS when nothing is saved (never null)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBAdapter }  from '../../src/adapters/storage/idb-adapter';
import { NoopLogger }  from '../../src/shared/logger';
import type { Tag, UserIdentifier } from '../../src/core/model/entities';
import { DEFAULT_SETTINGS } from '../../src/core/model/entities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _dbCounter = 0;
function freshAdapter(): IDBAdapter {
  return new IDBAdapter(new NoopLogger(), `test_xtagger_${++_dbCounter}`);
}

const makeUser = (username: string, platform = 'x.com'): UserIdentifier => ({
  platform,
  username,
  firstSeen: 1_700_000_000_000,
  lastSeen:  1_700_000_000_000,
});

// All tag IDs are valid UUIDs (required by TagSchema)
const makeTag = (
  name: string,
  id = `018e0000-0000-7000-8000-${String(name.length).padStart(12, '0')}`,
  colorIndex = 0,
): Tag => ({
  id,
  name,
  colorIndex,
  source: { type: 'local' },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IDBAdapter', () => {
  let adapter: IDBAdapter;

  beforeEach(async () => {
    adapter = freshAdapter();
    const result = await adapter.open();
    expect(result.ok).toBe(true);
  });

  // ── Schema / Meta ────────────────────────────────────────────────────────

  describe('schema version', () => {
    it('returns 0 when not set', async () => {
      const r = await adapter.getSchemaVersion();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(0);
    });

    it('saves and reads schema version', async () => {
      await adapter.setSchemaVersion(1);
      const r = await adapter.getSchemaVersion();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(1);
    });
  });

  // ── Save / Get ───────────────────────────────────────────────────────────

  describe('saveTag / getTagsForUser', () => {
    it('saves a tag and retrieves it', async () => {
      const user = makeUser('alice');
      const tag  = makeTag('tech', '018e0000-0000-7000-8000-000000000001');

      await adapter.saveTag(user, tag);
      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.length).toBe(1);
        expect(r.value[0]?.name).toBe('tech');
      }
    });

    it('returns empty array for user with no tags', async () => {
      const r = await adapter.getTagsForUser(makeUser('nobody'));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.length).toBe(0);
    });

    it('saves multiple tags for same user', async () => {
      const user = makeUser('bob');
      await adapter.saveTag(user, makeTag('a', '018e0000-0000-7000-8000-000000000001'));
      await adapter.saveTag(user, makeTag('b', '018e0000-0000-7000-8000-000000000002'));
      await adapter.saveTag(user, makeTag('c', '018e0000-0000-7000-8000-000000000003'));

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.length).toBe(3);
    });

    it('upserts (update existing tag by id)', async () => {
      const user     = makeUser('carol');
      const tagId    = '018e0000-0000-7000-8000-000000000001';
      const original = makeTag('news', tagId);
      const updated  = { ...makeTag('POLITICS', tagId), updatedAt: 1_700_000_001_000 };

      await adapter.saveTag(user, original);
      await adapter.saveTag(user, updated);

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.length).toBe(1);
        expect(r.value[0]?.name).toBe('POLITICS');
      }
    });
  });

  // ── getTagById ───────────────────────────────────────────────────────────

  describe('getTagById', () => {
    it('returns the tag when it exists', async () => {
      const user  = makeUser('dave');
      const tagId = '018e0000-0000-7000-8000-000000000001';
      await adapter.saveTag(user, makeTag('sports', tagId));

      const r = await adapter.getTagById(tagId);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value?.name).toBe('sports');
    });

    it('returns an error result for unknown id (not-found is an error, not ok(undefined))', async () => {
      // StoragePort.getTagById returns Result<Tag, StorageError> — not nullable.
      // When the tag does not exist, the adapter returns err() rather than ok(undefined).
      const r = await adapter.getTagById('018e0000-0000-7000-8000-000000000999');
      expect(r.ok).toBe(false);
    });
  });

  // ── Soft delete ──────────────────────────────────────────────────────────

  describe('softDeleteTag', () => {
    it('sets deletedAt and hides from getTagsForUser', async () => {
      const user  = makeUser('eve');
      const tagId = '018e0000-0000-7000-8000-000000000001';
      await adapter.saveTag(user, makeTag('gossip', tagId));

      const before = await adapter.getTagsForUser(user);
      expect(before.ok && before.value.length).toBe(1);

      await adapter.softDeleteTag(tagId);

      const r = await adapter.getTagsForUser(user);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.length).toBe(0);
    });

    it('returns error for unknown tagId', async () => {
      const r = await adapter.softDeleteTag('018e0000-0000-7000-8000-000000000999');
      expect(r.ok).toBe(false);
    });
  });

  // ── Purge ────────────────────────────────────────────────────────────────

  describe('purgeDeletedTags', () => {
    it('removes soft-deleted tags older than cutoff', async () => {
      const user  = makeUser('frank');
      const tagId = '018e0000-0000-7000-8000-000000000001';
      await adapter.saveTag(user, makeTag('old-tag', tagId));
      await adapter.softDeleteTag(tagId);

      const r = await adapter.purgeDeletedTags(Date.now());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(1);
    });
  });

  // ── queryTags ────────────────────────────────────────────────────────────

  describe('queryTags', () => {
    it('returns all users with no filter', async () => {
      await adapter.saveTag(makeUser('user1'), makeTag('a1', '018e0000-0000-7000-8000-000000000001'));
      await adapter.saveTag(makeUser('user2'), makeTag('b1', '018e0000-0000-7000-8000-000000000002'));

      const r = await adapter.queryTags({});
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.users.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by username (case-insensitive substring via usernameContains)', async () => {
      // TagFilter.usernameContains is a case-insensitive substring filter — not an exact-array filter
      await adapter.saveTag(makeUser('gracesmith'), makeTag('g1', '018e0000-0000-7000-8000-000000000001'));
      await adapter.saveTag(makeUser('bobmarley'),  makeTag('g2', '018e0000-0000-7000-8000-000000000002'));

      // 'graces' matches 'gracesmith' only
      const r = await adapter.queryTags({ usernameContains: 'graces' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.users.length).toBe(1);
        expect(r.value.users[0]?.user.username).toBe('gracesmith');
      }
    });

    it('filters by tag name', async () => {
      const u = makeUser('henry');
      await adapter.saveTag(u, makeTag('science', '018e0000-0000-7000-8000-000000000001'));
      await adapter.saveTag(u, makeTag('art',     '018e0000-0000-7000-8000-000000000002'));

      const r = await adapter.queryTags({ tagNameContains: 'sci' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.users.length).toBe(1);
        expect(r.value.users[0]?.tags[0]?.name).toBe('science');
      }
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.saveTag(
          makeUser(`limuser${i}`),
          makeTag(`tag${i}`, `018e0000-0000-7000-8000-00000000000${i}`),
        );
      }
      const r = await adapter.queryTags({ limit: 2 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.users.length).toBe(2);
    });
  });

  // ── getAllTagNames ────────────────────────────────────────────────────────

  describe('getAllTagNames', () => {
    it('returns unique sorted tag names (not tag IDs)', async () => {
      const u1 = makeUser('iris');
      const u2 = makeUser('jack');
      // u1 has tags 'tech' and 'art'
      await adapter.saveTag(u1, makeTag('tech', '018e0000-0000-7000-8000-000000000001'));
      await adapter.saveTag(u1, makeTag('art',  '018e0000-0000-7000-8000-000000000002'));
      // u2 also has 'tech' — should appear only once
      await adapter.saveTag(u2, makeTag('tech', '018e0000-0000-7000-8000-000000000003'));

      const r = await adapter.getAllTagNames();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toContain('tech');
        expect(r.value).toContain('art');
        // 'tech' saved twice (for 2 different users) but must deduplicate to 1
        expect(r.value.filter(n => n === 'tech').length).toBe(1);
        // Must be sorted alphabetically
        expect([...r.value].sort()).toEqual([...r.value]);
      }
    });
  });

  // ── bulkSave ─────────────────────────────────────────────────────────────

  describe('bulkSave', () => {
    it('saves multiple user-tag sets atomically', async () => {
      const items = [
        { user: makeUser('kara'), tags: [makeTag('k1', '018e0000-0000-7000-8000-000000000001')] },
        { user: makeUser('liam'), tags: [
          makeTag('l1', '018e0000-0000-7000-8000-000000000002'),
          makeTag('l2', '018e0000-0000-7000-8000-000000000003'),
        ]},
      ];

      const r = await adapter.bulkSave(items);
      expect(r.ok).toBe(true);

      const kara = await adapter.getTagsForUser(makeUser('kara'));
      const liam = await adapter.getTagsForUser(makeUser('liam'));
      expect(kara.ok && kara.value.length).toBe(1);
      expect(liam.ok && liam.value.length).toBe(2);
    });
  });

  // ── Settings ─────────────────────────────────────────────────────────────

  describe('settings', () => {
    it('returns DEFAULT_SETTINGS when no settings saved (never null)', async () => {
      // getSettings() returns DEFAULT_SETTINGS as fallback — it never returns null.
      // Callers wanting to detect "not set" should save settings explicitly.
      const r = await adapter.getSettings();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toEqual(DEFAULT_SETTINGS);
        expect(r.value.displayMode).toBe('compact');
        expect(r.value.theme).toBe('auto');
      }
    });

    it('saves and retrieves custom settings', async () => {
      const custom = {
        displayMode: 'pills' as const,
        theme: 'dark' as const,
        hoverToEdit: true,
        extendedPalette: false,
        surfaceOverrides: {},
      };
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
