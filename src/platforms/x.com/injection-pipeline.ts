/**
 * @module injection-pipeline
 * @layer Platforms / X.com
 * @description Orchestrates the full tag injection lifecycle.
 *
 * Pipeline stages (per DOM batch):
 *   1. Receive added DOM roots from MutationObserver (via XPlatformAdapter)
 *   2. Detect users in each root (UserDetector → PlatformPort.detectUsers)
 *   3. Check in-memory tag cache (Map<username, Tag[]>)
 *   4. On cache miss: request tags from background via chrome.runtime message
 *   5. Queue injection via requestAnimationFrame (batched, max 20/frame)
 *   6. InjectionManager.inject() renders Shadow DOM pills
 *   7. On navigation: clear injected state for the old surface
 *
 * Tag cache invalidation:
 *   - EventBus 'tag:created/updated/deleted' → re-inject affected user
 *   - Navigation → full cache cleared for the new surface
 *
 * Dependencies: PlatformPort, InjectionManager, TypedEventBus, sendMessage
 *
 * BUNDLE BUDGET: This module + all its imports must stay under 50KB gzipped.
 */

import type { PlatformPort } from '@core/ports/platform.port';
import type { TypedEventBus, Disposable } from '@core/events/event-bus';
import type { Tag, ExtensionSettings } from '@core/model/entities';
import type { LoggerPort } from '@core/ports/logger.port';
import type { GetTagsForUserResponse } from '@shared/messages';

import { sendMessage } from '@shared/messages';
import { InjectionManager } from './injection-manager';
import { FailureNotifier } from './failure-notifier';
import { MAX_ELEMENTS_PER_FRAME } from '@core/shared/constants';

// ─── InjectionPipeline ────────────────────────────────────────────────────────

export class InjectionPipeline {
  /** In-memory tag cache: username → active tags */
  private readonly tagCache = new Map<string, ReadonlyArray<Tag>>();

  /** Elements waiting to be injected in the next animation frame */
  private readonly injectionQueue: Array<{
    anchor: Element;
    username: string;
  }> = [];

  private rafHandle: number | null = null;

  private readonly injectionManager: InjectionManager;
  private readonly failureNotifier: FailureNotifier;
  private readonly subscriptions: Disposable[] = [];
  private displayMode: ExtensionSettings['displayMode'] = 'compact';
  private readonly log: LoggerPort;

  constructor(
    private readonly platform: PlatformPort,
    private readonly bus: TypedEventBus,
    logger: LoggerPort,
  ) {
    this.log = logger.child('InjectionPipeline');
    this.injectionManager = new InjectionManager(logger);
    this.failureNotifier  = new FailureNotifier();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start the pipeline. Begins observing DOM mutations and navigation.
   */
  async start(settings: ExtensionSettings): Promise<void> {
    this.displayMode = settings.displayMode;

    // Subscribe to tag mutation events to invalidate cache + re-inject
    this.subscriptions.push(
      this.bus.on('tag:created', ({ userId }) => {
        this.invalidateCache(userId.username);
      }),
      this.bus.on('tag:updated', ({ userId }) => {
        this.invalidateCache(userId.username);
      }),
      this.bus.on('tag:deleted', ({ userId }) => {
        this.invalidateCache(userId.username);
      }),
      this.bus.on('selector:failed', () => {
        this.failureNotifier.showSelectorFailure();
      }),
      this.bus.on('settings:changed', ({ key, value }) => {
        if (key === 'displayMode') {
          this.displayMode = value as ExtensionSettings['displayMode'];
          this.reinjectAll();
        }
      }),
    );

    // Start observing navigation
    this.subscriptions.push(
      this.platform.observeNavigation((newUrl, previousUrl) => {
        this.log.info('Navigation', { from: previousUrl, to: newUrl });
        this.onNavigation();
      }),
    );

    // Start the MutationObserver pipeline
    this.subscriptions.push(
      this.platform.observeNewContent((addedRoots) => {
        this.processAddedRoots(addedRoots);
      }),
    );

    // Do an initial scan of the current page
    this.processAddedRoots([document.body]);

    this.log.info('Pipeline started', { displayMode: this.displayMode });
  }

  /**
   * Stop the pipeline and clean up all injections.
   */
  stop(): void {
    for (const sub of this.subscriptions) sub.dispose();
    this.subscriptions.length = 0;

    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }

    this.injectionManager.removeAll();
    this.tagCache.clear();
    this.injectionQueue.length = 0;
    this.failureNotifier.dismiss();

    this.log.info('Pipeline stopped');
  }

