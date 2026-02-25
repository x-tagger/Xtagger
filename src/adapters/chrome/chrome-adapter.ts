/**
 * @module chrome-adapter
 * @layer Adapters / Chrome
 * @description BrowserPort implementation for Chrome/Chromium (Manifest V3).
 * Wraps chrome.runtime messaging and lifecycle events.
 */

import type { BrowserPort, MessageHandler } from '@core/ports/browser.port';
import type { StoragePort } from '@core/ports/storage.port';
import type { Result } from '@core/shared/result';
import type { MessageError } from '@core/shared/errors';
import type { Disposable } from '@core/events/event-bus';

import { ok, err } from '@core/shared/result';

export class ChromeAdapter implements BrowserPort {
  constructor(private readonly storage: StoragePort) {}

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendMessage<TResponse>(
    channel: string,
    data: unknown,
  ): Promise<Result<TResponse, MessageError>> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ channel, payload: data }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(err({
              type: 'MESSAGE_NO_HANDLER',
              message: chrome.runtime.lastError.message ?? 'Runtime error',
              channel,
            }));
            return;
          }
          resolve(ok(response as TResponse));
        });
      } catch (e) {
        resolve(err({
          type: 'MESSAGE_SERIALIZATION_FAILED',
          message: String(e),
        }));
      }
    });
  }

  onMessage<TData, TResponse>(
    channel: string,
    handler: MessageHandler<TData, TResponse>,
  ): Disposable {
    const listener = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): boolean => {
      if (
        typeof message !== 'object' ||
        message === null ||
        (message as { channel?: string }).channel !== channel
      ) {
        return false;
      }

      const payload = (message as { payload?: TData }).payload as TData;

      const result = handler(payload, _sender.id);

      if (result instanceof Promise) {
        result.then((r) => sendResponse(r));
        return true; // Keep channel open for async response
      }

      sendResponse(result);
      return false;
    };

    chrome.runtime.onMessage.addListener(listener);

    return {
      dispose: () => chrome.runtime.onMessage.removeListener(listener),
    };
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  getStorageAdapter(): StoragePort {
    return this.storage;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onInstalled(callback: (reason: 'install' | 'update', previousVersion?: string) => void): void {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install' || details.reason === 'update') {
        callback(details.reason, details.previousVersion);
      }
    });
  }

  onStartup(callback: () => void): void {
    chrome.runtime.onStartup.addListener(callback);
  }

  // ── Metadata ──────────────────────────────────────────────────────────────

  getVersion(): string {
    return chrome.runtime.getManifest().version;
  }
}
