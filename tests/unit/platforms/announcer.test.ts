/**
 * @file announcer.test.ts
 * @description Unit tests for the ARIA live region announcer.
 *
 * Timer notes:
 *   announce() uses setTimeout(0) to set text, and setTimeout(3000) to clear it.
 *   We use vi.advanceTimersByTimeAsync(1) to fire only the first timer (0ms),
 *   and then explicitly advance to 3001 to test the clear behaviour.
 *   vi.runAllTimersAsync() must be avoided — it fires ALL pending timers including
 *   the 3000ms clear, leaving textContent empty before we can assert on it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { announce } from '../../../src/ui/content/announcer';

describe('announce()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('creates an aria-live region in the document', async () => {
    announce('Hello screen reader');
    await vi.advanceTimersByTimeAsync(1);      // fire the 0ms setTimeout
    const el = document.getElementById('xtagger-announcer');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('polite');
    expect(el?.getAttribute('role')).toBe('status');
  });

  it('sets the message text', async () => {
    announce('Tag added to @alice');
    await vi.advanceTimersByTimeAsync(1);      // fire the 0ms setTimeout
    const el = document.getElementById('xtagger-announcer');
    expect(el?.textContent).toBe('Tag added to @alice');
  });

  it('clears the message after 3 seconds', async () => {
    announce('Temporary message');
    await vi.advanceTimersByTimeAsync(1);      // text is now set
    expect(document.getElementById('xtagger-announcer')?.textContent).toBe('Temporary message');
    await vi.advanceTimersByTimeAsync(3001);   // fire the 3000ms clear timer
    expect(document.getElementById('xtagger-announcer')?.textContent).toBe('');
  });

  it('uses assertive politeness when specified', async () => {
    announce('Important!', 'assertive');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.getElementById('xtagger-announcer')?.getAttribute('aria-live')).toBe('assertive');
  });

  it('reuses the same element on repeated calls', async () => {
    announce('First');
    await vi.advanceTimersByTimeAsync(1);
    announce('Second');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelectorAll('#xtagger-announcer').length).toBe(1);
    expect(document.getElementById('xtagger-announcer')?.textContent).toBe('Second');
  });
});