  // ── Core processing ───────────────────────────────────────────────────────

  private processAddedRoots(roots: ReadonlyArray<unknown>): void {
    for (const root of roots) {
      if (!(root instanceof Element) && !(root instanceof Document)) continue;

      const detections = this.platform.detectUsers(root);

      for (const detection of detections) {
        const anchor = detection.injectionAnchor as Element;

        // Skip if already injected and cache is current
        if (this.injectionManager.isInjected(anchor)) continue;

        const username = detection.userId.username;
        const cached = this.tagCache.get(username);

        if (cached !== undefined) {
          // We already know the tags — queue immediate injection
          this.queueInjection(anchor, username);
        } else {
          // Fetch tags from background, then inject
          this.fetchAndInject(detection.userId.username, anchor);
        }
      }
    }
  }

  private async fetchAndInject(username: string, anchor: Element): Promise<void> {
    const response = await sendMessage<GetTagsForUserResponse>({
      channel: 'tags:get-for-user',
      payload: { platform: this.platform.platformId, username },
    });

    if (!response.ok || !response.data) {
      // Store empty array so we don't retry on every scroll
      this.tagCache.set(username, []);
      return;
    }

    this.tagCache.set(username, response.data);

    if (response.data.length > 0) {
      this.queueInjection(anchor, username);
    }
  }

  private queueInjection(anchor: Element, username: string): void {
    this.injectionQueue.push({ anchor, username });
    this.scheduleRAF();
  }

  private scheduleRAF(): void {
    if (this.rafHandle) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.flushQueue();
    });
  }

  private flushQueue(): void {
    // Process at most MAX_ELEMENTS_PER_FRAME to keep the frame budget
    const batch = this.injectionQueue.splice(0, MAX_ELEMENTS_PER_FRAME);

    for (const { anchor, username } of batch) {
      const tags = this.tagCache.get(username) ?? [];
      if (this.displayMode === 'hidden') continue;

      this.injectionManager.inject(
        anchor,
        tags,
        this.displayMode === 'full' ? 'pills' : this.displayMode,
        username,
      );
    }

    // If more items remain, schedule another frame
    if (this.injectionQueue.length > 0) {
      this.scheduleRAF();
    }
  }

  // ── Cache invalidation ────────────────────────────────────────────────────

  private invalidateCache(username: string): void {
    this.tagCache.delete(username);
    // Re-inject all currently visible elements for this user
    this.reInjectUser(username);
  }

  private async reInjectUser(username: string): Promise<void> {
    // Pass 1: update any already-injected anchors for this user
    const injectedElements = document.querySelectorAll("[data-xtagger-injected]");
    for (const anchor of injectedElements) {
      const container = anchor.closest('[data-testid="cellInnerDiv"]')
        ?? anchor.closest('[role="article"]');
      if (!container) continue;
      const detections = this.platform.detectUsers(container);
      for (const d of detections) {
        if (d.userId.username === username) {
          this.injectionManager.remove(anchor as Element);
          await this.fetchAndInject(username, d.injectionAnchor as Element);
        }
      }
    }

    // Pass 2: also scan the whole page for this username in case no
    // injection existed yet (first tag ever added for this user)
    const allDetections = this.platform.detectUsers(document.body);
    for (const d of allDetections) {
      if (d.userId.username === username) {
        const anchor = d.injectionAnchor as Element;
        if (!this.injectionManager.isInjected(anchor)) {
          await this.fetchAndInject(username, anchor);
        }
      }
    }
  }

  private reinjectAll(): void {
    // Clear all injections and re-process the whole page
    this.injectionManager.removeAll();
    this.processAddedRoots([document.body]);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  private onNavigation(): void {
    // On navigation, the feed content will be replaced — clean up
    this.injectionManager.removeAll();
    this.tagCache.clear();
    this.injectionQueue.length = 0;

    // Re-scan after a brief delay (allow the SPA to render new content)
    setTimeout(() => {
      this.processAddedRoots([document.body]);
    }, 500);
  }
}
