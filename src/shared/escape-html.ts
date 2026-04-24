/**
 * @module escape-html
 * @layer Shared
 * @description HTML entity escape for untrusted string interpolation into DOM
 * markup. Covers the 5 characters meaningful in both text and attribute
 * contexts, so a single call suffices for `<div>${x}</div>` and
 * `<div title="${x}">` alike.
 *
 * Not a sanitiser — does not allow any HTML. Use textContent/createElement
 * where structure matters; use this where template-literal ergonomics win.
 */

const ENTITY_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  if (typeof s !== 'string') {
    throw new TypeError(`escapeHtml: expected string, got ${typeof s}`);
  }
  return s.replace(/[&<>"']/g, (c) => ENTITY_MAP[c] ?? c);
}
