/**
 * @module announcer
 * @layer UI / Content
 * @description ARIA live region announcer for screen reader notifications.
 *
 * Provides a polite/assertive announcement mechanism without disrupting
 * the page's own live regions. The announcement element is injected into
 * the page's DOM (not Shadow DOM) so screen readers pick it up.
 *
 * Usage:
 *   announce('Tag "journalist" added to @alice', 'polite');
 */

const ANNOUNCER_ID = 'xtagger-announcer';

function getOrCreateAnnouncer(politeness: 'polite' | 'assertive'): HTMLElement {
  let el = document.getElementById(ANNOUNCER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ANNOUNCER_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    // Visually hidden — screen readers still read it
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

/** Announce a message to screen readers. Clears after 3s. */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const el = getOrCreateAnnouncer(politeness);
  // Clear first (some screen readers don't re-announce same text)
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 3000);
  });
}
