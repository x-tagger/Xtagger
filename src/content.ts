/**
 * @file content.ts
 * @layer Content Script Entry Point
 * @description The content script injected into X.com pages.
 *
 * This is intentionally thin — it wires together adapters and delegates
 * all logic to the core domain and platform adapter.
 *
 * Performance constraints:
 * - Bundle must be < 50KB
 * - No heavy frameworks
 * - Fast initialization (< 16ms)
 * - No blocking calls on the main thread
 *
 * Lifecycle:
 * 1. Initialise platform adapter
 * 2. Connect to background service worker via chrome messaging
 * 3. Start observing DOM mutations
 * 4. On each mutation batch: detect users → lookup tags → inject UI
 *
 * Full implementation: Phase 2 + Phase 3
 */

// Phase 0: minimal scaffold to validate bundle + CSP
console.info('[XTagger] Content script loaded. Version:', typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev');

// Verify we're on a supported page
const SUPPORTED_HOSTS = ['x.com', 'twitter.com'];
const isSupported = SUPPORTED_HOSTS.some((host) => window.location.hostname.endsWith(host));

if (!isSupported) {
  console.warn('[XTagger] Running on unsupported host — passive mode only');
}

// TODO Phase 2: Initialise XPlatformAdapter
// TODO Phase 3: Initialise ChromeAdapter messaging
// TODO Phase 3: Wire up content injection pipeline
// TODO Phase 3: Start MutationObserver

export {};
