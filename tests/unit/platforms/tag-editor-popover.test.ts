/**
 * @file tag-editor-popover.test.ts
 * @description Unit tests for TagEditorPopover using jsdom.
 * Tests focus on DOM structure, mode switching, and the public API.
 * Network calls (sendMessage) are mocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoopLogger } from '../../../src/shared/logger';

// ── Mock chrome.runtime ────────────────────────────────────────────────────

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
});

// ── Mock sendMessage helper ────────────────────────────────────────────────

vi.mock('../../../src/shared/messages', () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));

import { TagEditorPopover, closeActivePopover } from '../../../src/ui/content/tag-editor-popover';
import { sendMessage } from '../../../src/shared/messages';
import type { UserIdentifier, Tag } from '../../../src/core/model/entities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (username = 'alice'): UserIdentifier => ({
  platform: 'x.com', username, firstSeen: 0, lastSeen: 0,
});

const makeTag = (name = 'politics', id = 'tag-1', colorIndex = 0): Tag => ({
  id, name, colorIndex, source: { type: 'local' }, createdAt: 0, updatedAt: 0,
});

const makeAnchor = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TagEditorPopover', () => {
  let popover: TagEditorPopover;

  beforeEach(() => {
    document.body.innerHTML = '';
    popover = new TagEditorPopover(new NoopLogger());
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, data: [] });
  });

  afterEach(() => {
    closeActivePopover();
    vi.clearAllMocks();
  });

  describe('open() — add mode', () => {
    it('renders a popover element in the document', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add',
        userId: makeUser(),
        anchor,
        onSaved: vi.fn(),
        onDeleted: vi.fn(),
        onClosed: vi.fn(),
      });
      expect(document.querySelector('[data-xtagger-popover]')).not.toBeNull();
    });

    it('shows add-tag title', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add', userId: makeUser('bob'), anchor,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      const popoverEl = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      expect(popoverEl.shadowRoot?.querySelector('.header-title')?.textContent)
        .toContain('Tag @bob');
    });

    it('does not render a delete button in add mode', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add', userId: makeUser(), anchor,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      const popoverEl = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      expect(popoverEl.shadowRoot?.querySelector('#xt-delete')).toBeNull();
    });

    it('renders 16 colour swatches', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add', userId: makeUser(), anchor,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      const popoverEl = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const swatches = popoverEl.shadowRoot?.querySelectorAll('.color-swatch');
      expect(swatches?.length).toBe(16);
    });
  });

  describe('open() — edit mode', () => {
    it('pre-fills the name input with existing tag name', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'edit', userId: makeUser(), anchor,
        existingTag: makeTag('journalist'),
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      const popoverEl = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const input = popoverEl.shadowRoot?.querySelector<HTMLInputElement>('#xt-name');
      expect(input?.value).toBe('journalist');
    });

    it('renders a delete button in edit mode', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'edit', userId: makeUser(), anchor,
        existingTag: makeTag(),
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      const popoverEl = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      expect(popoverEl.shadowRoot?.querySelector('#xt-delete')).not.toBeNull();
    });

    it('shows edit title with username', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'edit', userId: makeUser('charlie'), anchor,
        existingTag: makeTag(),
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      const popoverEl = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const title = popoverEl.shadowRoot?.querySelector('.header-title')?.textContent;
      expect(title).toContain('charlie');
    });
  });

  describe('close()', () => {
    it('removes the popover from the document', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add', userId: makeUser(), anchor,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      expect(document.querySelector('[data-xtagger-popover]')).not.toBeNull();
      popover.close();
      expect(document.querySelector('[data-xtagger-popover]')).toBeNull();
    });
  });

  describe('closeActivePopover()', () => {
    it('closes any open popover', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add', userId: makeUser(), anchor,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      closeActivePopover();
      expect(document.querySelector('[data-xtagger-popover]')).toBeNull();
    });
  });

  describe('singleton behaviour', () => {
    it('opening a second popover closes the first', async () => {
      const anchor1 = makeAnchor();
      const anchor2 = makeAnchor();
      const popover2 = new TagEditorPopover(new NoopLogger());

      await popover.open({
        mode: 'add', userId: makeUser('alice'), anchor: anchor1,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      await popover2.open({
        mode: 'add', userId: makeUser('bob'), anchor: anchor2,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });

      // Only one popover should exist
      expect(document.querySelectorAll('[data-xtagger-popover]').length).toBe(1);
    });
  });

  describe('sendMessage calls', () => {
    it('fetches tag names and user tags on open', async () => {
      const anchor = makeAnchor();
      await popover.open({
        mode: 'add', userId: makeUser('alice'), anchor,
        onSaved: vi.fn(), onDeleted: vi.fn(), onClosed: vi.fn(),
      });
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'tags:get-all-names' })
      );
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'tags:get-for-user' })
      );
    });
  });
});
