/**
 * @module failure-notifier
 * @layer Platforms / X.com
 * @description Displays a non-intrusive notification when selector failures are detected.
 *
 * The notification:
 *   - Appears as a small banner at the top of the viewport
 *   - Is dismissible by clicking
 *   - Does NOT block use of the page or extension
 *   - Uses Shadow DOM so X.com's styles can't affect it
 *   - Auto-dismisses after 8 seconds
 *   - Is deduplicated — only one notification shown at a time
 *
 * Text is intentionally reassuring: tags are safe, this is a display issue only.
 */

const NOTIFICATION_ATTR = 'data-xtagger-notice';
const AUTO_DISMISS_MS = 8000;

export class FailureNotifier {
  private activeNotification: HTMLElement | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Show the selector failure notification.
   * Idempotent — if a notification is already showing, this is a no-op.
   */
  showSelectorFailure(): void {
    if (this.activeNotification) return;

    const host = document.createElement('div');
    host.setAttribute(NOTIFICATION_ATTR, 'selector-failure');
    host.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:2147483647', // max z-index
      'max-width:320px',
      'pointer-events:all',
    ].join(';');

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { display: block; }
        .notice {
          background: #1d1f23;
          color: #e7e9ea;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          padding: 10px 14px;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.35);
          border-left: 3px solid #f59e0b;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
        .body { flex: 1; }
        .title { font-weight: 600; margin-bottom: 2px; }
        .message { color: #9ca3af; font-size: 12px; }
        .close {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          font-size: 16px;
          padding: 0;
          line-height: 1;
          flex-shrink: 0;
        }
        .close:hover { color: #e7e9ea; }
      </style>
      <div class="notice">
        <span class="icon">🏷️</span>
        <div class="body">
          <div class="title">Tag display may be affected</div>
          <div class="message">Your tags are safe. X.com may have updated its layout. Check for an XTagger update.</div>
        </div>
        <button class="close" aria-label="Dismiss">✕</button>
      </div>
    `;

    const closeBtn = shadow.querySelector('.close');
    closeBtn?.addEventListener('click', () => this.dismiss());

    document.documentElement.appendChild(host);
    this.activeNotification = host;

    // Auto-dismiss
    this.dismissTimer = setTimeout(() => this.dismiss(), AUTO_DISMISS_MS);
  }

  dismiss(): void {
    if (!this.activeNotification) return;
    this.activeNotification.remove();
    this.activeNotification = null;
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  isShowing(): boolean {
    return this.activeNotification !== null;
  }
}
