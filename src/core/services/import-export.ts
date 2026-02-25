/**
 * @module import-export
 * @layer Core / Services
 * @description Serialize, deserialize, validate, and merge tag collections.
 * This is the heart of the sharing model — handles all import/export flows.
 *
 * Dependencies (injected):
 *   - StoragePort: read existing tags, bulk save imported tags
 *   - TypedEventBus: emit import lifecycle events
 *   - ConflictResolver: merge strategy logic
 *   - LoggerPort: structured logging
 */

import type { StoragePort } from '@core/ports/storage.port';
import type { LoggerPort } from '@core/ports/logger.port';
import type { TypedEventBus } from '@core/events/event-bus';
import type { Tag, UserIdentifier, ExportManifest } from '@core/model/entities';
import type { ValidationError, StorageError } from '@core/shared/errors';
import type { ImportOptions } from '@core/model/schemas';
import type { Result } from '@core/shared/result';
import type { ConflictResolver, MergeResult } from './conflict-resolver';

import { ok, err } from '@core/shared/result';
import { ExportManifestSchema } from '@core/model/schemas';
import { CURRENT_SCHEMA_VERSION, COMPACT_EXPORT_PREFIX, PLATFORM_X } from '@core/shared/constants';

// ─── Export Result ────────────────────────────────────────────────────────────

export interface ExportResult {
  readonly manifest: ExportManifest;
  /** JSON string ready to write to a file or clipboard */
  readonly json: string;
  /** Compact base64-prefixed string for character-limited contexts */
  readonly compact: string;
  /** Number of users included */
  readonly userCount: number;
  /** Number of tags included */
  readonly tagCount: number;
}

// ─── Import Preview ───────────────────────────────────────────────────────────

