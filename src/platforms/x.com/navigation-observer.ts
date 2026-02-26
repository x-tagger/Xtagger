/**
 * @module navigation-observer
 * @layer Platforms / X.com
 * @description Detects SPA navigation in X.com's React app.
 *
 * X.com uses React Router's history.pushState / replaceState for all navigation
 * rather than full page reloads. We monkey-patch both methods to fire a custom
 * DOM event ('xtagger:navigation') that our observers listen for.
 *
 * History API patching is idempotent: the guard flag lives on `window` so
 * multiple NavigationObserver instances across tests or reinitialisation never
 * double-wrap the methods.
 *
 * Disposal: calling sub.dispose() (returned by observe()) removes the specific
 * callback listeners. The history patch itself is not removed — it's lightweight
 * and removal would require reference-counting or global coordination.
 */

import { EventBus }   from '@core/events/event-bus';
import type { LoggerPort } from '@core/ports/logger.port';
import type { Disposable } from '@core/events/event-bus';

/** Flag key on window — prevents double-patching across multiple instances. */
const PATCH_KEY = '_xtaggerHistoryPatched';

/** Saved originals — allows test teardown to restore the history API. */
const ORIGINALS_KEY = '_xtaggerHistoryOriginals';

type HistoryOriginals = {
  pushState: typeof window.history.pushState;
  replaceState: typeof window.history.replaceState;
};

export class NavigationObserver {
  private currentUrl: string;
  private readonly bus: EventBus;
  private readonly log: LoggerPort;

  constructor(bus: EventBus, logger: LoggerPort) {
    this.bus        = bus;
    this.log        = logger.child('NavigationObserver');
    this.currentUrl = window.location.href;
  }

  /**
   * Begin observing navigation events.
   * Returns a Disposable — call dispose() to unsubscribe this specific callback.
   */
  observe(callback: (newUrl: string, previousUrl: string) => void): Disposable {
    // Patch once globally — safe to call multiple times
    this.ensurePatched();

    const navListener = (e: Event): void => {
      const detail = (e as CustomEvent<{ newUrl: string; previousUrl: string }>).detail;
      // Update our own currentUrl tracker
      this.currentUrl = detail.newUrl;
      callback(detail.newUrl, detail.previousUrl);
    };

    const popstateListener = (): void => {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        const previousUrl = this.currentUrl;
        this.currentUrl = newUrl;
        callback(newUrl, previousUrl);
      }
    };

    window.addEventListener('xtagger:navigation', navListener);
    window.addEventListener('popstate', popstateListener);
    this.log.debug('Navigation observer started');

    return {
      dispose: () => {
        window.removeEventListener('xtagger:navigation', navListener);
        window.removeEventListener('popstate', popstateListener);
        this.log.debug('Navigation observer disposed');
      },
    };
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  // ── History API patching ──────────────────────────────────────────────────

  private ensurePatched(): void {
    const win = window as Window & { [PATCH_KEY]?: boolean; [ORIGINALS_KEY]?: HistoryOriginals };
    if (win[PATCH_KEY]) return;

    // Save originals so tests (and future restore() calls) can undo the patch
    win[ORIGINALS_KEY] = {
      pushState:    window.history.pushState.bind(window.history),
      replaceState: window.history.replaceState.bind(window.history),
    };

    const fire = (newUrl: string, previousUrl: string): void => {
      if (newUrl === previousUrl) return;
      this.bus.emit('navigation:changed', { url: newUrl, previousUrl });
      window.dispatchEvent(new CustomEvent('xtagger:navigation', {
        detail: { newUrl, previousUrl },
      }));
      this.log.debug('Navigation detected', { newUrl, previousUrl });
    };

    const origPush    = win[ORIGINALS_KEY].pushState;
    const origReplace = win[ORIGINALS_KEY].replaceState;

    window.history.pushState = function(
      ...args: Parameters<typeof window.history.pushState>
    ): void {
      const prev = window.location.href;
      origPush(...args);
      fire(window.location.href, prev);
    };

    window.history.replaceState = function(
      ...args: Parameters<typeof window.history.replaceState>
    ): void {
      const prev = window.location.href;
      origReplace(...args);
      fire(window.location.href, prev);
    };

    win[PATCH_KEY] = true;
    this.log.debug('History API patched');
  }

  /**
   * Restore the original history methods and clear the patch guard.
   * Intended for use in tests only — not called in production.
   */
  static restoreForTesting(): void {
    const win = window as Window & { [PATCH_KEY]?: boolean; [ORIGINALS_KEY]?: HistoryOriginals };
    if (!win[PATCH_KEY] || !win[ORIGINALS_KEY]) return;
    window.history.pushState    = win[ORIGINALS_KEY].pushState;
    window.history.replaceState = win[ORIGINALS_KEY].replaceState;
    delete win[PATCH_KEY];
    delete win[ORIGINALS_KEY];
  }
}
