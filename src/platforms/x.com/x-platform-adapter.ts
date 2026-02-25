/**
 * @module x-platform-adapter
 * @layer Platforms / X.com
 * @description PlatformPort implementation for X.com.
 * Wires SelectorEngine, UserDetector, NavigationObserver into the port interface.
 *
 * Dependencies: SelectorEngine, UserDetector, NavigationObserver
 */

import type { PlatformPort, UserDetection, InjectionTarget } from '@core/ports/platform.port';
import type { Disposable } from '@core/events/event-bus';
import type { TypedEventBus } from '@core/events/event-bus';
import type { LoggerPort } from '@core/ports/logger.port';

import { PLATFORM_X } from '@core/shared/constants';
import { MUTATION_DEBOUNCE_MS } from '@core/shared/constants';
import { SelectorEngine } from './selector-engine';
import { UserDetector } from './user-detector';
import { NavigationObserver } from './navigation-observer';

// ─── XPlatformAdapter ─────────────────────────────────────────────────────────

export class XPlatformAdapter implements PlatformPort {
  readonly platformId = PLATFORM_X;

  private readonly selectorEngine: SelectorEngine;
  private readonly userDetector: UserDetector;
  private readonly navigationObserver: NavigationObserver;
  private readonly log: LoggerPort;

  constructor(
    private readonly bus: TypedEventBus,
    logger: LoggerPort,
    selectorConfig: object,
  ) {
    this.log = logger.child('XPlatformAdapter');
    this.selectorEngine = new SelectorEngine(bus, logger);
    this.userDetector   = new UserDetector(this.selectorEngine, logger);
    this.navigationObserver = new NavigationObserver(bus, logger);

    // Load the bundled selector config
    // biome-ignore lint/suspicious/noExplicitAny: config is loaded from JSON
    this.selectorEngine.loadConfig(selectorConfig as any);
  }

  // ── PlatformPort ──────────────────────────────────────────────────────────

  isApplicable(): boolean {
    const host = window.location.hostname;
    return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com');
  }

  detectUsers(root: unknown): ReadonlyArray<UserDetection> {
    if (!(root instanceof Element) && !(root instanceof Document)) return [];
    return this.userDetector.detect(root);
  }

  getInjectionPoint(userElement: unknown): InjectionTarget | null {
    if (!(userElement instanceof Element)) return null;

    // The injection point is inside the User-Name container.
    // We inject immediately after the username anchor element.
    const nameContainer = userElement.querySelector('[data-testid="User-Name"]')
      ?? userElement;

    return {
      parent: nameContainer,
      insertBefore: null, // append at end
    };
  }

  observeNewContent(
    callback: (addedRoots: ReadonlyArray<unknown>) => void,
  ): Disposable {
    // Find the feed container to scope our MutationObserver
    const feedRoot = this.findFeedRoot();
    const target = feedRoot ?? document.body;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRoots: Element[] = [];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            pendingRoots.push(node);
          }
        }
      }

      if (pendingRoots.length === 0) return;

      // Debounce: batch mutations over MUTATION_DEBOUNCE_MS window
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const roots = [...pendingRoots];
        pendingRoots = [];
        debounceTimer = null;
        if (roots.length > 0) callback(roots);
      }, MUTATION_DEBOUNCE_MS);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
    });

    this.log.info('MutationObserver started', {
      targetTag: target.tagName,
      targetId: target.id || '(no id)',
    });

    return {
      dispose: () => {
        observer.disconnect();
        if (debounceTimer) clearTimeout(debounceTimer);
        this.log.info('MutationObserver disconnected');
      },
    };
  }

  observeNavigation(
    callback: (newUrl: string, previousUrl: string) => void,
  ): Disposable {
    return this.navigationObserver.observe(callback);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private findFeedRoot(): Element | null {
    // Try the primary column first (scopes observer to just the feed)
    return (
      document.querySelector('[data-testid="primaryColumn"]') ??
      document.querySelector('main[role="main"]') ??
      null
    );
  }

  /** Expose selector engine for diagnostics in the popup */
  getSelectorDiagnostics(): {
    configVersion: number;
    failureSummary: Record<string, number>;
  } {
    return {
      configVersion: this.selectorEngine.getConfigVersion(),
      failureSummary: this.selectorEngine.getFailureSummary(),
    };
  }
}
