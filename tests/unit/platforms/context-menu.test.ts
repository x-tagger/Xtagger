/**
 * @file context-menu.test.ts
 * @description Unit tests for ContextMenuManager username extraction logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome APIs
vi.stubGlobal('chrome', {
  contextMenus: {
    removeAll: vi.fn((cb) => cb?.()),
    create: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  action: {
    openPopup: vi.fn().mockResolvedValue(undefined),
  },
  runtime: {
    getManifest: () => ({ version: '0.1.0' }),
  },
});

import { ContextMenuManager } from '../../../src/adapters/chrome/context-menu';
import { NoopLogger }         from '../../../src/shared/logger';

describe('ContextMenuManager', () => {
  let manager: ContextMenuManager;

  beforeEach(() => {
    manager = new ContextMenuManager(new NoopLogger());
    vi.clearAllMocks();
  });

  describe('register()', () => {
    it('calls removeAll then creates 3 menu items', () => {
      manager.register();
      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(chrome.contextMenus.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleClick() — username extraction', () => {
    const makeFakeTab = (id = 1): chrome.tabs.Tab =>
      ({ id, url: 'https://x.com/alice' } as chrome.tabs.Tab);

    it('extracts username from a profile link URL', () => {
      manager.handleClick(
        { menuItemId: 'xtagger-tag-user', linkUrl: 'https://x.com/alice', selectionText: '' } as chrome.contextMenus.OnClickData,
        makeFakeTab(),
      );
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          channel: 'content:open-tag-editor',
          payload: expect.objectContaining({ username: 'alice' }),
        }),
      );
    });

    it('extracts username from selected @-text', () => {
      manager.handleClick(
        { menuItemId: 'xtagger-tag-user', selectionText: '@charlie', linkUrl: '' } as chrome.contextMenus.OnClickData,
        makeFakeTab(),
      );
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ payload: expect.objectContaining({ username: 'charlie' }) }),
      );
    });

    it('does not send message when URL is not a profile link', () => {
      manager.handleClick(
        { menuItemId: 'xtagger-tag-user', linkUrl: 'https://x.com/home', selectionText: '' } as chrome.contextMenus.OnClickData,
        makeFakeTab(),
      );
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('does not send message when no tab id', () => {
      manager.handleClick(
        { menuItemId: 'xtagger-tag-user', linkUrl: 'https://x.com/alice', selectionText: '' } as chrome.contextMenus.OnClickData,
        { id: undefined } as chrome.tabs.Tab,
      );
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('normalises username to lowercase', () => {
      manager.handleClick(
        { menuItemId: 'xtagger-tag-user', linkUrl: 'https://x.com/TestUser', selectionText: '' } as chrome.contextMenus.OnClickData,
        makeFakeTab(),
      );
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ payload: expect.objectContaining({ username: 'testuser' }) }),
      );
    });

    it('ignores /status/ tweet links', () => {
      manager.handleClick(
        { menuItemId: 'xtagger-tag-user', linkUrl: 'https://x.com/alice/status/12345', selectionText: '' } as chrome.contextMenus.OnClickData,
        makeFakeTab(),
      );
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });
});