export interface ImportPreview {
  readonly usersAffected: number;
  readonly tagsToAdd: number;
  readonly tagsToMerge: number;
  readonly tagsToSkip: number;
  readonly conflicts: number;
  readonly checksumValid: boolean;
  readonly manifest: ExportManifest;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ImportExportService {
  private readonly log: LoggerPort;

  constructor(
    private readonly storage: StoragePort,
    private readonly bus: TypedEventBus,
    private readonly resolver: ConflictResolver,
    logger: LoggerPort,
  ) {
    this.log = logger.child('ImportExportService');
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * Export all tags for the given users (or all tagged users if none specified).
   * @param platform - The platform to export from
   * @param exportedBy - Optional attribution string
   * @param description - Optional collection description
   */
  async exportAll(opts: {
    platform?: string;
    exportedBy?: string;
    description?: string;
    filterUsernames?: ReadonlyArray<string>;
    filterTagNames?: ReadonlyArray<string>;
  }): Promise<Result<ExportResult, StorageError | ValidationError>> {
    const platform = opts.platform ?? PLATFORM_X;

    const queryResult = await this.storage.queryTags({
      platform,
      includeDeleted: false,
      ...(opts.filterTagNames?.length ? { tagNameContains: undefined } : {}),
    });

    if (!queryResult.ok) return queryResult;

    const entries: Record<string, Tag[]> = {};
    let tagCount = 0;

    for (const userTags of queryResult.value.users) {
      let tags = [...userTags.tags];

      if (opts.filterTagNames && opts.filterTagNames.length > 0) {
        const filterSet = new Set(opts.filterTagNames.map((n) => n.toLowerCase()));
        tags = tags.filter((t) => filterSet.has(t.name.toLowerCase()));
      }

      if (opts.filterUsernames && opts.filterUsernames.length > 0) {
        const filterSet = new Set(opts.filterUsernames.map((u) => u.toLowerCase()));
        if (!filterSet.has(userTags.user.username.toLowerCase())) continue;
      }

      if (tags.length > 0) {
        const key = this.makeEntryKey(userTags.user);
        entries[key] = tags;
        tagCount += tags.length;
      }
    }

    const manifest = await this.buildManifest({
      platform,
      entries,
      exportedBy: opts.exportedBy,
      description: opts.description,
    });

    const json = JSON.stringify(manifest, null, 2);
    const compact = await this.makeCompact(json);

    this.bus.emit('export:completed', {
      manifest,
      format: 'file',
    });

    this.log.info('Export completed', {
      userCount: Object.keys(entries).length,
      tagCount,
    });

    return ok({
      manifest,
      json,
      compact,
      userCount: Object.keys(entries).length,
      tagCount,
    });
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Parse and validate raw JSON (or compact XTAG: format).
   * Returns a preview without making any changes to storage.
   */
  async previewImport(
    raw: string,
  ): Promise<Result<ImportPreview, ValidationError | StorageError>> {
    const parseResult = await this.parseManifest(raw);
    if (!parseResult.ok) return parseResult;
    const manifest = parseResult.value;

    const checksumValid = await this.verifyChecksum(manifest);

    let tagsToAdd = 0;
    let tagsToMerge = 0;
    let tagsToSkip = 0;
    let conflicts = 0;

    for (const [key, incomingTags] of Object.entries(manifest.entries)) {
      const userId = this.parseEntryKey(key, manifest.platform);
      if (!userId) continue;

      const existingResult = await this.storage.getTagsForUser(userId);
      const existingTags = existingResult.ok ? [...existingResult.value] : [];

      for (const incoming of incomingTags) {
        const duplicate = existingTags.find(
          (e) => e.name.toLowerCase() === incoming.name.toLowerCase(),
        );
        if (!duplicate) {
          tagsToAdd++;
        } else {
          conflicts++;
          tagsToMerge++; // will be resolved based on strategy
        }
      }
      tagsToSkip += 0; // calculated after conflict strategy is chosen
    }

    return ok({
      usersAffected: Object.keys(manifest.entries).length,
      tagsToAdd,
      tagsToMerge,
      tagsToSkip,
      conflicts,
      checksumValid,
      manifest,
    });
  }

  /**
   * Apply an import after user confirms the preview.
   * Emits progress events suitable for a progress bar.
   */
  async applyImport(
    manifest: ExportManifest,
    options: ImportOptions,
  ): Promise<Result<{ added: number; merged: number; skipped: number }, StorageError | ValidationError>> {
    const entries = Object.entries(manifest.entries);
    this.bus.emit('import:started', {
      source: manifest.exportedBy ?? 'unknown',
      totalUsers: entries.length,
    });

    let added = 0;
    let merged = 0;
    let skipped = 0;
    const bulkEntries: Array<{ user: UserIdentifier; tags: Tag[] }> = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const [key, incomingTags] = entry;
      const userId = this.parseEntryKey(key, manifest.platform);
      if (!userId) {
        skipped += incomingTags.length;
        continue;
      }

      // Apply username/tag name filters
      if (options.filterUsernames.length > 0) {
        const filterSet = new Set(options.filterUsernames.map((u) => u.toLowerCase()));
        if (!filterSet.has(userId.username.toLowerCase())) {
          skipped += incomingTags.length;
          continue;
        }
      }

      const existingResult = await this.storage.getTagsForUser(userId);
      const existingTags = existingResult.ok ? [...existingResult.value] : [];

      const mergeResult: MergeResult = this.resolver.merge(
        existingTags,
        incomingTags.filter((t) => {
          if (options.filterTagNames.length === 0) return true;
          const filterSet = new Set(options.filterTagNames.map((n) => n.toLowerCase()));
          return filterSet.has(t.name.toLowerCase());
        }),
        options.conflictStrategy,
        manifest.platform,
      );

      added += mergeResult.added;
      merged += mergeResult.merged;
      skipped += mergeResult.skipped;

      const now = Date.now();
      bulkEntries.push({
        user: {
          ...userId,
          firstSeen: userId.firstSeen ?? now,
          lastSeen: now,
        },
        tags: mergeResult.finalTags,
      });

      this.bus.emit('import:progress', {
        processed: i + 1,
        total: entries.length,
      });
    }

    const bulkResult = await this.storage.bulkSave(bulkEntries);
    if (!bulkResult.ok) {
      this.bus.emit('import:failed', {
        source: manifest.exportedBy ?? 'unknown',
        message: bulkResult.error.message,
      });
      return bulkResult;
    }

    this.bus.emit('import:completed', { added, merged, skipped, conflicts: merged });
    this.log.info('Import completed', { added, merged, skipped });

    return ok({ added, merged, skipped });
  }

  // ── Parsing Helpers ───────────────────────────────────────────────────────

  private async parseManifest(
    raw: string,
  ): Promise<Result<ExportManifest, ValidationError>> {
    // Handle compact XTAG: format
    let jsonStr = raw.trim();
    if (jsonStr.startsWith(COMPACT_EXPORT_PREFIX)) {
      const base64 = jsonStr.slice(COMPACT_EXPORT_PREFIX.length);
      try {
        jsonStr = atob(base64);
      } catch {
        return err({
          type: 'IMPORT_PARSE_FAILED',
          message: 'Failed to decode compact XTAG format',
          raw: raw.slice(0, 100),
        });
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return err({
        type: 'IMPORT_PARSE_FAILED',
        message: 'Invalid JSON in import data',
        raw: raw.slice(0, 100),
      });
    }

    const zodResult = ExportManifestSchema.safeParse(parsed);
    if (!zodResult.success) {
      const issue = zodResult.error.issues[0];
      return err({
        type: 'IMPORT_VALIDATION_FAILED',
        message: `Import validation failed: ${issue?.message ?? 'unknown'}`,
        field: issue?.path.join('.') ?? 'root',
        expected: 'valid ExportManifest',
        received: typeof parsed,
      });
    }

    if (zodResult.data.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return err({
        type: 'IMPORT_SCHEMA_TOO_NEW',
        message: `This export was created with a newer version of XTagger (schema v${zodResult.data.schemaVersion}). Please update the extension.`,
        fileVersion: zodResult.data.schemaVersion,
        maxSupported: CURRENT_SCHEMA_VERSION,
      });
    }

    return ok(zodResult.data as ExportManifest);
  }

  private async buildManifest(opts: {
    platform: string;
    entries: Record<string, Tag[]>;
    exportedBy?: string;
    description?: string;
  }): Promise<ExportManifest> {
    const checksum = await this.computeChecksum(opts.entries);
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: opts.exportedBy,
      description: opts.description,
      platform: opts.platform,
      checksum,
      entries: opts.entries,
    };
  }

  private async computeChecksum(entries: Record<string, Tag[]>): Promise<string> {
    // Sort keys for deterministic output
    const sorted = Object.keys(entries)
      .sort()
      .reduce<Record<string, Tag[]>>((acc, k) => {
        acc[k] = entries[k] ?? [];
        return acc;
      }, {});
    const data = new TextEncoder().encode(JSON.stringify(sorted));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async verifyChecksum(manifest: ExportManifest): Promise<boolean> {
    const computed = await this.computeChecksum(
      manifest.entries as Record<string, Tag[]>,
    );
    return computed === manifest.checksum;
  }

  private async makeCompact(json: string): Promise<string> {
    return COMPACT_EXPORT_PREFIX + btoa(json);
  }

  private makeEntryKey(user: UserIdentifier): string {
    return `${user.platform}:${user.username}`;
  }

  private parseEntryKey(key: string, platform: string): UserIdentifier | null {
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) return null;
    const keyPlatform = key.slice(0, colonIdx);
    const username = key.slice(colonIdx + 1);
    if (!username) return null;
    const now = Date.now();
    return {
      platform: keyPlatform || platform,
      username,
      firstSeen: now,
      lastSeen: now,
    };
  }
}
