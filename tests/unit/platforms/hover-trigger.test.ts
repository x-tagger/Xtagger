/**
 * @file hover-trigger.test.ts
 * @description Unit tests for HoverTrigger.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoopLogger } from '../../../src/shared/logger';
import { HoverTrigger } from '../../../src/ui/content/hover-trigger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tweetHTML(username: string): string {
  return `
    <div data-testid="cellInnerDiv">
      <div data-testid="User-Name">
        <a href="https://x.com/${username}" role="link">${username}</a>
      </div>
    </div>
  `;
}

function fireMouseover(target: Element): void {
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}

function fireClick(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HoverTrigger', () => {
  let trigger: HoverTrigger;
  const onAddTag  = vi.fn();
  const onEditTag = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = '';
    trigger = new HoverTrigger(new NoopLogger());
    trigger.attach({ onAddTag, onEditTag });
  });

  afterEach(() => {
    trigger.detach();
    vi.clearAllMocks();
  });

  it('shows tag icon when hovering a User-Name container', () => {
    document.body.innerHTML = tweetHTML('alice');
    const nameContainer = document.querySelector('[data-testid="User-Name"]')!;
    fireMouseover(nameContainer);
    expect(document.querySelector('[data-xtagger-add-btn]')).not.toBeNull();
  });

  it('shows tag icon when hovering a child of User-Name', () => {
    document.body.innerHTML = tweetHTML('alice');
    const link = document.querySelector('[data-testid="User-Name"] a')!;
    fireMouseover(link);
    expect(document.querySelector('[data-xtagger-add-btn]')).not.toBeNull();
  });

  it('stamps the username onto the tag icon', () => {
    document.body.innerHTML = tweetHTML('testuser');
    const nameContainer = document.querySelector('[data-testid="User-Name"]')!;
    fireMouseover(nameContainer);
    const btn = document.querySelector<HTMLElement>('[data-xtagger-add-btn]');
    expect(btn?.dataset['username']).toBe('testuser');
  });

  it('does not show icon when hovering unrelated element', () => {
    document.body.innerHTML = '<div id="other">something</div>' + tweetHTML('alice');
    fireMouseover(document.getElementById('other')!);
    expect(document.querySelector('[data-xtagger-add-btn]')).toBeNull();
  });

  it('calls onAddTag when icon is clicked', () => {
    document.body.innerHTML = tweetHTML('alice');
    const nameContainer = document.querySelector('[data-testid="User-Name"]')!;
    fireMouseover(nameContainer);
    const btn = document.querySelector('[data-xtagger-add-btn]')!;
    fireClick(btn);
    expect(onAddTag).toHaveBeenCalledOnce();
    expect(onAddTag.mock.calls[0]?.[0].username).toBe('alice');
  });

  it('calls onEditTag when a tag pill is clicked', () => {
    document.body.innerHTML = `
      <span data-tag-id="t1" data-tag-name="dev" data-username="bob" data-color-index="2"></span>
    `;
    const pill = document.querySelector('[data-tag-id]')!;
    fireClick(pill);
    expect(onEditTag).toHaveBeenCalledOnce();
    expect(onEditTag.mock.calls[0]?.[0].username).toBe('bob');
    expect(onEditTag.mock.calls[0]?.[1].id).toBe('t1');
    expect(onEditTag.mock.calls[0]?.[1].name).toBe('dev');
  });

  it('does not show a second icon for the same container', () => {
    document.body.innerHTML = tweetHTML('alice');
    const container = document.querySelector('[data-testid="User-Name"]')!;
    fireMouseover(container);
    fireMouseover(container); // second hover
    expect(document.querySelectorAll('[data-xtagger-add-btn]').length).toBe(1);
  });

  it('removes listeners after detach()', () => {
    trigger.detach();
    document.body.innerHTML = tweetHTML('alice');
    const nameContainer = document.querySelector('[data-testid="User-Name"]')!;
    fireMouseover(nameContainer);
    expect(document.querySelector('[data-xtagger-add-btn]')).toBeNull();
  });
});
