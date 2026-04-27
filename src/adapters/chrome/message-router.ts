/**
 * @module message-router
 * @layer Adapters / Chrome
 * @description Routes incoming chrome.runtime messages to the appropriate service handler.
 * Background service worker registers all handlers through this router.
 *
 * Each handler follows the pattern:
 *   1. Validate/cast payload
 *   2. Call service method
 *   3. Return MessageResponse<T>
 *
 * CRITICAL: MV3 service workers are stateless. Every handler must work assuming
 * it is the first thing to run after a cold start.
 */

import type { TagService } from '@core/services/tag-service';
import type { ImportExportService } from '@core/services/import-export';
import type { StoragePort } from '@core/ports/storage.port';
import type { LoggerPort } from '@core/ports/logger.port';
import type { MessageResponse } from '@shared/messages';
import type {
  GetTagsForUserRequest, CreateTagRequest, UpdateTagRequest,
  DeleteTagRequest, QueryTagsRequest, ImportPreviewRequest,
  ImportApplyRequest, ExportAllRequest, ExportCollectionRequest,
} from '@shared/messages';

import { ok } from '@core/shared/result';
import { ExtensionSettingsSchema } from '@core/model/schemas';
import { CURRENT_SCHEMA_VERSION } from '@core/shared/constants';

// ─── Router ───────────────────────────────────────────────────────────────────

export class MessageRouter {
  private readonly log: LoggerPort;

  constructor(
    private readonly tagService: TagService,
    private readonly importExport: ImportExportService,
    private readonly storage: StoragePort,
    logger: LoggerPort,
  ) {
    this.log = logger.child('MessageRouter');
  }

  /**
   * Register all message handlers with chrome.runtime.
   * MUST be called synchronously during the SW's top-level eval so the
   * listener is live by the time Chrome dispatches the wakeup message.
   * Real dispatch is gated behind initPromise — which resolves once IDB
   * is open — so a message that arrives mid-init still gets a response.
   */
  register(initPromise: Promise<boolean>): void {
    chrome.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse) => {
        if (typeof message !== 'object' || message === null) return false;
        const { channel, payload } = message as { channel?: string; payload?: unknown };
        if (!channel) return false;

        this.log.debug('Message received', { channel });

        initPromise
          .then((ready): MessageResponse | Promise<MessageResponse> => {
            if (!ready) {
              return {
                ok: false,
                error: { type: 'MESSAGE_NO_HANDLER', message: 'Background init failed (IDB open)', channel },
              };
            }
            return this.handle(channel, payload);
          })
          .then(sendResponse)
          .catch((e: unknown) => {
            this.log.error('Message handler threw', { channel, error: String(e) });
            sendResponse({ ok: false, error: { type: 'MESSAGE_NO_HANDLER', message: String(e), channel } });
          });

        return true; // Keep channel open for async response
      },
    );

    this.log.info('Message router registered');
  }

  // ── Route dispatch ────────────────────────────────────────────────────────

  private async handle(channel: string, payload: unknown): Promise<MessageResponse> {
    switch (channel) {
      case 'extension:ping':         return this.handlePing();
      case 'tags:get-for-user':      return this.handleGetTagsForUser(payload);
      case 'tags:create':            return this.handleCreateTag(payload);
      case 'tags:update':            return this.handleUpdateTag(payload);
      case 'tags:delete':            return this.handleDeleteTag(payload);
      case 'tags:get-all-names':     return this.handleGetAllTagNames();
      case 'tags:query':             return this.handleQueryTags(payload);
      case 'import:preview':         return this.handleImportPreview(payload);
      case 'import:apply':           return this.handleImportApply(payload);
      case 'export:all':             return this.handleExportAll(payload);
      case 'export:collection':       return this.handleExportCollection(payload);
      case 'settings:get':           return this.handleGetSettings();
      case 'settings:save':          return this.handleSaveSettings(payload);
      default:
        this.log.warn('Unknown channel', { channel });
        return { ok: false, error: { type: 'MESSAGE_NO_HANDLER', message: `Unknown channel: ${channel}`, channel } };
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private async handlePing(): Promise<MessageResponse> {
    const schemaResult = await this.storage.getSchemaVersion();
    return {
      ok: true,
      data: {
        version: chrome.runtime.getManifest().version,
        schemaVersion: schemaResult.ok ? schemaResult.value : CURRENT_SCHEMA_VERSION,
      },
    };
  }

  private async handleGetTagsForUser(payload: unknown): Promise<MessageResponse> {
    const { platform, username } = payload as GetTagsForUserRequest;
    const result = await this.tagService.getTagsForUser({
      platform, username, firstSeen: 0, lastSeen: 0,
    });
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleCreateTag(payload: unknown): Promise<MessageResponse> {
    const { userId, name, colorIndex, notes } = payload as CreateTagRequest;
    const result = await this.tagService.createTag(userId, { name, colorIndex, notes });
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleUpdateTag(payload: unknown): Promise<MessageResponse> {
    const { userId, tagId, name, colorIndex, notes } = payload as UpdateTagRequest;
    const result = await this.tagService.updateTag(userId, { id: tagId, name, colorIndex, notes });
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleDeleteTag(payload: unknown): Promise<MessageResponse> {
    const { userId, tagId } = payload as DeleteTagRequest;
    const result = await this.tagService.deleteTag(userId, tagId);
    return result.ok ? { ok: true, data: null } : { ok: false, error: result.error };
  }

  private async handleGetAllTagNames(): Promise<MessageResponse> {
    const result = await this.tagService.getAllTagNames();
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleQueryTags(payload: unknown): Promise<MessageResponse> {
    const filter = payload as QueryTagsRequest;
    const result = await this.tagService.queryTags(filter);
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleImportPreview(payload: unknown): Promise<MessageResponse> {
    const { raw } = payload as ImportPreviewRequest;
    const result = await this.importExport.previewImport(raw);
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleImportApply(payload: unknown): Promise<MessageResponse> {
    const { manifest, options } = payload as ImportApplyRequest;
    const result = await this.importExport.applyImport(manifest, options);
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleExportAll(payload: unknown): Promise<MessageResponse> {
    const opts = payload as ExportAllRequest;
    const result = await this.importExport.exportAll(opts);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      data: {
        json: result.value.json,
        compact: result.value.compact,
        userCount: result.value.userCount,
        tagCount: result.value.tagCount,
      },
    };
  }

  private async handleExportCollection(payload: unknown): Promise<MessageResponse> {
    const opts = payload as ExportCollectionRequest;
    const result = await this.importExport.exportCollection(opts);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      data: {
        json:           result.value.json,
        compact:        result.value.compact,
        userCount:      result.value.userCount,
        tagCount:       result.value.tagCount,
        collectionName: result.value.collectionName,
      },
    };
  }

  private async handleGetSettings(): Promise<MessageResponse> {
    const result = await this.storage.getSettings();
    return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
  }

  private async handleSaveSettings(payload: unknown): Promise<MessageResponse> {
    const parsed = ExtensionSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: { type: 'MESSAGE_SERIALIZATION_FAILED', message: 'Invalid settings payload' } };
    }
    const result = await this.storage.saveSettings(parsed.data);
    return result.ok ? { ok: true, data: null } : { ok: false, error: result.error };
  }
}
