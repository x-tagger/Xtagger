/**
 * @module injection-manager
 * @layer Platforms / X.com
 * @description Creates and manages Shadow DOM containers for tag display.
 *
 * Each tagged user gets one Shadow DOM container injected adjacent to their
 * username element in the feed. Shadow DOM provides complete style isolation —
 * X.com's CSS cannot bleed in, and our CSS cannot bleed out.
 *
 * Container lifecycle:
 *   - Created when tags are first injected for a user element
 *   - Identified by a data attribute so it's not duplicated on re-scan
 *   - Cleaned up when the host element is removed from the DOM
 *   - Uses WeakRef tracking to allow GC of removed elements
 *
 * Tag pill rendering is handled here for Phase 2 (coloured dots).
 * Full interactive pills come in Phase 3.
 *
 * Dependencies: ColorPalette (inline styles only — no external CSS in Shadow DOM)
 */

import type { Tag } from '@core/model/entities';
import type { LoggerPort } from '@core/ports/logger.port';

import { getColor } from '@core/services/color-palette';

// ─── Constants ────────────────────────────────────────────────────────────────

/** data attribute set on the anchor element to prevent double-injection */
const INJECTED_ATTR = 'data-xtagger-injected';

/** data attribute on the shadow host div to allow querying injected containers */
const HOST_ATTR = 'data-xtagger-host';

/** CSS class for tag pill elements inside shadow DOM */
const PILL_CLASS = 'xt-pill';

// ─── InjectionManager ─────────────────────────────────────────────────────────

export class InjectionManager {
  /**
   * WeakRef map: anchor element → shadow host element.
   * WeakRef allows the anchor to be GC'd when removed from DOM.
   */
  private readonly hostRefs = new Map<string, WeakRef<HTMLElement>>();
  private hostIdCounter = 0;
  private readonly log: LoggerPort;

