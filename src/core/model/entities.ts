/**
 * @module entities
 * @layer Core / Model
 * @description Core domain entity types. These are the shapes of all persisted data.
 * No browser APIs. No DOM. Pure TypeScript types.
 *
 * IDs are UUIDv7: time-sortable, globally unique, merge-safe.
 * Timestamps are UTC milliseconds (Date.now()) unless noted.
 */

import type { PlatformId } from '@core/shared/constants';

// ─── User Identity ────────────────────────────────────────────────────────────

/**
 * Represents a user account on a social media platform.
 *
 * NOTE: `username` is mutable on most platforms. Use `platformId` (when available)
 * as the stable lookup key. The extension surfaces "unresolved tags" in the popup
 * when a username no longer matches any live account.
 */
export interface UserIdentifier {
  /** The platform this user belongs to, e.g. "x.com" */
  readonly platform: PlatformId;
  /** @username handle — primary display key, mutable on most platforms */
  readonly username: string;
  /** Immutable platform-assigned user ID, if discoverable */
  readonly platformId?: string;
  /** Cached display name for offline/popup display */
  readonly displayName?: string;
  /** Cached avatar URL — may become stale, never relied upon for logic */
  readonly avatarUrl?: string;
  /** UTC ms — when this user was first tagged by the local user */
  readonly firstSeen: number;
  /** UTC ms — when a tag was last created/modified for this user */
  readonly lastSeen: number;
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

/** Describes where a tag originated */
export type TagSource =
  | { readonly type: 'local' }
  | { readonly type: 'imported'; readonly origin: string; readonly importedAt: number };

/**
 * A single tag applied to a user.
 * Tags are soft-deleted: a tag with `deletedAt` set is inactive but preserved for audit.
 */
export interface Tag {
  /** UUIDv7 — time-sortable, globally unique */
  readonly id: string;
  /** User-visible label — trimmed, 1–50 chars */
  readonly name: string;
  /** Index into the curated color palette (0–31) */
  readonly colorIndex: number;
  /** Optional free-text annotation, max 500 chars */
  readonly notes?: string;
  /** Where did this tag come from? */
  readonly source: TagSource;
  /** UTC ms */
  readonly createdAt: number;
  /** UTC ms */
  readonly updatedAt: number;
  /** UTC ms — if set, tag is soft-deleted and not shown in feed */
  readonly deletedAt?: number;
}

/**
 * Convenience type: a user bundled with their active (non-deleted) tags.
 * This is the primary read model for the UI.
 */
export interface UserTags {
  readonly user: UserIdentifier;
  /** Only tags where deletedAt === undefined */
  readonly tags: ReadonlyArray<Tag>;
}

// ─── Color Palette ────────────────────────────────────────────────────────────

/** A single entry in the curated color palette */
export interface PaletteColor {
  /** Display name, e.g. "Coral Red" */
  readonly name: string;
  /** Hex color for the pill/dot background */
  readonly hex: string;
  /** Hex color for text rendered on top of `hex` — ensures contrast */
  readonly textColor: string;
  /** True if this is in the base 16-color palette; false = extended only */
  readonly base: boolean;
}

// ─── Import / Export ──────────────────────────────────────────────────────────

/**
 * The top-level shape of an exported .xtagger.json file.
 * `entries` maps "platform:username" to an array of tags.
 */
export interface ExportManifest {
  readonly schemaVersion: number;
  /** ISO 8601 datetime string */
  readonly exportedAt: string;
  /** Optional human note from the exporter */
  readonly exportedBy?: string;
  /** Optional description of what this collection represents */
  readonly description?: string;
  /** Platform this collection was exported from */
  readonly platform: PlatformId;
  /** SHA-256 hex digest of the `entries` field (JSON-serialized, sorted keys) */
  readonly checksum: string;
  /**
   * Key format: `"platform:username"` e.g. `"x.com:elonmusk"`
   * Value: array of Tag objects (may include soft-deleted entries)
   */
  readonly entries: Readonly<Record<string, ReadonlyArray<Tag>>>;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type DisplayMode = 'compact' | 'pills' | 'full' | 'hidden';

export interface ExtensionSettings {
  readonly displayMode: DisplayMode;
  readonly theme: 'auto' | 'light' | 'dark';
  /** If true, show tag editor on hover; if false, require click */
  readonly hoverToEdit: boolean;
  /** Use extended 32-color palette */
  readonly extendedPalette: boolean;
  /** Per-surface display mode overrides */
  readonly surfaceOverrides: Readonly<Partial<Record<string, DisplayMode>>>;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  displayMode: 'compact',
  theme: 'auto',
  hoverToEdit: true,
  extendedPalette: false,
  surfaceOverrides: {},
} as const;
