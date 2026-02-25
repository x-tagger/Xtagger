/**
 * @file content/index.ts
 * @layer UI / Content Script Entry Point
 * @description Injected into X.com pages. Minimal stub for Phase 1.
 * Full implementation: Phase 2 (platform adapter) + Phase 3 (tag injection UI)
 *
 * BUNDLE SIZE BUDGET: < 50KB. Every import here costs content script weight.
 */

import { sendMessage } from '@shared/messages';

// Verify background is alive on load (useful during development)
sendMessage<{ version: string; schemaVersion: number }>({
  channel: 'extension:ping',
  payload: {},
}).then((result) => {
  if (result.ok) {
    console.debug('[XTagger] Connected to background. Version:', result.data?.version);
  }
}).catch(() => {
  // Background may not be ready yet — this is fine on cold start
});

export {};
