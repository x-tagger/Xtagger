/**
 * @module tag-service
 * @layer Core / Services
 * @description Core tagging operations: create, read, update, soft-delete.
 * All operations return Result types — no exceptions thrown.
 * Emits events on the EventBus after successful mutations.
 *
 * Dependencies (injected via constructor):
 *   - StoragePort: persistence
 *   - TypedEventBus: event emission
 *   - LoggerPort: structured logging
 */

import { uuidv7 } from 'uuidv7';

import type { StoragePort } from '@core/ports/storage.port';
import type { LoggerPort } from '@core/ports/logger.port';
import type { TypedEventBus } from '@core/events/event-bus';
import type { Tag, UserIdentifier } from '@core/model/entities';
import type { StorageError, TagError, ValidationError } from '@core/shared/errors';
import type { CreateTagInput, UpdateTagInput } from '@core/model/schemas';
import type { Result } from '@core/shared/result';
import type { TagFilter, TagQueryResult } from '@core/ports/storage.port';

import { ok, err } from '@core/shared/result';
import { CreateTagInputSchema, UpdateTagInputSchema } from '@core/model/schemas';
import { TAG_NAME_MAX_LENGTH, TAG_NOTES_MAX_LENGTH, TAG_COLOR_MAX_INDEX } from '@core/shared/constants';

// ─── Service ──────────────────────────────────────────────────────────────────

export class TagService {
  private readonly log: LoggerPort;

  constructor(
    private readonly storage: StoragePort,
    private readonly bus: TypedEventBus,
    logger: LoggerPort,
  ) {
    this.log = logger.child('TagService');
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getTagsForUser(
    userId: UserIdentifier,
  ): Promise<Result<ReadonlyArray<Tag>, StorageError>> {
    this.log.debug('getTagsForUser', { username: userId.username });
    return this.storage.getTagsForUser(userId);
  }

  async queryTags(filter: TagFilter): Promise<Result<TagQueryResult, StorageError>> {
    return this.storage.queryTags(filter);
  }

  async getAllTagNames(): Promise<Result<ReadonlyArray<string>, StorageError>> {
    return this.storage.getAllTagNames();
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Create a new tag for a user.
   * Validates input, generates ID & timestamps, persists, emits event.
   */
  async createTag(
    userId: UserIdentifier,
    input: CreateTagInput,
  ): Promise<Result<Tag, TagError | ValidationError | StorageError>> {
    const parseResult = CreateTagInputSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return err({
        type: 'IMPORT_VALIDATION_FAILED',
        message: issue?.message ?? 'Invalid tag input',
        field: issue?.path.join('.') ?? 'unknown',
        expected: 'valid tag input',
        received: JSON.stringify(input),
      });
    }

    const now = Date.now();
    const tag: Tag = {
      id: uuidv7(),
      name: parseResult.data.name,
      colorIndex: parseResult.data.colorIndex,
      notes: parseResult.data.notes,
      source: { type: 'local' },
      createdAt: now,
      updatedAt: now,
    };

    const saveResult = await this.storage.saveTag(userId, tag);
    if (!saveResult.ok) return saveResult;

    // Update user's lastSeen
    await this.storage.saveUser({ ...userId, lastSeen: now });

    this.bus.emit('tag:created', { userId, tag: saveResult.value });
    this.log.info('Tag created', { tagId: tag.id, username: userId.username, name: tag.name });

    return saveResult;
  }

  /**
   * Update an existing tag.
   * Only provided fields are changed; updatedAt is always refreshed.
   */
  async updateTag(
    userId: UserIdentifier,
    input: UpdateTagInput,
  ): Promise<Result<Tag, TagError | ValidationError | StorageError>> {
    const parseResult = UpdateTagInputSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return err({
        type: 'IMPORT_VALIDATION_FAILED',
        message: issue?.message ?? 'Invalid update input',
        field: issue?.path.join('.') ?? 'unknown',
        expected: 'valid update input',
        received: JSON.stringify(input),
      });
    }

    const existingResult = await this.storage.getTagById(input.id);
    if (!existingResult.ok) return existingResult;
    const previous = existingResult.value;

    const updated: Tag = {
      ...previous,
      ...(parseResult.data.name !== undefined && { name: parseResult.data.name }),
      ...(parseResult.data.colorIndex !== undefined && { colorIndex: parseResult.data.colorIndex }),
      ...(parseResult.data.notes !== undefined && { notes: parseResult.data.notes }),
      updatedAt: Date.now(),
    };

    const saveResult = await this.storage.saveTag(userId, updated);
    if (!saveResult.ok) return saveResult;

    this.bus.emit('tag:updated', { userId, tag: saveResult.value, previous });
    this.log.info('Tag updated', { tagId: input.id });

    return saveResult;
  }

  /**
   * Soft-delete a tag. It remains in storage with `deletedAt` set.
   * The tag will not appear in normal queries.
   */
  async deleteTag(
    userId: UserIdentifier,
    tagId: string,
  ): Promise<Result<void, TagError | StorageError>> {
    const result = await this.storage.softDeleteTag(tagId);
    if (!result.ok) return result;

    this.bus.emit('tag:deleted', { userId, tagId, soft: true });
    this.log.info('Tag deleted', { tagId, username: userId.username });

    return result;
  }

  // ── Validation Helpers ────────────────────────────────────────────────────

  validateTagName(name: string): Result<string, TagError> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return err({ type: 'TAG_NAME_EMPTY', message: 'Tag name cannot be empty' });
    }
    if (trimmed.length > TAG_NAME_MAX_LENGTH) {
      return err({
        type: 'TAG_NAME_TOO_LONG',
        message: `Tag name must be ${TAG_NAME_MAX_LENGTH} characters or fewer`,
        maxLength: TAG_NAME_MAX_LENGTH,
        actual: trimmed.length,
      });
    }
    return ok(trimmed);
  }

  validateTagNotes(notes: string): Result<string | undefined, TagError> {
    if (notes.length > TAG_NOTES_MAX_LENGTH) {
      return err({
        type: 'TAG_NOTES_TOO_LONG',
        message: `Notes must be ${TAG_NOTES_MAX_LENGTH} characters or fewer`,
        maxLength: TAG_NOTES_MAX_LENGTH,
        actual: notes.length,
      });
    }
    return ok(notes.length === 0 ? undefined : notes);
  }

  validateColorIndex(index: number): Result<number, TagError> {
    if (!Number.isInteger(index) || index < 0 || index > TAG_COLOR_MAX_INDEX) {
      return err({
        type: 'TAG_INVALID_COLOR',
        message: `Color index must be an integer between 0 and ${TAG_COLOR_MAX_INDEX}`,
        colorIndex: index,
      });
    }
    return ok(index);
  }
}
