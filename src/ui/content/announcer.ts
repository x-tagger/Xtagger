/**
 * @module announcer
 * @layer UI / Content
 * @description ARIA live region announcer for screen reader notifications.
 *
 * Uses a visually-hidden div with aria-live so screen readers pick up
 * announcements without disrupting the page layout.
 *
 * Implementation note: we use setTimeout(0) rather than requestAnimationFrame
 * because rAF is not driven by vitest's fake timer system in jsdom, which would
 * make the test suite brittle. The 0ms delay still allows the browser to clear
 * the previous text before setting new text (same screen-reader trick).
 */

const ANNOUNCER_ID = 'xtagger-announcer';

function getOrCreateAnnouncer(politeness: 'polite' | 'assertive'): HTMLElement {
  let el = document.getElementById(ANNOUNCER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ANNOUNCER_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-atomic', 'true');
    // Visually hidden but accessible to screen readers
    el.style.cssText = [
      'position:absolute',
      'width:1px',
      'height:1px',
      'padding:0',
      'margin:-1px',
      'overflow:hidden',
      'clip:rect(0,0,0,0)',
      'white-space:nowrap',
      'border:0',
    ].join(';');
    document.body.appendChild(el);
  }
  el.setAttribute('aria-live', politeness);
  return el;
}

/** Announce a message to screen readers. The element clears after 3 s. */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const el = getOrCreateAnnouncer(politeness);
  // Clear first so repeated identical messages are still announced
  el.textContent = '';
  setTimeout(() => {
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }, 0);
}
