/**
 * @module context-menu
 * @layer Adapters / Chrome
 * @description Registers and handles the right-click context menu entry.
 *
 * Menu items:
 *   - "Tag @username" — appears when right-clicking on a link that looks like a
 *     profile URL (/@username). Sends a message to the content script to open
 *     the tag editor for that user.
 *
 * Note: Context menus are created once on install/startup and persist.
 * Attempting to create a menu that already exists throws — we use
 * removeAll() first to handle extension updates cleanly.
 *
 * MV3 limitation: contextMenus API is only available in the service worker,
 * not in content scripts.
 */

import type { LoggerPort } from '@core/ports/logger.port';

const MENU_ID_TAG_USER  = 'xtagger-tag-user';
const MENU_ID_SEPARATOR = 'xtagger-sep';
const MENU_ID_OPEN_POPUP = 'xtagger-open-popup';

export class ContextMenuManager {
  private readonly log: LoggerPort;

  constructor(logger: LoggerPort) {
    this.log = logger.child('ContextMenu');
  }

  /**
   * Register context menu items. Call once on install/startup.
   * Safe to call multiple times — removes existing items first.
   */
  register(): void {
    // Remove any previously registered items (handles extension updates)
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID_TAG_USER,
        title: '🏷️ Tag @%s',
        contexts: ['selection', 'link'],
        documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
      });

      chrome.contextMenus.create({
        id: MENU_ID_SEPARATOR,
        type: 'separator',
        contexts: ['selection', 'link'],
        documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
      });

      chrome.contextMenus.create({
        id: MENU_ID_OPEN_POPUP,
        title: 'Open XTagger',
        contexts: ['page', 'selection', 'link'],
        documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
      });

      this.log.info('Context menu registered');
    });
  }

  /**
   * Handle context menu item clicks.
   * Sends a message to the active tab's content script.
   */
  handleClick(
    info: chrome.contextMenus.OnClickData,
    tab: chrome.tabs.Tab | undefined,
  ): void {
    if (!tab?.id) return;

    switch (info.menuItemId) {
      case MENU_ID_TAG_USER: {
        // Extract username from the link URL or selected text
        const username = this.extractUsername(info.linkUrl ?? '') ??
                         this.extractUsernameFromText(info.selectionText ?? '');
        if (!username) {
          this.log.warn('Could not extract username from context menu click', {
            linkUrl: info.linkUrl,
            selectionText: info.selectionText,
          });
          return;
        }

        chrome.tabs.sendMessage(tab.id, {
          channel: 'content:open-tag-editor',
          payload: { username, platform: 'x.com' },
        }).catch((e: unknown) => {
          this.log.warn('Could not reach content script for context menu action', { error: String(e) });
        });
        break;
      }

      case MENU_ID_OPEN_POPUP: {
        // Open popup programmatically (requires activeTab permission)
        chrome.action.openPopup().catch(() => {
          // openPopup can fail if the extension doesn't have focus
          this.log.warn('Could not open popup via context menu');
        });
        break;
      }
    }
  }

  // ── Username extraction ───────────────────────────────────────────────────

  private extractUsername(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('x.com') && !u.hostname.includes('twitter.com')) return null;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length !== 1) return null;
      const candidate = parts[0];
      if (!candidate) return null;
      const EXCLUDED = new Set(['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search']);
      if (EXCLUDED.has(candidate)) return null;
      if (!/^[A-Za-z0-9_]{1,50}$/.test(candidate)) return null;
      return candidate.toLowerCase();
    } catch {
      return null;
    }
  }

  private extractUsernameFromText(text: string): string | null {
    const match = text.trim().match(/^@?([A-Za-z0-9_]{1,50})$/);
    return match?.[1]?.toLowerCase() ?? null;
  }
}
