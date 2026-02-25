import { describe, it, expect } from 'vitest';
import { DefaultConflictResolver } from '../../src/core/services/conflict-resolver';
import type { Tag } from '../../src/core/model/entities';

const makeTag = (name: string, id = name): Tag => ({
  id,
  name,
  colorIndex: 0,
  source: { type: 'local' },
  createdAt: 1000,
  updatedAt: 1000,
});

describe('ConflictResolver', () => {
  const resolver = new DefaultConflictResolver();

  describe('keep-mine', () => {
    it('keeps existing tags and discards conflicting incoming', () => {
      const existing = [makeTag('politics')];
      const incoming = [makeTag('politics', 'x2'), makeTag('tech', 'x3')];
      const result = resolver.merge(existing, incoming, 'keep-mine', 'x.com');
      expect(result.added).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.finalTags.find(t => t.name === 'politics')?.id).toBe('politics');
      expect(result.finalTags.find(t => t.name === 'tech')).toBeDefined();
    });
  });

  describe('keep-theirs', () => {
    it('replaces existing with incoming on conflict (preserves ID)', () => {
      const existing = [makeTag('politics', 'existing-id')];
      const incoming = [makeTag('politics', 'incoming-id')];
      const result = resolver.merge(existing, incoming, 'keep-theirs', 'x.com');
      expect(result.merged).toBe(1);
      const kept = result.finalTags.find(t => t.name === 'politics');
      expect(kept?.id).toBe('existing-id'); // ID preserved
      expect(kept?.source.type).toBe('imported');
    });
  });

  describe('merge-both', () => {
    it('keeps existing and adds incoming with disambiguated name', () => {
      const existing = [makeTag('politics')];
      const incoming = [makeTag('politics', 'x2')];
      const result = resolver.merge(existing, incoming, 'merge-both', 'x.com');
      expect(result.merged).toBe(1);
      expect(result.finalTags.length).toBe(2);
      expect(result.finalTags.some(t => t.name === 'politics')).toBe(true);
      expect(result.finalTags.some(t => t.name === 'politics (imported)')).toBe(true);
    });
  });

  it('adds non-conflicting incoming tags in all strategies', () => {
    for (const strategy of ['keep-mine', 'keep-theirs', 'merge-both'] as const) {
      const result = resolver.merge([], [makeTag('new')], strategy, 'x.com');
      expect(result.added).toBe(1);
    }
  });
});
