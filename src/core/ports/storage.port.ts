/**
 * @module storage.port
 * @layer Core / Ports
 * @description The port interface that storage adapters must implement.
 * Core domain code ONLY uses this interface — never the concrete adapter.
 * Swapping IndexedDB for another storage engine requires zero core changes.
 */

import type { Result } from '@core/shared/result';
import type { StorageError, MigrationError } from '@core/shared/errors';
import type { Tag, UserIdentifier, UserTags, ExtensionSettings } from '@core/model/entities';

// ─── Query Types ──────────────────────────────────────────────────────────────

export interface TagFilter {
  /** Filter by platform */
  platform?: string;
  /** Filter by partial username match (case-insensitive) */
  usernameContains?: string;
  /** Filter by partial tag name match (case-insensitive) */
  tagNameContains?: string;
  /** If true, include soft-deleted tags; default false */
  includeDeleted?: boolean;
  /** Pagination */
  limit?: number;
  offset?: number;
}

export interface TagQueryResult {
  readonly users: ReadonlyArray<UserTags>;
  readonly totalCount: number;
}

// ─── Storage Port ─────────────────────────────────────────────────────────────

export interface StoragePort {
  // ── Tag reads ─────────────────────────────────────────────────────────────

  /** Fetch all active (non-deleted) tags for a specific user */
  getTagsForUser(userId: UserIdentifier): Promise<Result<ReadonlyArray<Tag>, StorageError>>;

  /** Fetch a single tag by its ID */
  getTagById(tagId: string): Promise<Result<Tag, StorageError>>;

  /** Search / filter across all tagged users */
  queryTags(filter: TagFilter): Promise<Result<TagQueryResult, StorageError>>;

  /** Return all unique tag names currently in use (for autocomplete) */
  getAllTagNames(): Promise<Result<ReadonlyArray<string>, StorageError>>;

  // ── Tag writes ────────────────────────────────────────────────────────────

  /** Persist a new or updated tag for a user. Upsert semantics. */
  saveTag(userId: UserIdentifier, tag: Tag): Promise<Result<Tag, StorageError>>;

  /** Soft-delete a tag (sets deletedAt). Does not remove from storage. */
  softDeleteTag(tagId: string): Promise<Result<void, StorageError>>;

  /** Hard-delete all soft-deleted tags older than the cutoff timestamp */
  purgeDeletedTags(olderThanMs: number): Promise<Result<number, StorageError>>;

  /** Upsert or insert a UserIdentifier record */
  saveUser(userId: UserIdentifier): Promise<Result<UserIdentifier, StorageError>>;

  // ── Bulk operations ───────────────────────────────────────────────────────

  /**
   * Bulk-upsert a collection of users and their tags.
   * Used during import. Should be wrapped in a transaction if supported.
   */
  bulkSave(
    entries: ReadonlyArray<{ user: UserIdentifier; tags: ReadonlyArray<Tag> }>,
  ): Promise<Result<void, StorageError>>;

  // ── Settings ──────────────────────────────────────────────────────────────

  getSettings(): Promise<Result<ExtensionSettings, StorageError>>;
  saveSettings(settings: ExtensionSettings): Promise<Result<void, StorageError>>;

  // ── Schema / Migrations ───────────────────────────────────────────────────

  getSchemaVersion(): Promise<Result<number, StorageError>>;
  setSchemaVersion(version: number): Promise<Result<void, StorageError>>;

  /**
   * Run pending migrations from `from` version to `to` version.
   * The adapter handles the mechanics; MigrationService provides the functions.
   */
  runMigrations(from: number, to: number): Promise<Result<void, MigrationError | StorageError>>;
}
