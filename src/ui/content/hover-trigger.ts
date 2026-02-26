/**
 * @module hover-trigger
 * Shows a floating 🏷️ tag button when hovering any username on X.com.
 * The button is position:fixed on document.body so it cannot be clipped.
 */

import type { UserIdentifier } from '@core/model/entities';
import type { Tag }            from '@core/model/entities';
import type { LoggerPort }     from '@core/ports/logger.port';

export interface HoverTriggerCallbacks {
  onAddTag:  (userId: UserIdentifier, anchor: Element) => void;
  onEditTag: (userId: UserIdentifier, tag: Tag, anchor: Element) => void;
}

// Selectors to find a "username container" — tried in order
const NAME_CONTAINER_SELECTORS = [
  '[data-testid="User-Name"]',  // X.com standard (very stable)
  '[data-testid="UserName"]',   // Profile pages
  '[data-testid="user-name"]',  // Alternate casing seen in some builds
  // NOTE: structural fallbacks removed — too broad, matches UserAvatar/follower counts
];

function findNameContainer(target: Element): Element | null {
  for (const sel of NAME_CONTAINER_SELECTORS) {
    try {
      const found = target.closest(sel);
      if (found) return found;
    } catch { /* invalid selector in this browser */ }
  }
  return null;
}

function extractUsername(container: Element): string | null {
  // Try all links in the container — first one whose path is /{username}
  const links = container.querySelectorAll('a[href^="/"]');
  for (const a of links) {
    const href  = (a as HTMLAnchorElement).getAttribute('href') ?? '';
    const parts = href.split('/').filter(Boolean);
    if (parts.length === 1 && /^[A-Za-z0-9_]{1,50}$/.test(parts[0]!)) {
      const EXCLUDED = new Set(['home','explore','notifications','messages',
        'settings','i','login','search','compose','intent','following','followers']);
      if (!EXCLUDED.has(parts[0]!.toLowerCase())) return parts[0]!.toLowerCase();
    }
  }
  // Fallback: find a span starting with @
  for (const span of container.querySelectorAll('span')) {
    const t = span.textContent?.trim() ?? '';
    if (t.startsWith('@') && t.length > 1 && t.length < 52) return t.slice(1).toLowerCase();
  }
  return null;
}

export class HoverTrigger {
  private readonly log: LoggerPort;
  private callbacks:    HoverTriggerCallbacks | null = null;

  private activeIcon:   HTMLElement | null = null;
  private activeTarget: Element     | null = null;
  private hideTimer:    ReturnType<typeof setTimeout> | null = null;

  private readonly onMouseOver: (e: MouseEvent) => void;
  private readonly onClick:     (e: MouseEvent) => void;
  private readonly onScroll:    () => void;

  constructor(logger: LoggerPort) {
    this.log         = logger.child('HoverTrigger');
    this.onMouseOver = this._onMouseOver.bind(this);
    this.onClick     = this._onClick.bind(this);
    this.onScroll    = this._onScroll.bind(this);
  }

  attach(callbacks: HoverTriggerCallbacks): void {
    this.callbacks = callbacks;
    document.addEventListener('mouseover', this.onMouseOver, { passive: true });
    document.addEventListener('click',     this.onClick);
    window.addEventListener(  'scroll',    this.onScroll,   { passive: true, capture: true });
    this.log.info('HoverTrigger attached and listening');
  }

  detach(): void {
    document.removeEventListener('mouseover', this.onMouseOver);
    document.removeEventListener('click',     this.onClick);
    window.removeEventListener(  'scroll',    this.onScroll, { capture: true } as any);
    this._hideIcon();
  }

  private _onMouseOver(e: MouseEvent): void {
    const target = e.target as Element;
    if (!target?.closest) return;

    const container = findNameContainer(target);

    if (!container) {
      // Hovering elsewhere — hide if not hovering the icon
      if (this.activeTarget && !this.activeTarget.contains(target)) {
        const icon = this.activeIcon;
        if (icon && (icon === target || icon.contains(target))) return; // on the icon
        this._scheduleHide();
      }
      return;
    }

    this._cancelHide();
    if (this.activeTarget === container) return; // same element, nothing to do
    this._showIcon(container);
  }

  private _onScroll(): void {
    if (this.activeTarget && this.activeIcon) {
      this._positionIcon(this.activeTarget, this.activeIcon);
    }
  }

