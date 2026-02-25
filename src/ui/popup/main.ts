/**
 * @file popup/main.ts
 * @layer UI / Popup Entry Point
 * @description Extension popup. Stub for Phase 1.
 * Full Svelte/Preact popup UI: Phase 4.
 */

import { sendMessage } from '@shared/messages';

async function init(): Promise<void> {
  const result = await sendMessage<{ version: string; schemaVersion: number }>({
    channel: 'extension:ping',
    payload: {},
  });

  const app = document.getElementById('app');
  if (!app) return;

  if (result.ok && result.data) {
    app.innerHTML = `
      <div style="padding: 1rem;">
        <strong>XTagger</strong> v${result.data.version}<br/>
        <small>Schema: v${result.data.schemaVersion} · Popup UI coming in Phase 4</small>
      </div>
    `;
  } else {
    app.innerHTML = '<div style="padding: 1rem; color: #c00;">Background not available</div>';
  }
}

init().catch(console.error);
