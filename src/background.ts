/**
 * @file background.ts
 * @layer Background Service Worker Entry Point
 * @description Manifest V3 service worker. Stateless — all state lives in IndexedDB.
 *
 * Wiring order:
 *   Logger → IDBAdapter → MigrationService → TagService → ImportExportService
 *   → MessageRouter → ContextMenuManager
 */

import { IDBAdapter }          from '@adapters/storage/idb-adapter';
import { MigrationService }    from '@adapters/storage/migration-service';
import { MessageRouter }       from '@adapters/chrome/message-router';
import { ContextMenuManager }  from '@adapters/chrome/context-menu';
import { TagService }          from '@core/services/tag-service';
import { ImportExportService } from '@core/services/import-export';
import { DefaultConflictResolver } from '@core/services/conflict-resolver';
import { EventBus }            from '@core/events/event-bus';
import { ConsoleLogger }       from '@shared/logger';
import { CURRENT_SCHEMA_VERSION } from '@core/shared/constants';

// ─── Service instances ────────────────────────────────────────────────────────

const logger   = new ConsoleLogger('BG', 'info');
const storage  = new IDBAdapter(logger);
const bus      = new EventBus();
const resolver = new DefaultConflictResolver();

const tagService   = new TagService(storage, bus, logger);
const importExport = new ImportExportService(storage, bus, resolver, logger);
const router       = new MessageRouter(tagService, importExport, storage, logger);
const contextMenu  = new ContextMenuManager(logger);

// ─── Initialisation ───────────────────────────────────────────────────────────
//
// MV3 service workers must register chrome.runtime.onMessage synchronously
// during the script's initial top-level evaluation. If registration is gated
// behind an `await`, Chrome can dispatch the wakeup-causing message into the
// gap, the response port closes without a sendResponse, and the caller sees
// MESSAGE_NO_HANDLER. We therefore register the listener synchronously here
// and gate the actual dispatch behind an init promise the listener awaits.

const initPromise: Promise<boolean> = storage.open()
  .then((openResult) => {
    if (!openResult.ok) {
      logger.error('Failed to open IDB on startup', { error: openResult.error });
      return false;
    }
    logger.info('Background ready', { version: chrome.runtime.getManifest().version });
    return true;
  })
  .catch((e: unknown) => {
    logger.error('Fatal error during background initialisation', { error: String(e) });
    return false;
  });

router.register(initPromise);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info('onInstalled', { reason: details.reason, previousVersion: details.previousVersion });

  const openResult = await storage.open();
  if (!openResult.ok) {
    logger.error('Failed to open IDB on install', { error: openResult.error });
    return;
  }

  const migrations = new MigrationService(storage, logger);
  const migResult = await migrations.runPendingMigrations();
  if (!migResult.ok) {
    logger.error('Migration failed on install', { error: migResult.error });
    return;
  }

  // Register context menu on install/update
  contextMenu.register();

  if (details.reason === 'install') {
    logger.info('Fresh install — opening onboarding', { version: CURRENT_SCHEMA_VERSION });
    // Open onboarding tab on fresh install
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/ui/onboarding/index.html'),
    });
  }

  if (details.reason === 'update') {
    logger.info('Updated', { from: details.previousVersion, to: chrome.runtime.getManifest().version });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  logger.info('Browser startup');
  // Re-register context menus (cleared on browser restart in some Chromium builds)
  contextMenu.register();

  const migrations = new MigrationService(storage, logger);
  await migrations.runPendingMigrations();
});

// ─── Context menu handler ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  contextMenu.handleClick(info, tab);
});

export {};
