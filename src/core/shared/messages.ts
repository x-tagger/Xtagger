/**
 * @module messages
 * @layer Shared (cross-cutting)
 * @description Typed message protocol between content scripts, popup, and background worker.
 *
 * Every chrome.runtime.sendMessage call MUST use these types.
 * The background routes messages by `channel` field.
 *
 * Pattern: Request/Response pairs. Channel names match "domain:action" format.
 *
 * Usage (content script → background):
 *   const result = await sendMessage<GetTagsResponse>({
 *     channel: 'tags:get-for-user',
 *     payload: { platform: 'x.com', username: 'someuser' }
 *   });
 */

import type { Tag, UserIdentifier, ExtensionSettings, ExportManifest } from '@core/model/entities';
import type { ImportOptions } from '@core/model/schemas';
import type { AppError } from '@core/shared/errors';

// ─── Base envelope ────────────────────────────────────────────────────────────

export interface MessageEnvelope<TPayload = unknown> {
  readonly channel: MessageChannel;
  readonly payload: TPayload;
}

export interface MessageResponse<TData = unknown> {
  readonly ok: boolean;
  readonly data?: TData;
  readonly error?: AppError;
}

// ─── Channel catalogue ────────────────────────────────────────────────────────

export type MessageChannel =
  | 'tags:get-for-user'
  | 'tags:create'
  | 'tags:update'
  | 'tags:delete'
  | 'tags:get-all-names'
  | 'tags:query'
  | 'import:preview'
  | 'import:apply'
  | 'export:all'
  | 'export:collection'
  | 'export:filtered'
  | 'settings:get'
  | 'settings:save'
  | 'extension:ping';

// ─── Per-channel request/response types ──────────────────────────────────────

// tags:get-for-user
export interface GetTagsForUserRequest {
  readonly platform: string;
  readonly username: string;
}
export type GetTagsForUserResponse = ReadonlyArray<Tag>;

// tags:create
export interface CreateTagRequest {
  readonly userId: UserIdentifier;
  readonly name: string;
  readonly colorIndex: number;
  readonly notes?: string;
}
export type CreateTagResponse = Tag;

// tags:update
export interface UpdateTagRequest {
  readonly userId: UserIdentifier;
  readonly tagId: string;
  readonly name?: string;
  readonly colorIndex?: number;
  readonly notes?: string;
}
export type UpdateTagResponse = Tag;

// tags:delete
export interface DeleteTagRequest {
  readonly userId: UserIdentifier;
  readonly tagId: string;
}
export type DeleteTagResponse = void;

// tags:get-all-names
export type GetAllTagNamesResponse = ReadonlyArray<string>;

// tags:query
export interface QueryTagsRequest {
  readonly platform?: string;
  readonly usernameContains?: string;
  readonly tagNameContains?: string;
  readonly limit?: number;
  readonly offset?: number;
}
export interface QueryTagsResponse {
  readonly users: ReadonlyArray<{ user: UserIdentifier; tags: ReadonlyArray<Tag> }>;
  readonly totalCount: number;
}

// import:preview
export interface ImportPreviewRequest {
  readonly raw: string; // JSON or XTAG: compact format
}
export interface ImportPreviewResponse {
  readonly usersAffected: number;
  readonly tagsToAdd: number;
  readonly conflicts: number;
  readonly checksumValid: boolean;
  readonly manifest: ExportManifest;
}

// import:apply
export interface ImportApplyRequest {
  readonly manifest: ExportManifest;
  readonly options: ImportOptions;
}
export interface ImportApplyResponse {
  readonly added: number;
  readonly merged: number;
  readonly skipped: number;
}

// export:all
export interface ExportAllRequest {
  readonly exportedBy?: string;
  readonly description?: string;
  readonly filterUsernames?: ReadonlyArray<string>;
  readonly filterTagNames?: ReadonlyArray<string>;
}
export interface ExportAllResponse {
  readonly json: string;
  readonly compact: string;
  readonly userCount: number;
  readonly tagCount: number;
}

// export:collection
export interface ExportCollectionRequest {
  readonly name: string;
  readonly description?: string;
  readonly exportedBy?: string;
  /** Include users tagged with ANY of these (required, at least one) */
  readonly includeAnyTags: ReadonlyArray<string>;
  /** Also require ALL of these tags on the same user */
  readonly includeAllTags: ReadonlyArray<string>;
  /** Exclude users who have ANY of these tags */
  readonly excludeTags: ReadonlyArray<string>;
}
export interface ExportCollectionResponse {
  readonly json: string;
  readonly compact: string;
  readonly userCount: number;
  readonly tagCount: number;
  readonly collectionName: string;
}

// tags:get-all-names — extended to return name+count
export interface TagNameCount {
  readonly name: string;
  readonly count: number;
}
export type GetAllTagNamesWithCountsResponse = ReadonlyArray<TagNameCount>;

// settings:get / settings:save
export type GetSettingsResponse = ExtensionSettings;
export type SaveSettingsRequest = ExtensionSettings;

// extension:ping
export interface PingResponse {
  readonly version: string;
  readonly schemaVersion: number;
}

// ─── Message helper (typed send) ─────────────────────────────────────────────

/**
 * Send a typed message to the background worker.
 * Wraps chrome.runtime.sendMessage with proper error handling.
 */
export async function sendMessage<TResponse>(
  envelope: MessageEnvelope,
): Promise<MessageResponse<TResponse>> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(envelope, (response: MessageResponse<TResponse> | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: {
              type: 'MESSAGE_NO_HANDLER',
              message: chrome.runtime.lastError.message ?? 'Runtime error',
              channel: envelope.channel,
            },
          });
          return;
        }
        if (!response) {
          resolve({ ok: false, error: { type: 'MESSAGE_NO_HANDLER', message: 'No response from background', channel: envelope.channel } });
          return;
        }
        resolve(response);
      });
    } catch (e) {
      resolve({
        ok: false,
        error: {
          type: 'MESSAGE_SERIALIZATION_FAILED',
          message: String(e),
        },
      });
    }
  });
}
