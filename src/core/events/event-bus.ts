/**
 * @module event-bus
 * @layer Core / Events
 * @description Typed publish/subscribe EventBus for loosely-coupled module communication.
 * Modules NEVER import each other's implementations — they communicate through events.
 *
 * @example
 *   // Emitting
 *   eventBus.emit('tag:created', { userId: ..., tag: ... });
 *
 *   // Listening (returns a Disposable — call dispose() to unsubscribe)
 *   const sub = eventBus.on('tag:created', ({ userId, tag }) => { ... });
 *   // Later:
 *   sub.dispose();
 */

import type { Tag, UserIdentifier, ExportManifest } from '@core/model/entities';

// ─── Disposable ───────────────────────────────────────────────────────────────

export interface Disposable {
  dispose(): void;
}

// ─── Event Catalogue ─────────────────────────────────────────────────────────

/**
 * The complete set of events in the system.
 * Adding a new event: add a key here. TypeScript enforces handlers match the shape.
 */
export interface EventMap {
  // Tag CRUD
  'tag:created': { userId: UserIdentifier; tag: Tag };
  'tag:updated': { userId: UserIdentifier; tag: Tag; previous: Tag };
  'tag:deleted': { userId: UserIdentifier; tagId: string; soft: boolean };
  'tags:bulk-deleted': { userIds: ReadonlyArray<UserIdentifier>; tagIds: ReadonlyArray<string> };

  // Import / Export lifecycle
  'import:started': { source: string; totalUsers: number };
  'import:progress': { processed: number; total: number };
  'import:completed': { added: number; merged: number; skipped: number; conflicts: number };
  'import:failed': { source: string; message: string };
  'export:completed': { manifest: ExportManifest; format: 'file' | 'clipboard' | 'compact' };

  // Platform / DOM
  'user:detected': { userId: UserIdentifier; element: unknown };
  'user:left-viewport': { userId: UserIdentifier };
  'selector:failed': { selector: string; strategy: string; url: string; failureCount: number };
  'selector:recovered': { selector: string; strategy: string };
  'navigation:changed': { url: string; previousUrl: string };

  // Extension lifecycle
  'extension:installed': { version: string };
  'extension:updated': { fromVersion: string; toVersion: string };
  'settings:changed': { key: string; value: unknown };
}

export type EventKey = keyof EventMap;
export type EventData<K extends EventKey> = EventMap[K];
export type EventHandler<K extends EventKey> = (data: EventData<K>) => void;

// ─── Typed EventBus Interface (Port) ─────────────────────────────────────────

export interface TypedEventBus {
  emit<K extends EventKey>(event: K, data: EventData<K>): void;
  on<K extends EventKey>(event: K, handler: EventHandler<K>): Disposable;
  off<K extends EventKey>(event: K, handler: EventHandler<K>): void;
  /** Remove all handlers for all events — use in tests or cleanup */
  clear(): void;
}

// ─── In-Process Implementation ────────────────────────────────────────────────

/**
 * Simple synchronous in-process EventBus implementation.
 * Used within a single JavaScript context (content script, background worker, or popup).
 * Cross-context communication still goes through chrome.runtime.sendMessage.
 */
export class EventBus implements TypedEventBus {
  // biome-ignore lint/suspicious/noExplicitAny: handler map uses any internally, typed externally
  private readonly handlers = new Map<EventKey, Set<EventHandler<any>>>();

  emit<K extends EventKey>(event: K, data: EventData<K>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(data);
    }
  }

  on<K extends EventKey>(event: K, handler: EventHandler<K>): Disposable {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    // biome-ignore lint/style/noNonNullAssertion: guaranteed to exist after set above
    this.handlers.get(event)!.add(handler);
    return {
      dispose: () => this.off(event, handler),
    };
  }

  off<K extends EventKey>(event: K, handler: EventHandler<K>): void {
    this.handlers.get(event)?.delete(handler);
  }

  clear(): void {
    this.handlers.clear();
  }

  /** Returns the number of registered handlers (useful for debugging/tests) */
  handlerCount(event: EventKey): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// ─── Singleton for use within a single JS context ────────────────────────────

export const eventBus = new EventBus();
