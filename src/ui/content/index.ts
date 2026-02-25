/**
 * @file content/index.ts
 * @layer UI / Content Script Entry Point
 * @description Injected into X.com pages. Bootstraps the injection pipeline.
 *
 * BUNDLE SIZE BUDGET: < 50KB total for this entry point + all its imports.
 * Every import here is weighted carefully.
 *
 * Boot sequence:
 *   1. Check the page is X.com (exit silently if not)
 *   2. Load settings from background
 *   3. Load selector config (bundled JSON)
 *   4. Instantiate XPlatformAdapter + InjectionPipeline
 *   5. pipeline.start() — begins observing DOM + navigation
 *
 * The pipeline handles everything from here: tag lookups, injection, updates.
 */

import { EventBus }          from '@core/events/event-bus';
import { ConsoleLogger }     from '@shared/logger';
import { sendMessage }       from '@shared/messages';
import { XPlatformAdapter }  from '@platforms/x.com/x-platform-adapter';
import { InjectionPipeline } from '@platforms/x.com/injection-pipeline';
import { DEFAULT_SETTINGS }  from '@core/model/entities';
import type { ExtensionSettings } from '@core/model/entities';
import type { GetSettingsResponse } from '@shared/messages';

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const logger = new ConsoleLogger('Content', 'warn'); // warn in production, debug in dev

  // Exit immediately if not on X.com / Twitter
  const host = window.location.hostname;
  if (!host.includes('x.com') && !host.includes('twitter.com')) return;

  // Deduplicate: don't initialise twice if the content script fires twice
  if (document.documentElement.hasAttribute('data-xtagger-active')) {
    logger.warn('Content script already active — skipping duplicate init');
    return;
  }
  document.documentElement.setAttribute('data-xtagger-active', '1');

  // Load settings from background (use defaults if background isn't ready yet)
  let settings: ExtensionSettings = DEFAULT_SETTINGS;
  const settingsResult = await sendMessage<GetSettingsResponse>({
    channel: 'settings:get',
    payload: {},
  });
  if (settingsResult.ok && settingsResult.data) {
    settings = settingsResult.data;
  }

  if (settings.displayMode === 'hidden') {
    logger.info('Display mode is hidden — injection disabled');
    return;
  }

  // Load selector config — bundled with the extension
  let selectorConfig: object;
  try {
    const configUrl = chrome.runtime.getURL('selector-configs/x.com.json');
    const res = await fetch(configUrl);
    selectorConfig = await res.json() as object;
  } catch (e) {
    logger.error('Failed to load selector config', { error: String(e) });
    // Fall back to an empty config — injection won't work but won't crash
    selectorConfig = { selectorVersion: 0, lastVerified: '', platform: 'x.com', selectors: {} };
  }

  // Wire up the local EventBus (content script context — separate from background)
  const bus = new EventBus();

  // Instantiate platform adapter and injection pipeline
  const platform = new XPlatformAdapter(bus, logger, selectorConfig);
  const pipeline  = new InjectionPipeline(platform, bus, logger);

  // Start the pipeline — this begins observing DOM mutations
  await pipeline.start(settings);

  logger.info('XTagger content script active', {
    platform: platform.platformId,
    displayMode: settings.displayMode,
  });

  // Listen for settings changes broadcast from the popup (via custom event for now;
  // full chrome.runtime push messaging in Phase 4)
  window.addEventListener('xtagger:settings-changed', (e) => {
    const detail = (e as CustomEvent<Partial<ExtensionSettings>>).detail;
    if (detail.displayMode) {
      bus.emit('settings:changed', { key: 'displayMode', value: detail.displayMode });
    }
  });
}

// Run boot — catch any unexpected errors to prevent crashing X.com
boot().catch((e: unknown) => {
  console.error('[XTagger] Content script boot failed:', e);
  // Remove the active flag so a page reload can try again
  document.documentElement.removeAttribute('data-xtagger-active');
});

export {};
