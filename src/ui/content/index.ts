/**
 * @file content/index.ts
 * @layer UI / Content Script Entry Point
 * @description Injected into X.com pages. Bootstraps the full injection pipeline
 * including the tag editor popover and hover trigger.
 *
 * BUNDLE SIZE BUDGET: < 50KB total.
 *
 * Boot sequence:
 *   1. Guard against duplicate init
 *   2. Check hostname is X.com / Twitter
 *   3. Load settings from background
 *   4. Load selector config (bundled JSON via chrome.runtime.getURL)
 *   5. Instantiate XPlatformAdapter → InjectionPipeline → HoverTrigger
 *   6. Start pipeline + attach hover trigger
 */

import { EventBus }           from '@core/events/event-bus';
import { ConsoleLogger }      from '@shared/logger';
import { sendMessage }        from '@shared/messages';
import { XPlatformAdapter }   from '@platforms/x.com/x-platform-adapter';
import { InjectionPipeline }  from '@platforms/x.com/injection-pipeline';
import { HoverTrigger }       from './hover-trigger';
import { TagEditorPopover }   from './tag-editor-popover';
import { DEFAULT_SETTINGS }   from '@core/model/entities';
import type { ExtensionSettings } from '@core/model/entities';
import type { Tag, UserIdentifier } from '@core/model/entities';
import type { GetSettingsResponse } from '@shared/messages';

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const logger = new ConsoleLogger('Content', 'warn');

  // Only run on X.com / Twitter
  const host = window.location.hostname;
  if (!host.includes('x.com') && !host.includes('twitter.com')) return;

  // Prevent double-init (content script can be injected multiple times)
  if (document.documentElement.hasAttribute('data-xtagger-active')) return;
  document.documentElement.setAttribute('data-xtagger-active', '1');

  // Load settings; fall back to defaults if background isn't ready
  let settings: ExtensionSettings = DEFAULT_SETTINGS;
  const settingsResult = await sendMessage<GetSettingsResponse>({
    channel: 'settings:get',
    payload: {},
  });
  if (settingsResult.ok && settingsResult.data) {
    settings = settingsResult.data;
  }

  if (settings.displayMode === 'hidden') {
    logger.info('Display mode hidden — injection disabled');
    return;
  }

  // Load bundled selector config
  let selectorConfig: object = { selectorVersion: 0, lastVerified: '', platform: 'x.com', selectors: {} };
  try {
    const res = await fetch(chrome.runtime.getURL('selector-configs/x.com.json'));
    selectorConfig = await res.json() as object;
  } catch (e) {
    logger.error('Failed to load selector config', { error: String(e) });
  }

  // Wire up the content-script-local EventBus
  const bus = new EventBus();

  // Platform adapter + injection pipeline
  const platform = new XPlatformAdapter(bus, logger, selectorConfig);
  const pipeline  = new InjectionPipeline(platform, bus, logger);

  // Tag editor popover (singleton — one open at a time)
  const popover = new TagEditorPopover(logger);

  // Hover trigger — shows 🏷️ icon on username hover
  const hoverTrigger = new HoverTrigger(logger);

  const onTagSaved = (userId: UserIdentifier, tag: Tag): void => {
    // Emit to local bus so pipeline invalidates cache and re-injects
    bus.emit('tag:created', { tag, userId });
  };

  const onTagDeleted = (userId: UserIdentifier, tagId: string): void => {
    bus.emit('tag:deleted', { tagId, userId });
  };

  hoverTrigger.attach({
    onAddTag: (userId: UserIdentifier, anchor: Element) => {
      popover.open({
        mode: 'add',
        userId,
        anchor,
        onSaved: (tag) => onTagSaved(userId, tag),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed: () => {},
      });
    },
    onEditTag: (userId: UserIdentifier, tag: Tag, anchor: Element) => {
      popover.open({
        mode: 'edit',
        userId,
        anchor,
        existingTag: tag,
        onSaved: (savedTag) => onTagSaved(userId, savedTag),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed: () => {},
      });
    },
  });

  // Start the injection pipeline
  await pipeline.start(settings);

  logger.info('XTagger active', {
    platform: platform.platformId,
    displayMode: settings.displayMode,
  });

  // Listen for settings-changed broadcasts from the popup
  window.addEventListener('xtagger:settings-changed', (e) => {
    const detail = (e as CustomEvent<Partial<ExtensionSettings>>).detail;
    if (detail.displayMode) {
      bus.emit('settings:changed', { key: 'displayMode', value: detail.displayMode });
    }
  });
}

boot().catch((e: unknown) => {
  console.error('[XTagger] Boot failed:', e);
  document.documentElement.removeAttribute('data-xtagger-active');
});

export {};