  private _onClick(e: MouseEvent): void {
    const target = e.target as Element;

    // Click on the tag button
    const addBtn = target.closest('[data-xtagger-add-btn]') as HTMLElement | null;
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      const username = addBtn.dataset['username'];
      if (!username || !this.callbacks) return;
      const userId: UserIdentifier = { platform: 'x.com', username, firstSeen: Date.now(), lastSeen: Date.now() };
      // Use the hovered User-Name container as anchor (captured before hide removes the button)
      const anchor = this.activeTarget
        ?? document.querySelector(`[data-xtagger-injected]`)
        ?? addBtn;
      const cb = this.callbacks;
      this._hideIcon(); // hide first so button isn't in DOM during popover positioning
      cb.onAddTag(userId, anchor);
      return;
    }

    // Click on existing tag pill — pills live inside Shadow DOM so we must
    // use composedPath() to find the actual clicked element across the boundary
    const path = e.composedPath() as Element[];
    const pill = path.find(el => (el as HTMLElement).dataset?.['tagId']) as HTMLElement | null;
    if (pill && this.callbacks) {
      e.preventDefault();
      e.stopPropagation();
      const { tagId, tagName, username } = pill.dataset as Record<string, string>;
      if (!tagId || !tagName || !username) return;
      const userId: UserIdentifier = { platform: 'x.com', username, firstSeen: 0, lastSeen: 0 };
      const tag: Tag = {
        id: tagId, name: tagName,
        colorIndex: Number(pill.dataset['colorIndex'] ?? 0),
        source: { type: 'local' }, createdAt: 0, updatedAt: 0,
      };
      // Use the shadow host as anchor for popover positioning
      const host = path.find(el => el.getAttribute?.('data-xtagger-host')) as Element ?? pill;
      this.callbacks.onEditTag(userId, tag, host);
    }
  }

  private _showIcon(container: Element): void {
    this._hideIcon();
    this.activeTarget = container;

    const username = extractUsername(container);
    if (!username) {
      this.log.debug('Could not extract username from container', { html: container.innerHTML.slice(0, 200) });
      return;
    }

    const icon = document.createElement('button');
    icon.setAttribute('data-xtagger-add-btn', '1');
    icon.dataset['username'] = username;
    icon.title = `Tag @${username} with XTagger`;

    // Styling — position:fixed so nothing in X.com's layout can clip it
    icon.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'display:inline-flex',
      'align-items:center',
      'gap:4px',
      'padding:3px 9px 3px 6px',
      'border-radius:9999px',
      'border:1.5px solid rgba(212,160,0,0.7)',
      'background:rgba(212,160,0,0.12)',
      'color:#D4A000',
      'font-size:12px',
      'font-weight:700',
      'font-family:system-ui,sans-serif',
      'line-height:1.4',
      'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
      'opacity:0.95',
      'transition:opacity 0.15s,background 0.12s',
      'pointer-events:auto',
    ].join(';');
    icon.innerHTML = '🏷️ <span style="font-size:11px;letter-spacing:0.02em">tag</span>';

    icon.addEventListener('mouseenter', () => {
      this._cancelHide();
      icon.style.opacity    = '1';
      icon.style.background = 'rgba(212,160,0,0.25)';
    });
    icon.addEventListener('mouseleave', () => {
      icon.style.opacity    = '0.95';
      icon.style.background = 'rgba(212,160,0,0.12)';
      this._scheduleHide();
    });

    document.body.appendChild(icon);
    this.activeIcon = icon;
    this._positionIcon(container, icon);

    this.log.debug('Tag icon shown', { username });
  }

  private _positionIcon(container: Element, icon: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      icon.style.display = 'none';
      return;
    }
    icon.style.display = 'inline-flex';

    // On profile pages, the User-Name container spans the full column width.
    // Use the first inline text span's right edge instead of the container's.
    let refRight = rect.right;
    let refTop   = rect.top;
    let refHeight = rect.height;
    if (rect.width > 300) {
      // Find the rightmost visible text span within the container
      const spans = Array.from(container.querySelectorAll('span'))
        .filter(s => s.textContent?.trim() && s.getBoundingClientRect().width > 0);
      if (spans.length > 0) {
        const spanRects = spans.map(s => s.getBoundingClientRect());
        refRight  = Math.max(...spanRects.map(r => r.right));
        refTop    = Math.min(...spanRects.map(r => r.top));
        refHeight = Math.max(...spanRects.map(r => r.bottom)) - refTop;
      }
    }

    const top  = refTop + (refHeight / 2) - 11;
    const left = refRight + 8;
    icon.style.top  = `${Math.max(4, top)}px`;
    icon.style.left = `${Math.min(window.innerWidth - 80, left)}px`;
  }

  private _hideIcon(): void {
    this.activeIcon?.remove();
    this.activeIcon  = null;
    this.activeTarget = null;
  }

  private _scheduleHide(): void {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => { this.hideTimer = null; this._hideIcon(); }, 600);
  }

  private _cancelHide(): void {
    if (!this.hideTimer) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}
