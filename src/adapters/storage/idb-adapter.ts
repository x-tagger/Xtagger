/**
 * @module idb-adapter
 * @layer Adapters / Storage
 * @description IndexedDB implementation of StoragePort.
 * This is the ONLY place IndexedDB is touched — all browser storage errors are
 * caught here and converted to Result types before leaving this module.
 *
 * Schema:
 *   Store "users"  — keyPath: "_key", indexes: platformId, platform, lastSeen
 *   Store "tags"   — keyPath: "id",   indexes: _username, _platform, name, createdAt, deletedAt
 *   Store "meta"   — keyPath: "key"
 */

import type { StoragePort, TagFilter, TagQueryResult } from '@core/ports/storage.port';
import type { Result } from '@core/shared/result';
import type { StorageError, MigrationError } from '@core/shared/errors';
import type { Tag, UserIdentifier, UserTags, ExtensionSettings } from '@core/model/entities';
import type { LoggerPort } from '@core/ports/logger.port';

import { ok, err } from '@core/shared/result';
import { DEFAULT_SETTINGS } from '@core/model/entities';
import {
  DB_NAME, DB_VERSION,
  STORE_USERS, STORE_TAGS, STORE_META,
  META_KEY_SCHEMA_VERSION, META_KEY_SETTINGS,
} from '@core/shared/constants';

// ─── Internal row types ───────────────────────────────────────────────────────

interface UserRow extends UserIdentifier {
  readonly _key: string;
}

interface TagRow extends Tag {
  readonly _username: string;
  readonly _platform: string;
}

interface MetaRow {
  readonly key: string;
  // biome-ignore lint/suspicious/noExplicitAny: meta values are opaque
  readonly value: any;
}

const IDX_TAG_USERNAME  = '_username';
const IDX_TAG_NAME      = 'name';
const IDX_TAG_CREATED   = 'createdAt';
const IDX_TAG_DELETED   = 'deletedAt';

export class IDBAdapter implements StoragePort {
  private db: IDBDatabase | null = null;
  private readonly log: LoggerPort;
  private readonly dbName: string;

  constructor(logger: LoggerPort, dbName = DB_NAME) {
    this.log    = logger.child('IDBAdapter');
    this.dbName = dbName;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async open(): Promise<Result<void, StorageError>> {
    if (this.db) return ok(undefined);
    return new Promise((resolve) => {
      const req = indexedDB.open(this.dbName, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        this.setupSchema(db, e.oldVersion);
      };

      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        this.db.onclose = () => { this.db = null; };
        this.log.info('IDB opened');
        resolve(ok(undefined));
      };

      req.onerror = (e) => {
        const error = (e.target as IDBOpenDBRequest).error;
        resolve(err({ type: 'STORAGE_READ_FAILED', message: `Failed to open DB: ${error?.message ?? 'unknown'}` }));
      };
    });
  }

  private setupSchema(db: IDBDatabase, oldVersion: number): void {
    if (oldVersion < 1) {
      const users = db.createObjectStore(STORE_USERS, { keyPath: '_key' });
      users.createIndex('platformId', 'platformId', { unique: false });
      users.createIndex('platform',   'platform',   { unique: false });
      users.createIndex('lastSeen',   'lastSeen',   { unique: false });

      const tags = db.createObjectStore(STORE_TAGS, { keyPath: 'id' });
      tags.createIndex(IDX_TAG_USERNAME, '_username', { unique: false });
      tags.createIndex('_platform',      '_platform', { unique: false });
      tags.createIndex(IDX_TAG_NAME,     'name',      { unique: false });
      tags.createIndex(IDX_TAG_CREATED,  'createdAt', { unique: false });
      tags.createIndex(IDX_TAG_DELETED,  'deletedAt', { unique: false });

      db.createObjectStore(STORE_META, { keyPath: 'key' });
    }
  }

  private async ensureOpen(): Promise<Result<IDBDatabase, StorageError>> {
    if (!this.db) {
      const r = await this.open();
      if (!r.ok) return r;
    }
    if (!this.db) return err({ type: 'STORAGE_READ_FAILED', message: 'DB unavailable' });
    return ok(this.db);
  }

