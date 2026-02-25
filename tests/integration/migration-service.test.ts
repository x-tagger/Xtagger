/**
 * @file migration-service.test.ts
 * @description Integration tests for MigrationService.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBAdapter }       from '../../src/adapters/storage/idb-adapter';
import { MigrationService } from '../../src/adapters/storage/migration-service';
import { NoopLogger }       from '../../src/shared/logger';
import { CURRENT_SCHEMA_VERSION } from '../../src/core/shared/constants';

describe('MigrationService', () => {
  let storage: IDBAdapter;
  let migrations: MigrationService;

  beforeEach(async () => {
    storage    = new IDBAdapter(new NoopLogger());
    await storage.open();
    migrations = new MigrationService(storage, new NoopLogger());
  });

  it('runs pending migrations from version 0 to current', async () => {
    const r = await migrations.runPendingMigrations();
    expect(r.ok).toBe(true);

    const version = await storage.getSchemaVersion();
    expect(version.ok).toBe(true);
    if (version.ok) expect(version.value).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent — safe to run twice', async () => {
    await migrations.runPendingMigrations();
    const r2 = await migrations.runPendingMigrations();
    expect(r2.ok).toBe(true);
  });

  it('does nothing if schema is already current', async () => {
    await storage.setSchemaVersion(CURRENT_SCHEMA_VERSION);
    const r = await migrations.runPendingMigrations();
    expect(r.ok).toBe(true);

    const version = await storage.getSchemaVersion();
    if (version.ok) expect(version.value).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('returns error if stored version is newer than extension supports', async () => {
    await storage.setSchemaVersion(999);
    const r = await migrations.runPendingMigrations();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('SCHEMA_MIGRATION_FAILED');
  });
});
