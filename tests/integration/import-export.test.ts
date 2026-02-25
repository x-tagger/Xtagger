/**
 * @file import-export.test.ts
 * @description Integration tests for the full import/export roundtrip.
 * Uses fake-indexeddb for real storage operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import { IDBAdapter }              from '../../src/adapters/storage/idb-adapter';
import { TagService }              from '../../src/core/services/tag-service';
import { ImportExportService }     from '../../src/core/services/import-export';
import { DefaultConflictResolver } from '../../src/core/services/conflict-resolver';
import { EventBus }                from '../../src/core/events/event-bus';
import { NoopLogger }              from '../../src/shared/logger';
import type { UserIdentifier }     from '../../src/core/model/entities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (username: string): UserIdentifier => ({
  platform: 'x.com',
  username,
  firstSeen: Date.now(),
  lastSeen: Date.now(),
});

async function buildServices() {
  const logger  = new NoopLogger();
  const storage = new IDBAdapter(logger);
  await storage.open();
  const bus      = new EventBus();
  const resolver = new DefaultConflictResolver();
  const tagSvc   = new TagService(storage, bus, logger);
  const ieSvc    = new ImportExportService(storage, bus, resolver, logger);
  return { storage, tagSvc, ieSvc, bus };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ImportExportService', () => {

  describe('export → import roundtrip', () => {
    it('exports tags and re-imports them into a fresh store', async () => {
      const { tagSvc, ieSvc } = await buildServices();
      const alice = makeUser('alice');

      await tagSvc.createTag(alice, { name: 'journalist', colorIndex: 0 });
      await tagSvc.createTag(alice, { name: 'verified',   colorIndex: 1 });

      const exportResult = await ieSvc.exportAll({ platform: 'x.com' });
      expect(exportResult.ok).toBe(true);
      if (!exportResult.ok) return;
      expect(exportResult.value.userCount).toBe(1);
      expect(exportResult.value.tagCount).toBe(2);

      // Import into fresh store
      const { tagSvc: tagSvc2, ieSvc: ieSvc2 } = await buildServices();
      const preview = await ieSvc2.previewImport(exportResult.value.json);
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      expect(preview.value.checksumValid).toBe(true);
      expect(preview.value.tagsToAdd).toBe(2);

      const applyResult = await ieSvc2.applyImport(preview.value.manifest, {
        conflictStrategy: 'keep-mine',
        filterUsernames: [],
        filterTagNames: [],
      });
      expect(applyResult.ok).toBe(true);
      if (!applyResult.ok) return;
      expect(applyResult.value.added).toBe(2);

      const tags = await tagSvc2.getTagsForUser(alice);
      expect(tags.ok).toBe(true);
      if (tags.ok) expect(tags.value.length).toBe(2);
    });

    it('compact XTAG: format roundtrips correctly', async () => {
      const { tagSvc, ieSvc } = await buildServices();
      await tagSvc.createTag(makeUser('bob'), { name: 'developer', colorIndex: 2 });

      const exportResult = await ieSvc.exportAll({ platform: 'x.com' });
      expect(exportResult.ok).toBe(true);
      if (!exportResult.ok) return;

      const compact = exportResult.value.compact;
      expect(compact.startsWith('XTAG:')).toBe(true);

      const { ieSvc: ieSvc2 } = await buildServices();
      const preview = await ieSvc2.previewImport(compact);
      expect(preview.ok).toBe(true);
      if (preview.ok) expect(preview.value.tagsToAdd).toBe(1);
    });
  });

  describe('conflict resolution', () => {
    it('keep-mine: preserves existing tags on conflict', async () => {
      const src = await buildServices();
      const dst = await buildServices();
      const user = makeUser('charlie');

      await src.tagSvc.createTag(user, { name: 'politics', colorIndex: 0 });
      await dst.tagSvc.createTag(user, { name: 'politics', colorIndex: 3 });

      const exported = await src.ieSvc.exportAll({ platform: 'x.com' });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;

      const preview = await dst.ieSvc.previewImport(exported.value.json);
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;

      const result = await dst.ieSvc.applyImport(preview.value.manifest, {
        conflictStrategy: 'keep-mine',
        filterUsernames: [],
        filterTagNames: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.skipped).toBe(1);

      const tags = await dst.tagSvc.getTagsForUser(user);
      expect(tags.ok).toBe(true);
      if (tags.ok) expect(tags.value[0]?.colorIndex).toBe(3);
    });

    it('keep-theirs: replaces existing tags on conflict', async () => {
      const src = await buildServices();
      const dst = await buildServices();
      const user = makeUser('diana');

      await src.tagSvc.createTag(user, { name: 'art', colorIndex: 5 });
      await dst.tagSvc.createTag(user, { name: 'art', colorIndex: 1 });

      const exported = await src.ieSvc.exportAll({ platform: 'x.com' });
      if (!exported.ok) return;
      const preview = await dst.ieSvc.previewImport(exported.value.json);
      if (!preview.ok) return;

      const result = await dst.ieSvc.applyImport(preview.value.manifest, {
        conflictStrategy: 'keep-theirs',
        filterUsernames: [],
        filterTagNames: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.merged).toBe(1);

      const tags = await dst.tagSvc.getTagsForUser(user);
      if (tags.ok) expect(tags.value[0]?.colorIndex).toBe(5);
    });

    it('merge-both: keeps both with disambiguation', async () => {
      const src = await buildServices();
      const dst = await buildServices();
      const user = makeUser('eve');

      await src.tagSvc.createTag(user, { name: 'tech', colorIndex: 0 });
      await dst.tagSvc.createTag(user, { name: 'tech', colorIndex: 4 });

      const exported = await src.ieSvc.exportAll({ platform: 'x.com' });
      if (!exported.ok) return;
      const preview = await dst.ieSvc.previewImport(exported.value.json);
      if (!preview.ok) return;

      await dst.ieSvc.applyImport(preview.value.manifest, {
        conflictStrategy: 'merge-both',
        filterUsernames: [],
        filterTagNames: [],
      });

      const tags = await dst.tagSvc.getTagsForUser(user);
      expect(tags.ok).toBe(true);
      if (tags.ok) {
        expect(tags.value.length).toBe(2);
        expect(tags.value.some(t => t.name === 'tech')).toBe(true);
        expect(tags.value.some(t => t.name === 'tech (imported)')).toBe(true);
      }
    });
  });

  describe('filtered export', () => {
    it('exports only specified users', async () => {
      const { tagSvc, ieSvc } = await buildServices();
      await tagSvc.createTag(makeUser('alice'), { name: 'journalist', colorIndex: 0 });
      await tagSvc.createTag(makeUser('bob'),   { name: 'developer',  colorIndex: 1 });

      const r = await ieSvc.exportAll({ platform: 'x.com', filterUsernames: ['alice'] });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.userCount).toBe(1);
        expect(Object.keys(r.value.manifest.entries)[0]).toContain('alice');
      }
    });
  });

  describe('validation', () => {
    it('rejects invalid JSON', async () => {
      const { ieSvc } = await buildServices();
      const r = await ieSvc.previewImport('not json!!!');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.type).toBe('IMPORT_PARSE_FAILED');
    });

    it('rejects JSON that does not match ExportManifest schema', async () => {
      const { ieSvc } = await buildServices();
      const r = await ieSvc.previewImport('{"foo": "bar"}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.type).toBe('IMPORT_VALIDATION_FAILED');
    });
  });

  describe('events', () => {
    it('emits import:started and import:completed events', async () => {
      const src = await buildServices();
      await src.tagSvc.createTag(makeUser('frank'), { name: 'news', colorIndex: 0 });
      const exported = await src.ieSvc.exportAll({ platform: 'x.com' });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;

      const dst = await buildServices();
      const started   = vi.fn();
      const completed = vi.fn();
      dst.bus.on('import:started',   started);
      dst.bus.on('import:completed', completed);

      const preview = await dst.ieSvc.previewImport(exported.value.json);
      if (!preview.ok) return;
      await dst.ieSvc.applyImport(preview.value.manifest, {
        conflictStrategy: 'keep-mine',
        filterUsernames: [],
        filterTagNames: [],
      });

      expect(started).toHaveBeenCalled();
      expect(completed).toHaveBeenCalled();
    });
  });
});
