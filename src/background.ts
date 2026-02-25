/**
 * @file background.ts
 * @layer Background Service Worker Entry Point
 * @description Manifest V3 service worker. Stateless — all state lives in IndexedDB.
 *
 * CRITICAL: MV3 service workers start and stop unpredictably.
 * - Every handler must work on cold start (no assumed in-memory state)
 * - IDB connection is re-established on each activation if needed
 * - No global mutable state outside of the wired service instances
 *
 * Wiring order:
 *   Logger → IDBAdapter → MigrationService → TagService → ImportExportService → MessageRouter
 */

import { IDBAdapter }        from '@adapters/storage/idb-adapter';
import { MigrationService }  from '@adapters/storage/migration-service';
import { MessageRouter }     from '@adapters/chrome/message-router';
import { TagService }        from '@core/services/tag-service';
import { ImportExportService } from '@core/services/import-export';
import { DefaultConflictResolver } from '@core/services/conflict-resolver';
import { EventBus }          from '@core/events/event-bus';
import { ConsoleLogger }     from '@shared/logger';
import { CURRENT_SCHEMA_VERSION } from '@core/shared/constants';

// ─── Instantiation ────────────────────────────────────────────────────────────
// All wiring happens at module level — runs once per service worker activation.

const logger   = new ConsoleLogger('BG', 'info');
const storage  = new IDBAdapter(logger);
const bus      = new EventBus();
const resolver = new DefaultConflictResolver();

const tagService     = new TagService(storage, bus, logger);
const importExport   = new ImportExportService(storage, bus, resolver, logger);
const router         = new MessageRouter(tagService, importExport, storage, logger);

// ─── Initialise DB and register message handlers ──────────────────────────────

async function initialise(): Promise<void> {
  const openResult = await storage.open();
  if (!openResult.ok) {
    logger.error('Failed to open IDB on startup', { error: openResult.error });
    // Don't crash — popup still needs to work for diagnostics
    return;
  }
  router.register();
  logger.info('Background ready', { version: chrome.runtime.getManifest().version });
}

// ─── Lifecycle Handlers ───────────────────────────────────────────────────────

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

  if (details.reason === 'install') {
    logger.info('Fresh install — schema initialised', { version: CURRENT_SCHEMA_VERSION });
    // Phase 4: open onboarding tab
    // chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }

  if (details.reason === 'update') {
    logger.info('Extension updated', {
      from: details.previousVersion,
      to: chrome.runtime.getManifest().version,
    });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  logger.info('Browser startup — service worker waking');
  const migrations = new MigrationService(storage, logger);
  await migrations.runPendingMigrations();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

initialise().catch((e: unknown) => {
  logger.error('Fatal error during background initialisation', { error: String(e) });
});

export {};
