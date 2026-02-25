/**
 * @file content/index.ts
 * @layer UI / Content Script Entry Point
 * @description Injected into X.com pages. Bootstraps the full injection pipeline.
 *
 * Boot sequence:
 *   1. Guard: X.com only, no double-init
 *   2. Load settings from background (fallback: defaults)
 *   3. Load selector config (bundled JSON)
 *   4. Wire: XPlatformAdapter → InjectionPipeline → HoverTrigger → TagEditorPopover
 *   5. Listen for inbound messages: settings:push, content:open-tag-editor
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

  // Prevent double-init
  if (document.documentElement.hasAttribute('data-xtagger-active')) return;
  document.documentElement.setAttribute('data-xtagger-active', '1');

  // Load settings; fall back to defaults if background isn't ready
  let settings: ExtensionSettings = DEFAULT_SETTINGS;
  try {
    const settingsResult = await sendMessage<GetSettingsResponse>({
      channel: 'settings:get',
      payload: {},
    });
    if (settingsResult.ok && settingsResult.data) {
      settings = settingsResult.data;
    }
  } catch {
    logger.warn('Could not load settings from background — using defaults');
  }

  if (settings.displayMode === 'hidden') {
    logger.info('Display mode hidden — injection disabled');
    // Still listen for settings changes so we can re-enable without a reload
    listenForSettingsChange(null, null, null, null);
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

  // Wire the local EventBus
  const bus = new EventBus();

  // Platform adapter + injection pipeline
  const platform = new XPlatformAdapter(bus, logger, selectorConfig);
  const pipeline  = new InjectionPipeline(platform, bus, logger);

  // Tag editor (singleton popover)
  const popover = new TagEditorPopover(logger);

  // Hover trigger
  const hoverTrigger = new HoverTrigger(logger);

  const onTagSaved = (userId: UserIdentifier, tag: Tag): void => {
    bus.emit('tag:created', { tag, userId });
  };
  const onTagDeleted = (userId: UserIdentifier, tagId: string): void => {
    bus.emit('tag:deleted', { tagId, userId });
  };

  hoverTrigger.attach({
    onAddTag: (userId, anchor) => {
      popover.open({
        mode: 'add', userId, anchor,
        onSaved: (tag) => onTagSaved(userId, tag),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed: () => {},
      });
    },
    onEditTag: (userId, tag, anchor) => {
      popover.open({
        mode: 'edit', userId, anchor, existingTag: tag,
        onSaved: (savedTag) => onTagSaved(userId, savedTag),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed: () => {},
      });
    },
  });

  await pipeline.start(settings);

  listenForSettingsChange(bus, pipeline, popover, hoverTrigger);

  // Handle messages from background (context menu, settings push)
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const { channel, payload } = message as { channel?: string; payload?: unknown };

    if (channel === 'content:open-tag-editor') {
      const { username } = payload as { username: string; platform: string };
      const anchor = document.querySelector('[data-testid="User-Name"]') ?? document.body;
      popover.open({
        mode: 'add',
        userId: { platform: 'x.com', username, firstSeen: Date.now(), lastSeen: Date.now() },
        anchor,
        onSaved: (tag) => onTagSaved({ platform: 'x.com', username, firstSeen: 0, lastSeen: 0 }, tag),
        onDeleted: (tagId) => onTagDeleted({ platform: 'x.com', username, firstSeen: 0, lastSeen: 0 }, tagId),
        onClosed: () => {},
      });
    }

    if (channel === 'settings:push') {
      const { displayMode, theme } = payload as Partial<ExtensionSettings>;
      if (displayMode) bus.emit('settings:changed', { key: 'displayMode', value: displayMode });
    }
  });

  logger.info('XTagger active', { platform: platform.platformId, displayMode: settings.displayMode });
}

function listenForSettingsChange(
  bus: EventBus | null,
  pipeline: InjectionPipeline | null,
  _popover: TagEditorPopover | null,
  _hover: HoverTrigger | null,
): void {
  window.addEventListener('xtagger:settings-changed', (e) => {
    const detail = (e as CustomEvent<Partial<ExtensionSettings>>).detail;
    if (detail.displayMode && bus) {
      bus.emit('settings:changed', { key: 'displayMode', value: detail.displayMode });
    }
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

boot().catch((e: unknown) => {
  console.error('[XTagger] Boot failed:', e);
  document.documentElement.removeAttribute('data-xtagger-active');
});

export {};
