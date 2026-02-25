/**
 * @module hover-trigger
 * @layer UI / Content
 * @description Attaches hover listeners to username anchor elements.
 * Shows a small 🏷️ tag icon on hover that, when clicked, opens the TagEditorPopover.
 *
 * Also listens for clicks on existing tag pills (from InjectionManager) to open
 * the editor in "edit" mode for that tag.
 *
 * Implementation notes:
 * - Uses event delegation on the document (one listener, not per-element) for performance
 * - The trigger icon is injected into the same Shadow DOM host as tag pills
 * - Pointer events are carefully managed so the icon doesn't interfere with X.com clicks
 *
 * Dependencies: TypedEventBus (to notify pipeline of user interactions)
 */

import type { UserIdentifier } from '@core/model/entities';
import type { Tag } from '@core/model/entities';
import type { LoggerPort } from '@core/ports/logger.port';

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface HoverTriggerCallbacks {
  /** User wants to add a new tag to this user */
  onAddTag: (userId: UserIdentifier, anchor: Element) => void;
  /** User wants to edit an existing tag */
  onEditTag: (userId: UserIdentifier, tag: Tag, anchor: Element) => void;
}

// ─── HoverTrigger ─────────────────────────────────────────────────────────────

export class HoverTrigger {
  private readonly log: LoggerPort;
  private readonly boundMouseOver: (e: MouseEvent) => void;
  private readonly boundClick: (e: MouseEvent) => void;
  private activeIcon: HTMLElement | null = null;
  private activeTarget: Element | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: HoverTriggerCallbacks | null = null;

  constructor(logger: LoggerPort) {
    this.log = logger.child('HoverTrigger');
    this.boundMouseOver = this.onMouseOver.bind(this);
    this.boundClick = this.onClick.bind(this);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  attach(callbacks: HoverTriggerCallbacks): void {
    this.callbacks = callbacks;
    document.addEventListener('mouseover', this.boundMouseOver, { passive: true });
    document.addEventListener('click', this.boundClick);
    this.log.debug('HoverTrigger attached');
  }

  detach(): void {
    document.removeEventListener('mouseover', this.boundMouseOver);
    document.removeEventListener('click', this.boundClick);
    this.hideIcon();
    this.log.debug('HoverTrigger detached');
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  private onMouseOver(e: MouseEvent): void {
    const target = e.target as Element;

    // Check if hovering over a User-Name container or child of one
    const nameContainer = target.closest('[data-testid="User-Name"]');
    if (!nameContainer) {
      // If moving away from the active target, start hide timer
      if (this.activeTarget && !this.activeTarget.contains(target)) {
        this.scheduleHide();
      }
      return;
    }

    // Cancel any pending hide
    this.cancelHide();

    // Already showing icon for this container
    if (this.activeTarget === nameContainer) return;

    this.showIcon(nameContainer);
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as Element;

    // Click on the tag icon → open add-tag popover
    if (target.closest('[data-xtagger-add-btn]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = target.closest('[data-xtagger-add-btn]') as HTMLElement;
      const username = btn.dataset['username'];
      if (!username || !this.callbacks) return;

      const userId: UserIdentifier = {
        platform: 'x.com',
        username,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      };
      const anchor = document.querySelector(`[data-xtagger-injected][data-username="${username}"]`)
        ?? btn.closest('[data-testid="User-Name"]')!;
      this.callbacks.onAddTag(userId, anchor);
      this.hideIcon();
      return;
    }

    // Click on an existing tag pill → open edit popover
    const pill = target.closest('[data-tag-id]') as HTMLElement | null;
    if (pill && this.callbacks) {
      e.preventDefault();
      e.stopPropagation();
      const tagId    = pill.dataset['tagId'];
      const tagName  = pill.dataset['tagName'];
      const username = pill.dataset['username'];
      if (!tagId || !tagName || !username) return;

      // Build minimal tag + userId (full data fetched by popover)
      const userId: UserIdentifier = { platform: 'x.com', username, firstSeen: 0, lastSeen: 0 };
      const tag: Tag = {
        id: tagId,
        name: tagName,
        colorIndex: Number(pill.dataset['colorIndex'] ?? 0),
        source: { type: 'local' },
        createdAt: 0,
        updatedAt: 0,
      };
      this.callbacks.onEditTag(userId, tag, pill);
    }
  }

  // ── Icon rendering ────────────────────────────────────────────────────────

  private showIcon(nameContainer: Element): void {
    this.hideIcon();
    this.activeTarget = nameContainer;

    // Extract username from the container's link
    const link = nameContainer.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
    if (!link) return;

    const href = link.href;
    const parts = new URL(href).pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return;
    const username = parts[0];
    if (!username) return;

    // Create floating icon button
    const icon = document.createElement('button');
    icon.setAttribute('data-xtagger-add-btn', '1');
    icon.dataset['username'] = username;
    icon.title = `Tag @${username}`;
    icon.style.cssText = [
      'background:none',
      'border:none',
      'cursor:pointer',
      'padding:0 2px',
      'font-size:12px',
      'line-height:1',
      'opacity:0.6',
      'transition:opacity 0.15s',
      'vertical-align:middle',
      'display:inline-flex',
      'align-items:center',
    ].join(';');
    icon.textContent = '🏷️';
    icon.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
    icon.addEventListener('mouseleave', () => { icon.style.opacity = '0.6'; });

    // Insert after the name container
    nameContainer.insertAdjacentElement('afterend', icon);
    this.activeIcon = icon;
  }

  private hideIcon(): void {
    if (this.activeIcon) {
      this.activeIcon.remove();
      this.activeIcon = null;
    }
    this.activeTarget = null;
  }

  private scheduleHide(): void {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hideIcon();
    }, 300);
  }

  private cancelHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
