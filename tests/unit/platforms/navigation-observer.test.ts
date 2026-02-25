/**
 * @file navigation-observer.test.ts
 * @description Unit tests for NavigationObserver using jsdom.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventBus } from '../../../src/core/events/event-bus';
import { NoopLogger } from '../../../src/shared/logger';
import { NavigationObserver } from '../../../src/platforms/x.com/navigation-observer';

describe('NavigationObserver', () => {
  let bus: EventBus;
  let observer: NavigationObserver;

  beforeEach(() => {
    bus      = new EventBus();
    observer = new NavigationObserver(bus, new NoopLogger());
    // Reset location
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
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
    window.history.replaceState({}, '', current); // Same URL

    expect(handler).not.toHaveBeenCalled();
    sub.dispose();
  });

  it('passes previous URL to callback', () => {
    const handler = vi.fn();
    window.history.pushState({}, '', '/home');
    observer = new NavigationObserver(bus, new NoopLogger());
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
    expect(busHandler.mock.calls[0]?.[0].url).toContain('/explore');

    sub.dispose();
  });

  it('stops observing after dispose()', () => {
    const handler = vi.fn();
    const sub = observer.observe(handler);
    sub.dispose();

    window.history.pushState({}, '', '/new-page');
    expect(handler).not.toHaveBeenCalled();
  });

  it('getCurrentUrl() returns the current URL', () => {
    window.history.pushState({}, '', '/current');
    const obs = new NavigationObserver(bus, new NoopLogger());
    const sub = obs.observe(() => {});
    window.history.pushState({}, '', '/updated');
    expect(obs.getCurrentUrl()).toContain('/updated');
    sub.dispose();
  });
});
