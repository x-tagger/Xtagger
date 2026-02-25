/**
 * @module user-detector
 * @layer Platforms / X.com
 * @description Scans DOM subtrees for X.com user elements and extracts UserIdentifiers.
 *
 * Detection strategy:
 *   1. Find tweet/article containers in the subtree
 *   2. Within each container, find the username element via SelectorEngine
 *   3. Extract the @handle from the link href (most reliable) or text content
 *   4. Find the injection anchor (the User-Name container adjacent to the handle)
 *
 * The username is extracted from the href (/username) rather than the visible
 * text where possible — this avoids issues with truncated display text and
 * is resilient to DOM structure changes within the username container.
 *
 * Dependencies: SelectorEngine
 */

import type { UserIdentifier } from '@core/model/entities';
import type { UserDetection } from '@core/ports/platform.port';
import type { LoggerPort } from '@core/ports/logger.port';
import type { SelectorEngine } from './selector-engine';

import { PLATFORM_X } from '@core/shared/constants';

// ─── UserDetector ─────────────────────────────────────────────────────────────

export class UserDetector {
  private readonly log: LoggerPort;

  constructor(
    private readonly selectors: SelectorEngine,
    logger: LoggerPort,
  ) {
    this.log = logger.child('UserDetector');
  }

  /**
   * Scan a DOM subtree for user elements.
   * Returns one UserDetection per distinct username found.
   * Skips duplicates (same username appearing multiple times in the subtree).
   */
  detect(root: Element | Document): ReadonlyArray<UserDetection> {
    const results: UserDetection[] = [];
    const seen = new Set<string>();

    // Find all tweet/article containers in this subtree
    const containers = this.findContainers(root);

    for (const container of containers) {
      const detection = this.detectInContainer(container);
      if (!detection) continue;

      // Deduplicate by username within this scan pass
      if (seen.has(detection.userId.username)) continue;
      seen.add(detection.userId.username);

      results.push(detection);
    }

    return results;
  }

  /**
   * Detect a single user within a known container element.
   * Used when processing a single tweet that we know was just added.
   */
  detectInContainer(container: Element): UserDetection | null {
    // Try to find the username name container (holds display name + @handle)
    const nameContainer = this.selectors.queryOne('userNameContainer', container)
      ?? container.querySelector('[data-testid="User-Name"]');

    if (!nameContainer) return null;

    // Extract @username — prefer href-based extraction (most reliable)
    const username = this.extractUsernameFromContainer(nameContainer);
    if (!username) return null;

    const now = Date.now();
    const userId: UserIdentifier = {
      platform: PLATFORM_X,
      username,
      displayName: this.extractDisplayName(nameContainer) ?? undefined,
      firstSeen: now,
      lastSeen: now,
    };

    return {
      userId,
      element: container,
      injectionAnchor: nameContainer,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private findContainers(root: Element | Document): Element[] {
    // Try tweet containers first
    const tweetContainers = Array.from(
      root.querySelectorAll('[data-testid="cellInnerDiv"]'),
    );
    if (tweetContainers.length > 0) return tweetContainers;

    // Fallback: article elements
    const articles = Array.from(root.querySelectorAll('[role="article"]'));
    if (articles.length > 0) return articles;

    // Fallback: treat the root itself as a container (for single-element scans)
    if (root instanceof Element) return [root];

    return [];
  }

  private extractUsernameFromContainer(container: Element): string | null {
    // Strategy 1: Find a link whose href is "/<username>" (no deeper path)
    // X.com profile links are exactly /{username} with no further segments on the name container
    const links = Array.from(container.querySelectorAll('a[href^="/"]'));
    for (const link of links) {
      const href = (link as HTMLAnchorElement).href;
      const username = this.parseUsernameFromHref(href);
      if (username) return username;
    }

    // Strategy 2: Find a span starting with "@"
    const spans = Array.from(container.querySelectorAll('span'));
    for (const span of spans) {
      const text = span.textContent?.trim() ?? '';
      if (text.startsWith('@') && text.length > 1) {
        return text.slice(1).toLowerCase();
      }
    }

    return null;
  }

  private parseUsernameFromHref(href: string): string | null {
    try {
      const url = new URL(href);
      // Must be x.com or twitter.com
      if (!url.hostname.includes('x.com') && !url.hostname.includes('twitter.com')) return null;

      const path = url.pathname;
      // Path should be /{username} — exactly one segment, no slashes after
      // Exclude known non-profile paths
      const EXCLUDED_PATHS = new Set([
        '/home', '/explore', '/notifications', '/messages', '/settings',
        '/i', '/login', '/search', '/compose', '/intent',
      ]);

      const parts = path.split('/').filter(Boolean);
      if (parts.length !== 1) return null;

      const candidate = parts[0];
      if (!candidate) return null;
      if (EXCLUDED_PATHS.has(`/${candidate}`)) return null;

      // X usernames: 1–50 chars, letters/numbers/underscores only
      if (!/^[A-Za-z0-9_]{1,50}$/.test(candidate)) return null;

      return candidate.toLowerCase();
    } catch {
      return null;
    }
  }

  private extractDisplayName(container: Element): string | null {
    // Display name is typically the first visible text node that isn't the @handle
    const spans = Array.from(container.querySelectorAll('span'));
    for (const span of spans) {
      const text = span.textContent?.trim() ?? '';
      if (text.length > 0 && !text.startsWith('@') && !text.includes('@')) {
        // Likely a display name — take the first substantial one
        if (text.length >= 2 && text.length <= 100) return text;
      }
    }
    return null;
  }
}
