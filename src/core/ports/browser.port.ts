/**
 * @module browser.port
 * @layer Core / Ports
 * @description Port interface for browser extension APIs (messaging, lifecycle, permissions).
 * Abstracts chrome.* and browser.* APIs behind a unified interface.
 */

import type { Result } from '@core/shared/result';
import type { MessageError } from '@core/shared/errors';
import type { StoragePort } from './storage.port';
import type { Disposable } from '@core/events/event-bus';

// ─── Message Types ────────────────────────────────────────────────────────────

export type MessageHandler<T = unknown, R = unknown> = (
  data: T,
  senderId?: string,
) => Promise<Result<R, MessageError>> | Result<R, MessageError>;

// ─── Browser Port ─────────────────────────────────────────────────────────────

export interface BrowserPort {
  // ── Messaging ─────────────────────────────────────────────────────────────

  /**
   * Send a message to the background service worker.
   * Content scripts and popup use this to communicate with the background.
   */
  sendMessage<TResponse>(channel: string, data: unknown): Promise<Result<TResponse, MessageError>>;

  /**
   * Register a handler for incoming messages on the given channel.
   * Background worker uses this to handle requests from content/popup.
   */
  onMessage<TData, TResponse>(
    channel: string,
    handler: MessageHandler<TData, TResponse>,
  ): Disposable;

  // ── Storage ───────────────────────────────────────────────────────────────

  /** Returns the storage adapter bound to this browser context */
  getStorageAdapter(): StoragePort;

  // ── Extension Lifecycle ───────────────────────────────────────────────────

  /** Fired when the extension is first installed */
  onInstalled(callback: (reason: 'install' | 'update', previousVersion?: string) => void): void;

  /** Fired when the browser starts up with the extension already installed */
  onStartup(callback: () => void): void;

  // ── Metadata ──────────────────────────────────────────────────────────────

  /** Returns the extension's current version string from the manifest */
  getVersion(): string;
}
