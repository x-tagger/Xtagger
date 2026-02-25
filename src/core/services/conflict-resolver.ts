/**
 * @module conflict-resolver
 * @layer Core / Services
 * @description Merge strategy logic for import conflicts.
 * Pure functions — no I/O, no storage. Easily testable.
 *
 * Strategies:
 *   keep-mine:   Existing tags win; incoming tags with same name are discarded
 *   keep-theirs: Incoming tags win; existing tags with same name are replaced
 *   merge-both:  Both kept; incoming tag renamed with "(imported)" suffix
 */

import { uuidv7 } from 'uuidv7';
import type { Tag } from '@core/model/entities';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConflictStrategy = 'keep-mine' | 'keep-theirs' | 'merge-both';

export interface MergeResult {
  /** Tags to persist (the complete set after merging) */
  readonly finalTags: Tag[];
  readonly added: number;
  readonly merged: number;
  readonly skipped: number;
}

export interface ConflictResolver {
  merge(
    existing: ReadonlyArray<Tag>,
    incoming: ReadonlyArray<Tag>,
    strategy: ConflictStrategy,
    platform: string,
  ): MergeResult;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class DefaultConflictResolver implements ConflictResolver {
  merge(
    existing: ReadonlyArray<Tag>,
    incoming: ReadonlyArray<Tag>,
    strategy: ConflictStrategy,
    _platform: string,
  ): MergeResult {
    const now = Date.now();
    const result = new Map<string, Tag>(
      existing.map((t) => [t.name.toLowerCase(), t]),
    );

    let added = 0;
    let merged = 0;
    let skipped = 0;

    for (const incomingTag of incoming) {
      const key = incomingTag.name.toLowerCase();
      const conflict = result.get(key);

      if (!conflict) {
        // No conflict — add the incoming tag
        result.set(key, {
          ...incomingTag,
          id: uuidv7(), // New ID for local storage
          source: { type: 'imported', origin: 'import', importedAt: now },
          updatedAt: now,
        });
        added++;
        continue;
      }

      // Conflict — apply strategy
      switch (strategy) {
        case 'keep-mine':
          skipped++;
          break;

        case 'keep-theirs':
          result.set(key, {
            ...incomingTag,
            id: conflict.id, // Preserve existing ID
            source: { type: 'imported', origin: 'import', importedAt: now },
            updatedAt: now,
          });
          merged++;
          break;

        case 'merge-both': {
          // Keep existing as-is, add incoming with disambiguated name
          const disambiguated = this.disambiguate(incomingTag.name, result);
          result.set(disambiguated.toLowerCase(), {
            ...incomingTag,
            id: uuidv7(),
            name: disambiguated,
            source: { type: 'imported', origin: 'import', importedAt: now },
            updatedAt: now,
          });
          merged++;
          break;
        }
      }
    }

    return {
      finalTags: Array.from(result.values()),
      added,
      merged,
      skipped,
    };
  }

  private disambiguate(name: string, existing: Map<string, Tag>): string {
    const candidate = `${name} (imported)`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
    // If that also conflicts, add a counter
    let i = 2;
    while (existing.has(`${name} (imported ${i})`.toLowerCase())) {
      i++;
    }
    return `${name} (imported ${i})`;
  }
}
