/**
 * @module migration-001
 * @layer Core / Migrations
 * @description Schema v0 → v1: Initial schema.
 */

import type { Result } from '@core/shared/result';
import type { MigrationError } from '@core/shared/errors';
import { ok } from '@core/shared/result';

export const FROM_VERSION = 0;
export const TO_VERSION = 1;

// biome-ignore lint/suspicious/noExplicitAny: migration data shape is unknown at v0
export async function migrate(_data: any): Promise<Result<void, MigrationError>> {
  return ok(undefined);
}
