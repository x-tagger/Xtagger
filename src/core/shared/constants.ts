/**
 * @module constants
 * @layer Core / Shared
 * @description All magic values in one place. Never hardcode these inline.
 */

// ─── Schema ───────────────────────────────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1;
export const MIN_SUPPORTED_IMPORT_VERSION = 1;

// ─── Storage Keys ─────────────────────────────────────────────────────────────

export const DB_NAME = 'xtagger_db';
export const DB_VERSION = 1;
export const STORE_USERS = 'users';
export const STORE_TAGS = 'tags';
export const STORE_META = 'meta';
export const META_KEY_SCHEMA_VERSION = 'schemaVersion';
export const META_KEY_SELECTOR_CONFIG_VERSION = 'selectorConfigVersion';
export const META_KEY_SETTINGS = 'settings';

// ─── Tag Constraints ──────────────────────────────────────────────────────────

export const TAG_NAME_MAX_LENGTH = 50;
export const TAG_NOTES_MAX_LENGTH = 500;
export const TAG_PALETTE_SIZE = 16;
export const TAG_PALETTE_EXTENDED_SIZE = 32;
export const TAG_COLOR_MIN_INDEX = 0;
export const TAG_COLOR_MAX_INDEX = TAG_PALETTE_EXTENDED_SIZE - 1;

// ─── Export Format ────────────────────────────────────────────────────────────

export const EXPORT_FILE_EXTENSION = '.xtagger.json';
export const COMPACT_EXPORT_PREFIX = 'XTAG:';

// ─── Performance Budgets ─────────────────────────────────────────────────────

export const MUTATION_DEBOUNCE_MS = 100;
export const MAX_ELEMENTS_PER_FRAME = 20;
export const TAG_LOOKUP_TARGET_MS = 5;
export const POPUP_OPEN_TARGET_MS = 200;

// ─── Soft Delete ─────────────────────────────────────────────────────────────

/** Tags soft-deleted longer than this are eligible for hard purge */
export const SOFT_DELETE_PURGE_DAYS = 30;

// ─── Platforms ───────────────────────────────────────────────────────────────

export const PLATFORM_X = 'x.com' as const;
export const PLATFORM_BSKY = 'bsky.app' as const;
export type PlatformId = typeof PLATFORM_X | typeof PLATFORM_BSKY | string;
