/**
 * @file announcer.test.ts
 * @description Unit tests for the ARIA live region announcer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to test the DOM side effects
import { announce } from '../../../src/ui/content/announcer';

describe('announce()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an aria-live region in the document', async () => {
    announce('Hello screen reader');
    // rAF fires
    await vi.runAllTimersAsync();
    const el = document.getElementById('xtagger-announcer');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  it('sets the message text', async () => {
    announce('Tag added to @alice');
    await vi.runAllTimersAsync();
    const el = document.getElementById('xtagger-announcer');
    expect(el?.textContent).toBe('Tag added to @alice');
  });

  it('clears the message after 3 seconds', async () => {
    announce('Temporary message');
    await vi.runAllTimersAsync();
    expect(document.getElementById('xtagger-announcer')?.textContent).toBe('Temporary message');
    vi.advanceTimersByTime(3001);
    expect(document.getElementById('xtagger-announcer')?.textContent).toBe('');
  });

  it('uses assertive politeness when specified', async () => {
    announce('Important!', 'assertive');
    await vi.runAllTimersAsync();
    expect(document.getElementById('xtagger-announcer')?.getAttribute('aria-live')).toBe('assertive');
  });

  it('reuses the same element on repeated calls', async () => {
    announce('First');
    await vi.runAllTimersAsync();
    announce('Second');
    await vi.runAllTimersAsync();
    expect(document.querySelectorAll('#xtagger-announcer').length).toBe(1);
    expect(document.getElementById('xtagger-announcer')?.textContent).toBe('Second');
  });
});
