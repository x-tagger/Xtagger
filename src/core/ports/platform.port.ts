/**
 * @module platform.port
 * @layer Core / Ports
 * @description Port interface for platform-specific DOM adapters (X.com, Bluesky, etc.)
 * Core code never imports from a concrete platform adapter.
 */

import type { UserIdentifier } from '@core/model/entities';
import type { PlatformId } from '@core/shared/constants';
import type { Disposable } from '@core/events/event-bus';

// ─── Detection Results ────────────────────────────────────────────────────────

/** Represents a user element found in the DOM */
export interface UserDetection {
  readonly userId: UserIdentifier;
  /** The DOM element containing the user info (opaque to core) */
  readonly element: unknown;
  /** The anchor element where tags should be injected adjacent to */
  readonly injectionAnchor: unknown;
}

/** Describes where in the DOM to inject tag UI */
export interface InjectionTarget {
  /** The parent element to append/insert the tag container into */
  readonly parent: unknown;
  /** Insert before this element (null = append at end) */
  readonly insertBefore: unknown | null;
}

// ─── Platform Port ────────────────────────────────────────────────────────────

export interface PlatformPort {
  /** Identifies this platform, e.g. 'x.com' */
  readonly platformId: PlatformId;

  /**
   * Scan a DOM subtree for user elements.
   * Called by the injection pipeline when new content appears.
   * @param root - The DOM element to scan (opaque to core, typed by adapter)
   */
  detectUsers(root: unknown): ReadonlyArray<UserDetection>;

  /**
   * Determine the injection point for a given user element.
   * Returns null if this element is not suitable for injection.
   */
  getInjectionPoint(userElement: unknown): InjectionTarget | null;

  /**
   * Observe the DOM for newly added content (MutationObserver wrapper).
   * @param callback - Called with batches of added subtrees
   */
  observeNewContent(callback: (addedRoots: ReadonlyArray<unknown>) => void): Disposable;

  /**
   * Observe SPA navigation events.
   * @param callback - Called with the new URL when navigation occurs
   */
  observeNavigation(callback: (newUrl: string, previousUrl: string) => void): Disposable;

  /**
   * Test whether this platform adapter applies to the current page.
   * e.g. checks window.location.hostname
   */
  isApplicable(): boolean;
}
