/**
 * @file navigation-observer.test.ts
 * @description Unit tests for NavigationObserver using jsdom.
 *
 * Important: each test calls NavigationObserver.restoreForTesting() in afterEach
 * to undo the history.pushState / replaceState patches. Without this, the patched
 * methods accumulate across tests (each new observer would re-wrap the already-
 * patched method), causing navigation callbacks to fire multiple times.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../../src/core/events/event-bus';
import { NoopLogger } from '../../../src/shared/logger';
import { NavigationObserver } from '../../../src/platforms/x.com/navigation-observer';

describe('NavigationObserver', () => {
  let bus: EventBus;
  let observer: NavigationObserver;

  beforeEach(() => {
    bus      = new EventBus();
    observer = new NavigationObserver(bus, new NoopLogger());
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    // Remove the history patches so the next test starts with a clean slate
    NavigationObserver.restoreForTesting();
    window.history.pushState({}, '', '/');
  });

  it('calls callback when pushState is called', () => {
    const handler = vi.fn();
    const sub = observer.observe(handler);

    window.history.pushState({}, '', '/profile/alice');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toContain('/profile/alice');

    sub.dispose();
  });

  it('calls callback when replaceState is called', () => {
    const handler = vi.fn();
    const sub = observer.observe(handler);

    window.history.replaceState({}, '', '/notifications');

    expect(handler).toHaveBeenCalledOnce();
    sub.dispose();
  });

  it('does not call callback for same URL navigation', () => {
    const handler = vi.fn();
    const sub = observer.observe(handler);

    const current = window.location.href;
    window.history.replaceState({}, '', current); // same URL → no event

    expect(handler).not.toHaveBeenCalled();
    sub.dispose();
  });

  it('passes previous URL to callback', () => {
    window.history.pushState({}, '', '/home');
    observer = new NavigationObserver(bus, new NoopLogger());
    const handler = vi.fn();
    const sub = observer.observe(handler);

    window.history.pushState({}, '', '/notifications');

    const [newUrl, prevUrl] = handler.mock.calls[0] ?? [];
    expect(newUrl).toContain('/notifications');
    expect(prevUrl).toContain('/home');

    sub.dispose();
  });

  it('emits navigation:changed event on bus', () => {
    const busHandler = vi.fn();
    bus.on('navigation:changed', busHandler);
    const sub = observer.observe(() => {});

    window.history.pushState({}, '', '/explore');

    expect(busHandler).toHaveBeenCalledOnce();
    expect(busHandler.mock.calls[0]?.[0]).toMatchObject({
      url: expect.stringContaining('/explore'),
      previousUrl: expect.any(String),
    });

    sub.dispose();
  });

  it('stops observing after dispose()', () => {
    const handler = vi.fn();
    const sub = observer.observe(handler);
    sub.dispose();

    window.history.pushState({}, '', '/settings');

    expect(handler).not.toHaveBeenCalled();
  });

  it('getCurrentUrl() returns the current URL', () => {
    const sub = observer.observe(() => {});
    window.history.pushState({}, '', '/messages');
    expect(observer.getCurrentUrl()).toContain('/messages');
    sub.dispose();
  });
});
