import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/events/event-bus';

describe('EventBus', () => {
  it('calls handler when event is emitted', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('settings:changed', handler);
    bus.emit('settings:changed', { key: 'theme', value: 'dark' });
    expect(handler).toHaveBeenCalledWith({ key: 'theme', value: 'dark' });
  });

  it('does not call handler after dispose', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const sub = bus.on('settings:changed', handler);
    sub.dispose();
    bus.emit('settings:changed', { key: 'x', value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple handlers all receive the event', () => {
    const bus = new EventBus();
    const h1 = vi.fn(); const h2 = vi.fn();
    bus.on('settings:changed', h1);
    bus.on('settings:changed', h2);
    bus.emit('settings:changed', { key: 'k', value: 'v' });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('clear removes all handlers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('settings:changed', handler);
    bus.clear();
    bus.emit('settings:changed', { key: 'k', value: 'v' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('emitting to event with no handlers does not throw', () => {
    const bus = new EventBus();
    expect(() => bus.emit('navigation:changed', { url: '/', previousUrl: '/' })).not.toThrow();
  });

  it('handlerCount returns correct count', () => {
    const bus = new EventBus();
    expect(bus.handlerCount('settings:changed')).toBe(0);
    const sub = bus.on('settings:changed', vi.fn());
    expect(bus.handlerCount('settings:changed')).toBe(1);
    sub.dispose();
    expect(bus.handlerCount('settings:changed')).toBe(0);
  });
});
