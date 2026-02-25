/**
 * @file selector-engine.test.ts
 * @description Unit tests for SelectorEngine using jsdom.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../../src/core/events/event-bus';
import { NoopLogger } from '../../../src/shared/logger';
import { SelectorEngine } from '../../../src/platforms/x.com/selector-engine';
import type { SelectorConfig } from '../../../src/platforms/x.com/selector-engine';

// ─── Test config ──────────────────────────────────────────────────────────────

const TEST_CONFIG: SelectorConfig = {
  selectorVersion: 1,
  lastVerified: '2025-01-01',
  platform: 'x.com',
  selectors: {
    article: {
      description: 'An article element',
      strategies: [
        { type: 'testid', value: '[data-testid="article"]' },
        { type: 'aria',   value: '[role="article"]' },
        { type: 'structural', value: 'div.article-class' },
      ],
    },
    username: {
      description: 'Username element',
      strategies: [
        { type: 'testid', value: '[data-testid="username"]' },
        { type: 'text',   value: '@' },
      ],
    },
    nonexistent: {
      description: 'A selector that never matches',
      strategies: [
        { type: 'testid', value: '[data-testid="ghost"]' },
      ],
    },
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SelectorEngine', () => {
  let engine: SelectorEngine;
  let bus: EventBus;

  beforeEach(() => {
    bus    = new EventBus();
    engine = new SelectorEngine(bus, new NoopLogger());
    engine.loadConfig(TEST_CONFIG);
    document.body.innerHTML = '';
  });

  describe('loadConfig', () => {
    it('reports config as loaded after loadConfig()', () => {
      expect(engine.isConfigLoaded()).toBe(true);
      expect(engine.getConfigVersion()).toBe(1);
    });
  });

  describe('queryOne', () => {
    it('finds element by data-testid strategy', () => {
      document.body.innerHTML = '<div data-testid="article">hi</div>';
      const el = engine.queryOne('article', document.body);
      expect(el).not.toBeNull();
      expect(el?.getAttribute('data-testid')).toBe('article');
    });

    it('falls back to aria strategy when testid fails', () => {
      document.body.innerHTML = '<div role="article">hi</div>';
      const el = engine.queryOne('article', document.body);
      expect(el).not.toBeNull();
    });

    it('falls back to structural strategy when both testid and aria fail', () => {
      document.body.innerHTML = '<div class="article-class">hi</div>';
      const el = engine.queryOne('article', document.body);
      expect(el).not.toBeNull();
    });

    it('returns null when all strategies fail', () => {
      document.body.innerHTML = '<div>nothing matches</div>';
      const el = engine.queryOne('nonexistent', document.body);
      expect(el).toBeNull();
    });

    it('returns null for unknown selector key', () => {
      const el = engine.queryOne('unknownKey', document.body);
      expect(el).toBeNull();
    });

    it('finds text-based selector', () => {
      document.body.innerHTML = '<span>@alice</span>';
      const el = engine.queryOne('username', document.body);
      expect(el).not.toBeNull();
    });
  });

  describe('queryAll', () => {
    it('returns all matching elements', () => {
      document.body.innerHTML = `
        <div data-testid="article">1</div>
        <div data-testid="article">2</div>
        <div data-testid="article">3</div>
      `;
      const els = engine.queryAll('article', document.body);
      expect(els.length).toBe(3);
    });

    it('returns empty array when nothing matches', () => {
      document.body.innerHTML = '<div>nothing</div>';
      const els = engine.queryAll('nonexistent', document.body);
      expect(els.length).toBe(0);
    });
  });

  describe('canFind', () => {
    it('returns true when element exists', () => {
      document.body.innerHTML = '<div data-testid="article"></div>';
      expect(engine.canFind('article', document.body)).toBe(true);
    });
    it('returns false when element absent', () => {
      document.body.innerHTML = '<div>nothing</div>';
      expect(engine.canFind('nonexistent', document.body)).toBe(false);
    });
  });

  describe('failure tracking', () => {
    it('emits selector:failed after FAILURE_THRESHOLD consecutive failures', () => {
      const handler = vi.fn();
      bus.on('selector:failed', handler);

      document.body.innerHTML = '<div>nothing</div>';

      // 3 failures needed to trigger
      engine.queryOne('nonexistent', document.body);
      engine.queryOne('nonexistent', document.body);
      expect(handler).not.toHaveBeenCalled();

      engine.queryOne('nonexistent', document.body);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]?.[0].selector).toBe('nonexistent');
    });

    it('does not re-emit selector:failed for the same selector (deduplication)', () => {
      const handler = vi.fn();
      bus.on('selector:failed', handler);
      document.body.innerHTML = '<div></div>';

      for (let i = 0; i < 10; i++) engine.queryOne('nonexistent', document.body);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits selector:recovered when a previously failing selector succeeds', () => {
      const failedHandler   = vi.fn();
      const recoveredHandler = vi.fn();
      bus.on('selector:failed',    failedHandler);
      bus.on('selector:recovered', recoveredHandler);

      document.body.innerHTML = '<div></div>';
      for (let i = 0; i < 3; i++) engine.queryOne('nonexistent', document.body);
      expect(failedHandler).toHaveBeenCalledOnce();

      // Now make it succeed (but we can't do that for 'nonexistent'...)
      // Instead test recovery directly via a different selector that first fails then succeeds
      const busB = new EventBus();
      const engineB = new SelectorEngine(busB, new NoopLogger());
      engineB.loadConfig(TEST_CONFIG);
      const recB = vi.fn();
      busB.on('selector:recovered', recB);

      for (let i = 0; i < 3; i++) engineB.queryOne('article', document.body); // fails (empty DOM)
      document.body.innerHTML = '<div data-testid="article">hi</div>';
      engineB.queryOne('article', document.body); // succeeds — should reset + emit recovered
      expect(recB).toHaveBeenCalledOnce();
    });

    it('getFailureSummary returns current failure counts', () => {
      document.body.innerHTML = '';
      engine.queryOne('nonexistent', document.body);
      engine.queryOne('nonexistent', document.body);
      const summary = engine.getFailureSummary();
      expect(summary['nonexistent']).toBe(2);
    });
  });
});
