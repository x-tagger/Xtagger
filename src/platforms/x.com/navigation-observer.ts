/**
 * @module navigation-observer
 * @layer Platforms / X.com
 * @description Detects SPA navigation on X.com.
 *
 * X.com is a single-page app using the History API (pushState/replaceState).
 * Standard DOM events don't fire for these navigations, so we patch the History API
 * and also watch for popstate (browser back/forward).
 *
 * Emits 'navigation:changed' on the EventBus after each route change.
 *
 * Dependencies: TypedEventBus
 */

import type { TypedEventBus } from '@core/events/event-bus';
import type { Disposable } from '@core/events/event-bus';
import type { LoggerPort } from '@core/ports/logger.port';

// ─── NavigationObserver ───────────────────────────────────────────────────────

export class NavigationObserver {
  private currentUrl: string;
  private patched = false;
  private readonly disposables: Disposable[] = [];
  private readonly log: LoggerPort;

  constructor(
    private readonly bus: TypedEventBus,
    logger: LoggerPort,
  ) {
    this.currentUrl = window.location.href;
    this.log = logger.child('NavigationObserver');
  }

  /**
   * Begin observing navigation events.
   * Patches pushState/replaceState and listens for popstate.
   * Returns a Disposable to stop observing.
   */
  observe(callback: (newUrl: string, previousUrl: string) => void): Disposable {
    if (!this.patched) {
      this.patchHistoryApi();
      this.patched = true;
    }

    const handleNavigation = (newUrl: string, previousUrl: string) => {
      callback(newUrl, previousUrl);
    };

    // Listen to our custom event (fired by the patched History API)
    const navListener = (e: Event): void => {
      const detail = (e as CustomEvent<{ newUrl: string; previousUrl: string }>).detail;
      handleNavigation(detail.newUrl, detail.previousUrl);
    };

    window.addEventListener('xtagger:navigation', navListener);

    // Also catch browser back/forward (popstate)
    const popstateListener = (): void => {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        const previousUrl = this.currentUrl;
        this.currentUrl = newUrl;
        handleNavigation(newUrl, previousUrl);
      }
    };

    window.addEventListener('popstate', popstateListener);

    this.log.debug('Navigation observer started');

    return {
      dispose: () => {
        window.removeEventListener('xtagger:navigation', navListener);
        window.removeEventListener('popstate', popstateListener);
        this.log.debug('Navigation observer stopped');
      },
    };
  }

  // ── History API patching ──────────────────────────────────────────────────

  /**
   * Monkey-patches History.pushState and History.replaceState to fire
   * our custom 'xtagger:navigation' event. This is the standard approach
   * for SPA navigation detection in content scripts.
   *
   * The patch is applied once and is idempotent.
   */
  private patchHistoryApi(): void {
    const self = this;

    const originalPush    = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);

    history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      originalPush(data, unused, url);
      self.onUrlChange();
    };

    history.replaceState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      originalReplace(data, unused, url);
      self.onUrlChange();
    };

    this.log.debug('History API patched for SPA navigation detection');
  }

  private onUrlChange(): void {
    const newUrl = window.location.href;
    if (newUrl === this.currentUrl) return;

    const previousUrl = this.currentUrl;
    this.currentUrl = newUrl;

    this.log.debug('Navigation detected', { from: previousUrl, to: newUrl });
    this.bus.emit('navigation:changed', { url: newUrl, previousUrl });

    // Also dispatch a DOM event so our observe() callback can hear it
    window.dispatchEvent(
      new CustomEvent('xtagger:navigation', {
        detail: { newUrl, previousUrl },
      }),
    );
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }
}
