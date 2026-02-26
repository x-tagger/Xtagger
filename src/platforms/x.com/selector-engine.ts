/**
 * @module selector-engine
 * @layer Platforms / X.com
 * @description Multi-strategy CSS selector engine with fallback chains and failure tracking.
 *
 * Selector strategies are tried in priority order:
 *   1. data-testid  — most stable, X uses these for internal testing
 *   2. aria         — accessibility attributes resist removal
 *   3. structural   — DOM tree shape patterns
 *   4. text         — last resort, content-based matching
 *
 * When ALL strategies for a selector fail consecutively, a failure is recorded.
 * After FAILURE_THRESHOLD failures, the 'selector:failed' event is emitted.
 *
 * Dependencies: none (no imports from core services)
 */

import type { SelectorError } from '@core/shared/errors';
import type { Result } from '@core/shared/result';
import type { TypedEventBus } from '@core/events/event-bus';
import type { LoggerPort } from '@core/ports/logger.port';

import { ok, err } from '@core/shared/result';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SelectorStrategyType = 'testid' | 'aria' | 'structural' | 'text';

export interface SelectorStrategy {
  readonly type: SelectorStrategyType;
  readonly value: string;
}

export interface SelectorDefinition {
  readonly description: string;
  readonly strategies: ReadonlyArray<SelectorStrategy>;
}

export interface SelectorConfig {
  readonly selectorVersion: number;
  readonly lastVerified: string;
  readonly platform: string;
  readonly selectors: Readonly<Record<string, SelectorDefinition>>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Consecutive failures before emitting selector:failed event */
const FAILURE_THRESHOLD = 10;

// ─── Engine ───────────────────────────────────────────────────────────────────

export class SelectorEngine {
  private config: SelectorConfig | null = null;
  /** Per-selector consecutive failure counts */
  private readonly failureCounts = new Map<string, number>();
  /** Selectors that have already triggered a warning (don't spam) */
  private readonly warnedSelectors = new Set<string>();
  private readonly log: LoggerPort;

  constructor(
    private readonly bus: TypedEventBus,
    logger: LoggerPort,
  ) {
    this.log = logger.child('SelectorEngine');
  }

  // ── Config loading ────────────────────────────────────────────────────────

  /**
   * Load selector config from a parsed JSON object.
   * Called once on content script init with the bundled config.
   */
  loadConfig(config: SelectorConfig): void {
    this.config = config;
    this.log.info('Selector config loaded', {
      version: config.selectorVersion,
      lastVerified: config.lastVerified,
      selectorCount: Object.keys(config.selectors).length,
    });
  }

  /**
   * Attempt to load config from a URL (for runtime updates).
   * Used by the optional remote config fetch (explicit user opt-in only).
   */
  async loadConfigFromUrl(url: string): Promise<Result<void, SelectorError>> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return err({
          type: 'SELECTOR_CONFIG_INVALID',
          message: `Failed to fetch selector config from ${url}: HTTP ${response.status}`,
        });
      }
      const json = await response.json() as SelectorConfig;
      this.loadConfig(json);
      return ok(undefined);
    } catch (e) {
      return err({
        type: 'SELECTOR_CONFIG_INVALID',
        message: `Failed to load selector config: ${String(e)}`,
      });
    }
  }

  // ── Query API ─────────────────────────────────────────────────────────────

  /**
   * Find the first element matching any strategy for the given selector key.
   * Strategies are tried in order; first match wins.
   *
   * @param selectorKey  - Key in config.selectors e.g. "userHandle"
   * @param root         - DOM subtree to search within
   * @returns The matching element, or null if all strategies failed
   */
  queryOne(selectorKey: string, root: ParentNode = document): Element | null {
    const definition = this.config?.selectors[selectorKey];
    if (!definition) {
      this.log.warn('Unknown selector key', { selectorKey });
      return null;
    }

    for (const strategy of definition.strategies) {
      const el = this.tryStrategy(strategy, root);
      if (el) {
        this.resetFailureCount(selectorKey);
        return el;
      }
    }

    this.recordFailure(selectorKey);
    return null;
  }

  /**
   * Find all elements matching any strategy for the given selector key.
   * Uses the FIRST successful strategy only (to avoid duplicates).
   */
  queryAll(selectorKey: string, root: ParentNode = document): ReadonlyArray<Element> {
    const definition = this.config?.selectors[selectorKey];
    if (!definition) return [];

    for (const strategy of definition.strategies) {
      const elements = this.tryStrategyAll(strategy, root);
      if (elements.length > 0) {
        this.resetFailureCount(selectorKey);
        return elements;
      }
    }

    this.recordFailure(selectorKey);
    return [];
  }

  /**
   * Test whether ANY strategy for a given key matches (for health checks).
   */
  canFind(selectorKey: string, root: ParentNode = document): boolean {
    return this.queryOne(selectorKey, root) !== null;
  }

  // ── Strategy execution ────────────────────────────────────────────────────

  private tryStrategy(strategy: SelectorStrategy, root: ParentNode): Element | null {
    try {
      switch (strategy.type) {
        case 'testid':
        case 'aria':
        case 'structural':
          return root.querySelector(strategy.value);

        case 'text': {
          // Text strategy: find elements containing a specific text pattern
          const needle = strategy.value.toLowerCase();
          const candidates = root.querySelectorAll('span, a, div');
          for (const el of candidates) {
            if (el.textContent?.toLowerCase().includes(needle)) return el;
          }
          return null;
        }
      }
    } catch (e) {
      // Invalid CSS selector — log and skip
      this.log.warn('Selector strategy threw', { strategy: strategy.value, error: String(e) });
      return null;
    }
  }

  private tryStrategyAll(strategy: SelectorStrategy, root: ParentNode): Element[] {
    try {
      switch (strategy.type) {
        case 'testid':
        case 'aria':
        case 'structural':
          return Array.from(root.querySelectorAll(strategy.value));

        case 'text': {
          const needle = strategy.value.toLowerCase();
          const candidates = Array.from(root.querySelectorAll('span, a, div'));
          return candidates.filter(
            (el) => el.textContent?.toLowerCase().includes(needle),
          );
        }
      }
    } catch {
      return [];
    }
  }

  // ── Failure tracking ──────────────────────────────────────────────────────

  private recordFailure(selectorKey: string): void {
    const current = (this.failureCounts.get(selectorKey) ?? 0) + 1;
    this.failureCounts.set(selectorKey, current);

    if (current >= FAILURE_THRESHOLD && !this.warnedSelectors.has(selectorKey)) {
      this.warnedSelectors.add(selectorKey);
      this.log.warn('Selector failing repeatedly', { selectorKey, failureCount: current });
      this.bus.emit('selector:failed', {
        selector: selectorKey,
        strategy: 'all-strategies-exhausted',
        url: window.location.href,
        failureCount: current,
      });
    }
  }

  private resetFailureCount(selectorKey: string): void {
    if (this.failureCounts.has(selectorKey)) {
      this.failureCounts.delete(selectorKey);
      if (this.warnedSelectors.has(selectorKey)) {
        this.warnedSelectors.delete(selectorKey);
        this.bus.emit('selector:recovered', {
          selector: selectorKey,
          strategy: 'recovered',
        });
      }
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  getFailureSummary(): Record<string, number> {
    return Object.fromEntries(this.failureCounts.entries());
  }

  getConfigVersion(): number {
    return this.config?.selectorVersion ?? 0;
  }

  isConfigLoaded(): boolean {
    return this.config !== null;
  }
}
