/**
 * @file injection-manager.test.ts
 * @description Unit tests for InjectionManager using jsdom.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NoopLogger } from '../../../src/shared/logger';
import { InjectionManager } from '../../../src/platforms/x.com/injection-manager';
import type { Tag } from '../../../src/core/model/entities';

const makeTag = (name: string, colorIndex = 0): Tag => ({
  id: `tag-${name}`,
  name,
  colorIndex,
  source: { type: 'local' },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('InjectionManager', () => {
  let manager: InjectionManager;
  let anchor: HTMLElement;

  beforeEach(() => {
    manager = new InjectionManager(new NoopLogger());
    document.body.innerHTML = '';
    anchor = document.createElement('div');
    anchor.setAttribute('data-testid', 'User-Name');
    document.body.appendChild(anchor);
  });

  describe('inject()', () => {
    it('creates a shadow host after the anchor', () => {
      manager.inject(anchor, [makeTag('politics')]);
      const host = anchor.nextElementSibling;
      expect(host).not.toBeNull();
      expect(host?.getAttribute('data-xtagger-host')).toBeTruthy();
    });

    it('marks anchor as injected', () => {
      manager.inject(anchor, [makeTag('politics')]);
      expect(anchor.hasAttribute('data-xtagger-injected')).toBe(true);
    });

    it('creates tag pills in the shadow DOM', () => {
      manager.inject(anchor, [makeTag('politics'), makeTag('tech')]);
      const host = anchor.nextElementSibling as HTMLElement;
      const pills = host.shadowRoot?.querySelectorAll('.xt-pill');
      expect(pills?.length).toBe(2);
    });

    it('does nothing when tags array is empty', () => {
      manager.inject(anchor, []);
      expect(anchor.hasAttribute('data-xtagger-injected')).toBe(false);
    });

    it('removes injection when called with empty tags on existing injection', () => {
      manager.inject(anchor, [makeTag('politics')]);
      expect(manager.isInjected(anchor)).toBe(true);
      manager.inject(anchor, []);
      expect(manager.isInjected(anchor)).toBe(false);
    });

    it('does nothing in hidden mode', () => {
      manager.inject(anchor, [makeTag('politics')], 'hidden');
      expect(manager.isInjected(anchor)).toBe(false);
    });

    it('updates existing injection in place', () => {
      manager.inject(anchor, [makeTag('politics')]);
      manager.inject(anchor, [makeTag('tech'), makeTag('art'), makeTag('news')]);
      const host = anchor.nextElementSibling as HTMLElement;
      const pills = host.shadowRoot?.querySelectorAll('.xt-pill');
      expect(pills?.length).toBe(3);
      // Only one host element should exist
      expect(document.querySelectorAll('[data-xtagger-host]').length).toBe(1);
    });
  });

  describe('remove()', () => {
    it('removes shadow host and clears anchor attribute', () => {
      manager.inject(anchor, [makeTag('politics')]);
      manager.remove(anchor);
      expect(anchor.hasAttribute('data-xtagger-injected')).toBe(false);
      expect(anchor.nextElementSibling).toBeNull();
    });

    it('is safe to call on non-injected anchor', () => {
      expect(() => manager.remove(anchor)).not.toThrow();
    });
  });

  describe('removeAll()', () => {
    it('removes all injected hosts from the document', () => {
      const anchor2 = document.createElement('div');
      document.body.appendChild(anchor2);

      manager.inject(anchor,  [makeTag('a')]);
      manager.inject(anchor2, [makeTag('b')]);
      expect(document.querySelectorAll('[data-xtagger-host]').length).toBe(2);

      manager.removeAll();
      expect(document.querySelectorAll('[data-xtagger-host]').length).toBe(0);
    });
  });

  describe('activeCount()', () => {
    it('returns count of active injections', () => {
      const anchor2 = document.createElement('div');
      document.body.appendChild(anchor2);

      expect(manager.activeCount()).toBe(0);
      manager.inject(anchor,  [makeTag('a')]);
      expect(manager.activeCount()).toBe(1);
      manager.inject(anchor2, [makeTag('b')]);
      expect(manager.activeCount()).toBe(2);
      manager.remove(anchor);
      expect(manager.activeCount()).toBe(1);
    });
  });

  describe('pill display modes', () => {
    it('compact mode: pills have no text content (dot only)', () => {
      manager.inject(anchor, [makeTag('politics', 0)], 'compact');
      const host = anchor.nextElementSibling as HTMLElement;
      const pill = host.shadowRoot?.querySelector('.xt-pill');
      // Compact pills are dots with no text content
      expect(pill?.textContent).toBe('');
    });

    it('pills mode: pills show tag name text', () => {
      manager.inject(anchor, [makeTag('politics', 0)], 'pills');
      const host = anchor.nextElementSibling as HTMLElement;
      const pill = host.shadowRoot?.querySelector('.xt-pill');
      expect(pill?.textContent).toBe('politics');
    });

    it('pill title attribute contains tag name', () => {
      manager.inject(anchor, [makeTag('breaking-news', 0)], 'compact');
      const host = anchor.nextElementSibling as HTMLElement;
      const pill = host.shadowRoot?.querySelector('.xt-pill');
      expect(pill?.getAttribute('title')).toContain('breaking-news');
    });
  });
});