  constructor(logger: LoggerPort) {
    this.log = logger.child('InjectionManager');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Inject tag display for a user into the given anchor element.
   * If tags are already injected for this anchor, updates them in place.
   * If tags is empty, removes any existing injection.
   *
   * @param anchor  - The DOM element adjacent to the username (injectionAnchor)
   * @param tags    - Active tags to display
   * @param displayMode - 'compact' (dots) | 'pills' (text pills) | 'full' | 'hidden'
   */
  inject(
    anchor: Element,
    tags: ReadonlyArray<Tag>,
    displayMode: 'compact' | 'pills' | 'full' | 'hidden' = 'compact',
    username?: string,
  ): void {
    if (displayMode === 'hidden') {
      this.remove(anchor);
      return;
    }

    if (tags.length === 0) {
      this.remove(anchor);
      return;
    }

    const existingHost = this.getExistingHost(anchor);

    if (existingHost) {
      this.renderTags(existingHost, tags, displayMode, username);
    } else {
      this.createInjection(anchor, tags, displayMode, username);
    }
  }

  /**
   * Remove any tag display from an anchor element.
   */
  remove(anchor: Element): void {
    const host = this.getExistingHost(anchor);
    if (host) {
      host.remove();
      anchor.removeAttribute(INJECTED_ATTR);
    }
  }

  /**
   * Remove all injected tag displays from the document.
   * Called on navigation to a page where injection doesn't apply.
   */
  removeAll(): void {
    const hosts = document.querySelectorAll(`[${HOST_ATTR}]`);
    for (const host of hosts) {
      host.remove();
    }
    this.hostRefs.clear();
    this.log.debug('All injections removed');
  }

  /**
   * Whether a given anchor element already has tags injected.
   */
  isInjected(anchor: Element): boolean {
    return anchor.hasAttribute(INJECTED_ATTR);
  }

  /**
   * Return the count of currently active injections (for diagnostics).
   */
  activeCount(): number {
    return document.querySelectorAll(`[${HOST_ATTR}]`).length;
  }

  // ── Private: DOM construction ─────────────────────────────────────────────

  private createInjection(
    anchor: Element,
    tags: ReadonlyArray<Tag>,
    displayMode: 'compact' | 'pills' | 'full',
    username?: string,
  ): void {
    const hostId = `xt-${++this.hostIdCounter}`;

    // Create the shadow host div
    const host = document.createElement('span');
    host.setAttribute(HOST_ATTR, hostId);
    host.style.cssText = 'display:inline-flex;align-items:center;gap:2px;vertical-align:middle;margin-left:4px;';

    // Attach Shadow DOM for style isolation
    const shadow = host.attachShadow({ mode: 'open' });

    // Inject base styles into shadow root
    const style = document.createElement('style');
    style.textContent = this.buildStyles();
    shadow.appendChild(style);

    // Render tag pills into the shadow
    const container = document.createElement('span');
    container.className = 'xt-container';
    shadow.appendChild(container);

    this.renderTagsInto(container, tags, displayMode, username);

    // Mark the anchor as injected
    anchor.setAttribute(INJECTED_ATTR, hostId);

    // Insert the host after the anchor element
    anchor.insertAdjacentElement('afterend', host);

    // Track with WeakRef
    this.hostRefs.set(hostId, new WeakRef(host));

    this.log.debug('Injected', { hostId, tagCount: tags.length, displayMode });
  }

  private renderTags(
    host: HTMLElement,
    tags: ReadonlyArray<Tag>,
    displayMode: 'compact' | 'pills' | 'full',
    username?: string,
  ): void {
    const shadow = host.shadowRoot;
    if (!shadow) return;

    const container = shadow.querySelector('.xt-container');
    if (!container) return;

    // Clear and re-render
    container.innerHTML = '';
    this.renderTagsInto(container as HTMLElement, tags, displayMode, username);
  }

  private renderTagsInto(
    container: HTMLElement,
    tags: ReadonlyArray<Tag>,
    displayMode: 'compact' | 'pills' | 'full',
    username?: string,
  ): void {
    for (const tag of tags) {
      const color = getColor(tag.colorIndex);
      const pill = document.createElement('span');
      pill.className = PILL_CLASS;
      pill.dataset['tagId'] = tag.id;
      pill.dataset['tagName'] = tag.name;
      pill.dataset['colorIndex'] = String(tag.colorIndex);
      if (username) pill.dataset['username'] = username;

      if (displayMode === 'compact') {
        // Coloured dot only — tag name revealed on hover via title
        pill.style.cssText = [
          `background:${color.hex}`,
          'display:inline-block',
          'width:8px',
          'height:8px',
          'border-radius:50%',
          'cursor:default',
          'flex-shrink:0',
        ].join(';');
        pill.title = tag.name + (tag.notes ? ` — ${tag.notes}` : '');

      } else {
        // Pills mode: coloured pill with text
        pill.style.cssText = [
          `background:${color.hex}`,
          `color:${color.textColor}`,
          'display:inline-flex',
          'align-items:center',
          'padding:1px 6px',
          'border-radius:9999px',
          'font-size:11px',
          'font-family:system-ui,sans-serif',
          'font-weight:500',
          'line-height:1.4',
          'cursor:default',
          'white-space:nowrap',
          'max-width:120px',
          'overflow:hidden',
          'text-overflow:ellipsis',
        ].join(';');
        pill.textContent = tag.name;
        pill.title = tag.name + (tag.notes ? ` — ${tag.notes}` : '');
      }

      container.appendChild(pill);
    }
  }

  private buildStyles(): string {
    return `
      :host { display: inline-flex; align-items: center; gap: 2px; }
      .xt-container { display: inline-flex; align-items: center; gap: 3px; flex-wrap: nowrap; }
      .xt-pill { transition: opacity 0.15s ease; }
      .xt-pill:hover { opacity: 0.8; }
    `;
  }

  // ── Private: host lookup ──────────────────────────────────────────────────

  private getExistingHost(anchor: Element): HTMLElement | null {
    const hostId = anchor.getAttribute(INJECTED_ATTR);
    if (!hostId) return null;

    // Check if the host element still exists in the DOM
    const hostEl = anchor.nextElementSibling;
    if (hostEl && hostEl.getAttribute(HOST_ATTR) === hostId) {
      return hostEl as HTMLElement;
    }

    // Host was removed (e.g. by DOM cleanup) — clear the attribute
    anchor.removeAttribute(INJECTED_ATTR);
    return null;
  }
}
