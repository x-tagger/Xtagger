/**
 * @file main.ts
 * @layer UI / Popup
 * @description Extension popup entry point. Full implementation in Phase 4.
 */

// Phase 0: render a basic placeholder
document.querySelector('#app')!.innerHTML = `
  <div style="
    width: 320px;
    padding: 16px;
    font-family: system-ui, sans-serif;
    color: #111;
  ">
    <h1 style="font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
      🏷️ XTagger
    </h1>
    <p style="font-size: 13px; color: #666; margin: 0;">
      Extension loaded. Popup UI coming in Phase 4.
    </p>
    <hr style="margin: 12px 0; border: none; border-top: 1px solid #eee;" />
    <p style="font-size: 11px; color: #999; margin: 0;">
      Version: ${typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'}
    </p>
  </div>
`;

export {};
