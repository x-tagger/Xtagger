/**
 * @module injection-manager
 * @layer Platforms / X.com
 * @description Renders tag pills into the X.com DOM via Shadow DOM hosts.
 *
 * Display modes:
 *   compact  — named oval pills, up to MAX_VISIBLE, then "+N more" overflow pill
 *   pills    — same as compact (alias)
 *   hidden   — removes all injections
 *
 * Pills are injected into a Shadow DOM span appended after the User-Name container,
 * so X.com styles cannot bleed in or out.
 */

import type { Tag }        from '@core/model/entities';
import type { LoggerPort } from '@core/ports/logger.port';
import { getColor }        from '@core/services/color-palette';

// ─── Constants ────────────────────────────────────────────────────────────────

const INJECTED_ATTR = 'data-xtagger-injected';
const HOST_ATTR     = 'data-xtagger-host';
const MAX_VISIBLE   = 3; // pills shown before "+N more" collapse

// ─── InjectionManager ─────────────────────────────────────────────────────────

export class InjectionManager {
  private readonly hostRefs  = new Map<string, WeakRef<Element>>();
  private hostIdCounter = 0;
  private readonly log: LoggerPort;

  constructor(logger: LoggerPort) {
    this.log = logger.child('InjectionManager');
  }

  inject(
    anchor:      Element,
    tags:        ReadonlyArray<Tag>,
    _mode:       string,   // 'compact' | 'pills' | 'hidden' — we ignore mode, always use pills
    username?:   string,
  ): void {
    if (tags.length === 0) { this.remove(anchor); return; }

    const existing = this.getExistingHost(anchor);
    if (existing) {
      this.renderTags(existing, tags, username);
    } else {
      this.createInjection(anchor, tags, username);
    }
  }

  remove(anchor: Element): void {
    const existing = this.getExistingHost(anchor);
    if (existing) {
      existing.remove();
      anchor.removeAttribute(INJECTED_ATTR);
    }
  }

  removeAll(): void {
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach(h => h.remove());
    this.hostRefs.clear();
    // Also clear the injected marker from anchors
    document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach(a =>
      a.removeAttribute(INJECTED_ATTR));
    this.log.debug('All injections removed');
  }

  isInjected(anchor: Element): boolean {
    return anchor.hasAttribute(INJECTED_ATTR);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private createInjection(anchor: Element, tags: ReadonlyArray<Tag>, username?: string): void {
    const hostId = `xt-${++this.hostIdCounter}`;
    const host   = document.createElement('span');
    host.setAttribute(HOST_ATTR, hostId);
    host.style.cssText =
      'display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-left:5px;flex-shrink:0;';

    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = this.css();
    root.appendChild(style);

    const container = document.createElement('span');
    container.className = 'xt-container';
    root.appendChild(container);

    this.renderTagsInto(container, tags, username);

    anchor.setAttribute(INJECTED_ATTR, hostId);
    anchor.insertAdjacentElement('afterend', host);
    this.hostRefs.set(hostId, new WeakRef(host));
    this.log.debug('Injected', { hostId, tagCount: tags.length });
  }

  private renderTags(host: Element, tags: ReadonlyArray<Tag>, username?: string): void {
    const root = host.shadowRoot;
    if (!root) return;
    const container = root.querySelector<HTMLElement>('.xt-container');
    if (!container) return;
    container.innerHTML = '';
    this.renderTagsInto(container, tags, username);
  }

  private renderTagsInto(
    container: HTMLElement,
    tags:      ReadonlyArray<Tag>,
    username?: string,
  ): void {
    const visible  = tags.slice(0, MAX_VISIBLE);
    const overflow = tags.slice(MAX_VISIBLE);

    for (const tag of visible) {
      const c    = getColor(tag.colorIndex);
      const pill = document.createElement('span');
      pill.className = 'xt-pill';
      pill.dataset['tagId']      = tag.id;
      pill.dataset['tagName']    = tag.name;
      pill.dataset['colorIndex'] = String(tag.colorIndex);
      if (username) pill.dataset['username'] = username;

      pill.style.cssText = [
        `background:${c.hex}`,
        `color:${c.textColor}`,
        'display:inline-flex',
        'align-items:center',
        'padding:2px 8px',
        'border-radius:9999px',
        'font-size:11px',
        'font-family:system-ui,sans-serif',
        'font-weight:600',
        'line-height:1.4',
        'cursor:default',
        'white-space:nowrap',
        'max-width:110px',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'letter-spacing:0.01em',
      ].join(';');

      pill.textContent = tag.name;
      pill.title       = tag.name + (tag.notes ? ` — ${tag.notes}` : '');
      // Stagger: each pill pops in 60ms after the previous
      const idx = container.childElementCount;
      pill.style.animationDelay = `${idx * 60}ms`;
      container.appendChild(pill);
    }

    if (overflow.length > 0) {
      const more = document.createElement('span');
      more.className = 'xt-pill xt-more';
      more.style.cssText = [
        'background:#2a2d36',
        'color:#9ca3af',
        'display:inline-flex',
        'align-items:center',
        'padding:2px 7px',
        'border-radius:9999px',
        'font-size:11px',
        'font-family:system-ui,sans-serif',
        'font-weight:600',
        'line-height:1.4',
        'cursor:default',
        'white-space:nowrap',
      ].join(';');
      more.textContent = `+${overflow.length}`;
      more.title = overflow.map(t => t.name).join(', ');
      container.appendChild(more);
    }
  }

  private css(): string {
    return `
      @keyframes xt-popin {
        0%   { transform: scale(0.5); opacity: 0; }
        70%  { transform: scale(1.12); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      :host { display: inline-flex; align-items: center; }
      .xt-container { display: inline-flex; align-items: center; gap: 3px; flex-wrap: nowrap; }
      .xt-pill { transition: opacity 0.15s; animation: xt-popin 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }
      .xt-pill:hover { opacity: 0.8; }
    `;
  }

  private getExistingHost(anchor: Element): Element | null {
    const id   = anchor.getAttribute(INJECTED_ATTR);
    if (!id) return null;
    const next = anchor.nextElementSibling;
    if (next?.getAttribute(HOST_ATTR) === id) return next;
    // Host was removed from DOM (e.g. X.com re-rendered) — clear stale attr
    anchor.removeAttribute(INJECTED_ATTR);
    return null;
  }
}
