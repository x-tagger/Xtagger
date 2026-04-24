/**
 * @module errors
 * @layer Core / Shared
 * @description Discriminated union error type hierarchy for the entire application.
 * Every error has a machine-readable `type` and a human-readable `message`.
 * Adapters catch infrastructure exceptions and convert them into these types.
 */

// ─── Storage Errors ───────────────────────────────────────────────────────────

export type StorageError =
  | { readonly type: 'STORAGE_READ_FAILED'; readonly message: string; readonly key?: string }
  | { readonly type: 'STORAGE_WRITE_FAILED'; readonly message: string; readonly key?: string }
  | { readonly type: 'STORAGE_DELETE_FAILED'; readonly message: string; readonly key?: string }
  | { readonly type: 'STORAGE_SCHEMA_MISMATCH'; readonly message: string; readonly found: number; readonly expected: number };

// ─── Migration Errors ─────────────────────────────────────────────────────────

export type MigrationError =
  | {
      readonly type: 'SCHEMA_MIGRATION_FAILED';
      readonly message: string;
      readonly fromVersion: number;
      readonly toVersion: number;
    }
  | { readonly type: 'MIGRATION_NOT_FOUND'; readonly message: string; readonly version: number };

// ─── Validation / Import Errors ───────────────────────────────────────────────

export type ValidationError =
  | {
      readonly type: 'IMPORT_VALIDATION_FAILED';
      readonly message: string;
      readonly field: string;
      readonly expected: string;
      readonly received: string;
    }
  | { readonly type: 'IMPORT_CHECKSUM_MISMATCH'; readonly message: string; readonly expected: string; readonly received: string }
  | { readonly type: 'IMPORT_SCHEMA_TOO_NEW'; readonly message: string; readonly fileVersion: number; readonly maxSupported: number }
  | { readonly type: 'IMPORT_EMPTY'; readonly message: string }
  | { readonly type: 'IMPORT_PARSE_FAILED'; readonly message: string; readonly raw: string };

// ─── Tag Errors ───────────────────────────────────────────────────────────────

export type TagError =
  | { readonly type: 'TAG_NOT_FOUND'; readonly message: string; readonly tagId: string }
  | { readonly type: 'TAG_NAME_EMPTY'; readonly message: string }
  | { readonly type: 'TAG_NAME_TOO_LONG'; readonly message: string; readonly maxLength: number; readonly actual: number }
  | { readonly type: 'TAG_NOTES_TOO_LONG'; readonly message: string; readonly maxLength: number; readonly actual: number }
  | { readonly type: 'TAG_INVALID_COLOR'; readonly message: string; readonly colorIndex: number }
  | { readonly type: 'TAG_NAME_DUPLICATE'; readonly message: string; readonly name: string; readonly existingTagId: string };

// ─── User Errors ──────────────────────────────────────────────────────────────

export type UserError =
  | { readonly type: 'USER_NOT_FOUND'; readonly message: string; readonly username: string }
  | { readonly type: 'USER_INVALID_PLATFORM'; readonly message: string; readonly platform: string };

// ─── Platform / Selector Errors ───────────────────────────────────────────────

export type SelectorError =
  | { readonly type: 'SELECTOR_ALL_STRATEGIES_FAILED'; readonly message: string; readonly selector: string; readonly url: string }
  | { readonly type: 'SELECTOR_CONFIG_INVALID'; readonly message: string };

// ─── Message Bus Errors ───────────────────────────────────────────────────────

export type MessageError =
  | { readonly type: 'MESSAGE_TIMEOUT'; readonly message: string; readonly channel: string }
  | { readonly type: 'MESSAGE_NO_HANDLER'; readonly message: string; readonly channel: string }
  | { readonly type: 'MESSAGE_SERIALIZATION_FAILED'; readonly message: string };

// ─── Union of All Errors ─────────────────────────────────────────────────────

export type AppError =
  | StorageError
  | MigrationError
  | ValidationError
  | TagError
  | UserError
  | SelectorError
  | MessageError;

// ─── Helper Factories ─────────────────────────────────────────────────────────

export const storageReadFailed = (message: string, key?: string): StorageError => ({
  type: 'STORAGE_READ_FAILED',
  message,
  key,
});

export const tagNotFound = (tagId: string): TagError => ({
  type: 'TAG_NOT_FOUND',
  message: `Tag with id "${tagId}" not found`,
  tagId,
});

export const importValidationFailed = (
  field: string,
  expected: string,
  received: string,
): ValidationError => ({
  type: 'IMPORT_VALIDATION_FAILED',
  message: `Validation failed on field "${field}": expected ${expected}, received ${received}`,
  field,
  expected,
  received,
});

export const tagNameDuplicate = (name: string, existingTagId: string): TagError => ({
  type: 'TAG_NAME_DUPLICATE',
  message: `Tag "${name}" already exists`,
  name,
  existingTagId,
});