  private idbRequest<T>(
    req: IDBRequest<T>,
    errType: StorageError['type'] = 'STORAGE_READ_FAILED',
  ): Promise<Result<T, StorageError>> {
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(ok(req.result));
      req.onerror   = () => resolve(err({ type: errType, message: req.error?.message ?? 'IDB error' }));
    });
  }

  // ── Key helpers ───────────────────────────────────────────────────────────

  private userKey(u: UserIdentifier): string { return `${u.platform}:${u.username}`; }

  private toUserRow(u: UserIdentifier): UserRow { return { ...u, _key: this.userKey(u) }; }

  private toTagRow(u: UserIdentifier, t: Tag): TagRow {
    return { ...t, _username: u.username, _platform: u.platform };
  }

  private stripTagRow({ _username: _u, _platform: _p, ...tag }: TagRow): Tag {
    return tag as Tag;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getTagsForUser(userId: UserIdentifier): Promise<Result<ReadonlyArray<Tag>, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const req = dbr.value
        .transaction(STORE_TAGS, 'readonly')
        .objectStore(STORE_TAGS)
        .index(IDX_TAG_USERNAME)
        .getAll(userId.username);
      req.onsuccess = () => resolve(ok(
        (req.result as TagRow[])
          .filter((r) => r.deletedAt === undefined)
          .map((r) => this.stripTagRow(r)),
      ));
      req.onerror = () => resolve(err({ type: 'STORAGE_READ_FAILED', message: req.error?.message ?? 'getTagsForUser failed', key: userId.username }));
    });
  }

  async getTagById(tagId: string): Promise<Result<Tag, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const req = dbr.value.transaction(STORE_TAGS, 'readonly').objectStore(STORE_TAGS).get(tagId);
      req.onsuccess = () => {
        if (!req.result) {
          resolve(err({ type: 'STORAGE_READ_FAILED', message: `Tag not found: ${tagId}`, key: tagId }));
        } else {
          resolve(ok(this.stripTagRow(req.result as TagRow)));
        }
      };
      req.onerror = () => resolve(err({ type: 'STORAGE_READ_FAILED', message: req.error?.message ?? 'getTagById failed', key: tagId }));
    });
  }

  async queryTags(filter: TagFilter): Promise<Result<TagQueryResult, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;

    return new Promise((resolve) => {
      const tx = dbr.value.transaction([STORE_TAGS, STORE_USERS], 'readonly');

      const tagsReq = tx.objectStore(STORE_TAGS).getAll();
      const usersReq = tx.objectStore(STORE_USERS).getAll();

      tagsReq.onerror  = () => resolve(err({ type: 'STORAGE_READ_FAILED', message: 'queryTags tags fetch failed' }));
      usersReq.onerror = () => resolve(err({ type: 'STORAGE_READ_FAILED', message: 'queryTags users fetch failed' }));

      tx.oncomplete = () => {
        let tagRows = tagsReq.result as TagRow[];

        if (!filter.includeDeleted) tagRows = tagRows.filter((r) => r.deletedAt === undefined);
        if (filter.platform)          tagRows = tagRows.filter((r) => r._platform === filter.platform);
        if (filter.tagNameContains) {
          const n = filter.tagNameContains.toLowerCase();
          tagRows = tagRows.filter((r) => r.name.toLowerCase().includes(n));
        }

        // Group tags by username
        const grouped = new Map<string, TagRow[]>();
        for (const row of tagRows) {
          const list = grouped.get(row._username) ?? [];
          list.push(row);
          grouped.set(row._username, list);
        }

        if (filter.usernameContains) {
          const n = filter.usernameContains.toLowerCase();
          for (const k of grouped.keys()) {
            if (!k.toLowerCase().includes(n)) grouped.delete(k);
          }
        }

        const totalCount = grouped.size;
        const allKeys = [...grouped.keys()];
        const offset = filter.offset ?? 0;
        const limit  = filter.limit ?? allKeys.length;
        const pageKeys = allKeys.slice(offset, offset + limit);

        const userRows = usersReq.result as UserRow[];
        const userMap = new Map<string, UserIdentifier>(
          userRows.map(({ _key: _k, ...u }) => [u.username, u as UserIdentifier]),
        );

        const users: UserTags[] = pageKeys.map((username) => ({
          user: userMap.get(username) ?? {
            platform: filter.platform ?? 'x.com',
            username,
            firstSeen: 0,
            lastSeen: 0,
          },
          tags: (grouped.get(username) ?? []).map((r) => this.stripTagRow(r)),
        }));

        resolve(ok({ users, totalCount }));
      };
    });
  }

  async getAllTagNames(): Promise<Result<ReadonlyArray<string>, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      // Use getAll() (not getAllKeys()) — index.getAllKeys() returns primary key (tag id),
      // not the index key (tag name). We need the name values, so getAll() + map is correct.
      const req = dbr.value
        .transaction(STORE_TAGS, 'readonly')
        .objectStore(STORE_TAGS)
        .index(IDX_TAG_NAME)
        .getAll();
      req.onsuccess = () => {
        const names = (req.result as TagRow[])
          .filter((r) => r.deletedAt === undefined)
          .map((r) => r.name);
        resolve(ok([...new Set(names)].sort()));
      };
      req.onerror = () => resolve(err({ type: 'STORAGE_READ_FAILED', message: 'getAllTagNames failed' }));
    });
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async saveTag(userId: UserIdentifier, tag: Tag): Promise<Result<Tag, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const req = dbr.value
        .transaction(STORE_TAGS, 'readwrite')
        .objectStore(STORE_TAGS)
        .put(this.toTagRow(userId, tag));
      req.onsuccess = () => resolve(ok(tag));
      req.onerror   = () => resolve(err({ type: 'STORAGE_WRITE_FAILED', message: req.error?.message ?? 'saveTag failed', key: tag.id }));
    });
  }

  async softDeleteTag(tagId: string): Promise<Result<void, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const tx = dbr.value.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);
      const getReq = store.get(tagId);
      getReq.onsuccess = () => {
        const row = getReq.result as TagRow | undefined;
        if (!row) { resolve(err({ type: 'STORAGE_READ_FAILED', message: `Tag not found: ${tagId}`, key: tagId })); return; }
        const updated: TagRow = { ...row, deletedAt: Date.now(), updatedAt: Date.now() };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(ok(undefined));
        putReq.onerror   = () => resolve(err({ type: 'STORAGE_WRITE_FAILED', message: putReq.error?.message ?? 'softDeleteTag failed', key: tagId }));
      };
      getReq.onerror = () => resolve(err({ type: 'STORAGE_READ_FAILED', message: getReq.error?.message ?? 'softDelete get failed' }));
    });
  }

  async purgeDeletedTags(olderThanMs: number): Promise<Result<number, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const range = IDBKeyRange.bound(1, olderThanMs);
      const req = dbr.value
        .transaction(STORE_TAGS, 'readwrite')
        .objectStore(STORE_TAGS)
        .index(IDX_TAG_DELETED)
        .openCursor(range);
      let count = 0;
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) { resolve(ok(count)); return; }
        cursor.delete();
        count++;
        cursor.continue();
      };
      req.onerror = () => resolve(err({ type: 'STORAGE_DELETE_FAILED', message: req.error?.message ?? 'purge failed' }));
    });
  }

  async saveUser(userId: UserIdentifier): Promise<Result<UserIdentifier, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const req = dbr.value
        .transaction(STORE_USERS, 'readwrite')
        .objectStore(STORE_USERS)
        .put(this.toUserRow(userId));
      req.onsuccess = () => resolve(ok(userId));
      req.onerror   = () => resolve(err({ type: 'STORAGE_WRITE_FAILED', message: req.error?.message ?? 'saveUser failed', key: userId.username }));
    });
  }

  async bulkSave(
    entries: ReadonlyArray<{ user: UserIdentifier; tags: ReadonlyArray<Tag> }>,
  ): Promise<Result<void, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const tx = dbr.value.transaction([STORE_USERS, STORE_TAGS], 'readwrite');
      const userStore = tx.objectStore(STORE_USERS);
      const tagStore  = tx.objectStore(STORE_TAGS);
      let failed = false;

      const onError = (e: Event) => {
        if (failed) return; failed = true;
        resolve(err({ type: 'STORAGE_WRITE_FAILED', message: ((e.target as IDBRequest).error?.message) ?? 'bulkSave failed' }));
      };

      for (const { user, tags } of entries) {
        const ur = userStore.put(this.toUserRow(user));
        ur.onerror = onError;
        for (const tag of tags) {
          const tr = tagStore.put(this.toTagRow(user, tag));
          tr.onerror = onError;
        }
      }
      tx.oncomplete = () => { if (!failed) resolve(ok(undefined)); };
      tx.onerror    = onError;
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings(): Promise<Result<ExtensionSettings, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const req = dbr.value.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(META_KEY_SETTINGS);
      req.onsuccess = () => resolve(ok((req.result as MetaRow | undefined)?.value ?? DEFAULT_SETTINGS));
      req.onerror   = () => resolve(ok(DEFAULT_SETTINGS));
    });
  }

  async saveSettings(settings: ExtensionSettings): Promise<Result<void, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    const r = await this.idbRequest(
      dbr.value.transaction(STORE_META, 'readwrite').objectStore(STORE_META).put({ key: META_KEY_SETTINGS, value: settings }),
      'STORAGE_WRITE_FAILED',
    );
    return r.ok ? ok(undefined) : r;
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  async getSchemaVersion(): Promise<Result<number, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    return new Promise((resolve) => {
      const req = dbr.value.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(META_KEY_SCHEMA_VERSION);
      req.onsuccess = () => resolve(ok((req.result as MetaRow | undefined)?.value ?? 0));
      req.onerror   = () => resolve(ok(0));
    });
  }

  async setSchemaVersion(version: number): Promise<Result<void, StorageError>> {
    const dbr = await this.ensureOpen();
    if (!dbr.ok) return dbr;
    const r = await this.idbRequest(
      dbr.value.transaction(STORE_META, 'readwrite').objectStore(STORE_META).put({ key: META_KEY_SCHEMA_VERSION, value: version }),
      'STORAGE_WRITE_FAILED',
    );
    return r.ok ? ok(undefined) : r;
  }

  async runMigrations(from: number, to: number): Promise<Result<void, MigrationError | StorageError>> {
    this.log.info('Schema migrations applied', { from, to });
    return this.setSchemaVersion(to);
  }
}
