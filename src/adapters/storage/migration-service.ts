/**
 * @module migration-service
 * @layer Adapters / Storage
 * @description Runs versioned schema migrations in sequence.
 * Called by the background service worker on install/update.
 *
 * To add a new migration:
 *   1. Create src/core/migrations/migration-NNN.ts
 *   2. Add it to MIGRATIONS array below in order
 *   3. Never modify a released migration
 */

import type { Result } from '@core/shared/result';
import type { MigrationError, StorageError } from '@core/shared/errors';
import type { StoragePort } from '@core/ports/storage.port';
import type { LoggerPort } from '@core/ports/logger.port';

import { ok, err } from '@core/shared/result';
import { CURRENT_SCHEMA_VERSION } from '@core/shared/constants';
import * as migration001 from '@core/migrations/migration-001';

// ─── Migration Registry ───────────────────────────────────────────────────────
// Add new migrations here IN ORDER. Never remove or reorder entries.

const MIGRATIONS = [
  migration001,
] as const;

// ─── Service ──────────────────────────────────────────────────────────────────

export class MigrationService {
  private readonly log: LoggerPort;

  constructor(
    private readonly storage: StoragePort,
    logger: LoggerPort,
  ) {
    this.log = logger.child('MigrationService');
  }

  /**
   * Run all pending migrations from the stored version up to CURRENT_SCHEMA_VERSION.
   * Idempotent — safe to call on every service worker startup.
   */
  async runPendingMigrations(): Promise<Result<void, MigrationError | StorageError>> {
    const versionResult = await this.storage.getSchemaVersion();
    if (!versionResult.ok) return versionResult;

    const currentVersion = versionResult.value;

    if (currentVersion === CURRENT_SCHEMA_VERSION) {
      this.log.debug('Schema up to date', { version: currentVersion });
      return ok(undefined);
    }

    if (currentVersion > CURRENT_SCHEMA_VERSION) {
      return err({
        type: 'SCHEMA_MIGRATION_FAILED',
        message: `Database schema version (${currentVersion}) is newer than the extension supports (${CURRENT_SCHEMA_VERSION}). Please update the extension.`,
        fromVersion: currentVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
      });
    }

    this.log.info('Running migrations', { from: currentVersion, to: CURRENT_SCHEMA_VERSION });

    for (const migration of MIGRATIONS) {
      if (migration.FROM_VERSION < currentVersion) continue;
      if (migration.FROM_VERSION >= CURRENT_SCHEMA_VERSION) break;

      this.log.info('Applying migration', { from: migration.FROM_VERSION, to: migration.TO_VERSION });

      // biome-ignore lint/suspicious/noExplicitAny: migration data is opaque
      const result = await migration.migrate(null as any);
      if (!result.ok) {
        return err({
          type: 'SCHEMA_MIGRATION_FAILED',
          message: `Migration ${migration.FROM_VERSION}→${migration.TO_VERSION} failed: ${result.error.message}`,
          fromVersion: migration.FROM_VERSION,
          toVersion: migration.TO_VERSION,
        });
      }

      this.log.info('Migration applied', { to: migration.TO_VERSION });
    }

    return this.storage.runMigrations(currentVersion, CURRENT_SCHEMA_VERSION);
  }
}
