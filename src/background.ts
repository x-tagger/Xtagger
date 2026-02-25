/**
 * @file background.ts
 * @layer Background Service Worker Entry Point
 * @description Manifest V3 service worker. Stateless — rebuilt from IndexedDB on each wake.
 *
 * CRITICAL: MV3 service workers are ephemeral. They start and stop unpredictably.
 * This means:
 * - NO in-memory caches that aren't rebuilt from storage on wake
 * - Every message handler must assume it's the first thing to run
 * - IndexedDB connections must handle reconnection gracefully
 *
 * Responsibilities:
 * - Handle messages from content scripts (tag CRUD, import/export)
 * - Run schema migrations on install/update
 * - Coordinate import/export operations
 * - Broadcast tag updates to content scripts
 *
 * Full implementation: Phase 3
 */

declare const __VERSION__: string;

console.info('[XTagger:BG] Service worker started. Version:', __VERSION__);

// ─── Lifecycle Handlers ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.info('[XTagger:BG] onInstalled', details.reason, 'previous:', details.previousVersion);

  if (details.reason === 'install') {
    // TODO Phase 3: First-run setup (default settings, schema init)
    console.info('[XTagger:BG] Fresh install — initialising defaults');
  }

  if (details.reason === 'update') {
    // TODO Phase 3: Run schema migrations from previousVersion
    console.info('[XTagger:BG] Updated from', details.previousVersion, '— running migrations');
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.info('[XTagger:BG] Browser startup — service worker waking');
  // TODO Phase 3: Verify migrations are current
});

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  // TODO Phase 3: Route messages to appropriate handlers
  // Returning true keeps the message channel open for async responses
  sendResponse({ ok: false, error: { type: 'MESSAGE_UNKNOWN_CHANNEL', channel: 'not-yet-implemented' } });
  return false;
});

export {};
