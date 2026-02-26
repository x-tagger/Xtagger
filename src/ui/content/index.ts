/**
 * @file content/index.ts
 * Content script entry point. Injected into X.com pages.
 */

import { EventBus }          from '@core/events/event-bus';
import { ConsoleLogger }     from '@shared/logger';
import { XPlatformAdapter }  from '@platforms/x.com/x-platform-adapter';
import { InjectionPipeline } from '@platforms/x.com/injection-pipeline';
import { HoverTrigger }      from './hover-trigger';
import { TagEditorPopover }  from './tag-editor-popover';
import { DEFAULT_SETTINGS }  from '@core/model/entities';
import type {
  ExtensionSettings,
  Tag,
  UserIdentifier,
} from '@core/model/entities';

function getSettingsWithTimeout(ms: number): Promise<ExtensionSettings | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    try {
      chrome.runtime.sendMessage(
        { channel: 'settings:get', payload: {} },
        (response: { ok: boolean; data?: ExtensionSettings } | undefined) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !response?.ok || !response.data) {
            resolve(null);
          } else {
            resolve(response.data);
          }
        }
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function boot(): Promise<void> {
  const logger = new ConsoleLogger('Content', 'debug');

  console.log(
    '%c 🏷️ XTagger content script loaded ',
    'background:#C49000;color:#0F1117;font-weight:bold;font-size:13px;border-radius:4px;padding:2px 6px'
  );

  const host = window.location.hostname;
  if (!host.includes('x.com') && !host.includes('twitter.com')) return;

  if (document.documentElement.hasAttribute('data-xtagger-active')) return;
  document.documentElement.setAttribute('data-xtagger-active', '1');

  // Load settings (2s timeout, then use defaults)
  let settings: ExtensionSettings = DEFAULT_SETTINGS;
  try {
    const loaded = await getSettingsWithTimeout(2000);
    if (loaded) settings = loaded;
  } catch {
    logger.warn('Settings load failed — using defaults');
  }

  if (settings.displayMode === 'hidden') {
    logger.info('Display mode hidden — not injecting');
    return;
  }

  // Load selector config
  let selectorConfig: object = {
    selectorVersion: 0,
    lastVerified: '',
    platform: 'x.com',
    selectors: {},
  };
  try {
    const res = await fetch(chrome.runtime.getURL('selector-configs/x.com.json'));
    selectorConfig = (await res.json()) as object;
  } catch (e) {
    logger.warn('Selector config load failed', { error: String(e) });
  }

  const bus          = new EventBus();
  const platform     = new XPlatformAdapter(bus, logger, selectorConfig);
  const pipeline     = new InjectionPipeline(platform, bus, logger);
  const popover      = new TagEditorPopover(logger);
  const hoverTrigger = new HoverTrigger(logger);

  function onTagSaved(userId: UserIdentifier, tag: Tag): void {
    bus.emit('tag:created', { tag, userId });
  }
  function onTagDeleted(userId: UserIdentifier, tagId: string): void {
    bus.emit('tag:deleted', { tagId, userId, soft: false });
  }

  hoverTrigger.attach({
    onAddTag(userId, anchor) {
      popover.open({
        mode: 'add',
        userId,
        anchor,
        onSaved:   (tag)   => onTagSaved(userId, tag),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed:  ()      => { /* nothing */ },
      });
    },
    onEditTag(userId, tag, anchor) {
      popover.open({
        mode: 'edit',
        userId,
        anchor,
        existingTag: tag,
        onSaved:   (saved) => onTagSaved(userId, saved),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed:  ()      => { /* nothing */ },
      });
    },
  });

  // Start pipeline (fire and forget — it runs forever via MutationObserver)
  pipeline.start(settings).catch((e: unknown) =>
    logger.error('Pipeline start error', { error: String(e) })
  );

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const msg = message as Record<string, unknown>;

    if (msg['channel'] === 'content:open-tag-editor') {
      const payload  = msg['payload'] as { username: string };
      const username = payload.username;
      const anchor   = document.querySelector('[data-testid="User-Name"]') ?? document.body;
      const userId: UserIdentifier = {
        platform: 'x.com', username, firstSeen: Date.now(), lastSeen: Date.now(),
      };
      popover.open({
        mode: 'add', userId, anchor,
        onSaved:   (tag)   => onTagSaved(userId, tag),
        onDeleted: (tagId) => onTagDeleted(userId, tagId),
        onClosed:  ()      => { /* nothing */ },
      });
    }

    if (msg['channel'] === 'settings:push') {
      const payload    = msg['payload'] as Partial<ExtensionSettings>;
      if (payload.displayMode) {
        bus.emit('settings:changed', { key: 'displayMode', value: payload.displayMode });
      }
    }
  });

  logger.info('XTagger fully active', { displayMode: settings.displayMode });

  // Visible badge confirming content script is running — bottom-right corner
  const badge = document.createElement('div');
  badge.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:14px',
    'z-index:2147483647',
    'background:#C49000',
    'color:#fff',
    'font-family:monospace',
    'font-size:10px',
    'font-weight:bold',
    'padding:3px 8px',
    'border-radius:9999px',
    'opacity:0.85',
    'pointer-events:none',
  ].join(';');
  badge.textContent = '🏷️ XTagger';
  document.body.appendChild(badge);
}

boot().catch((e: unknown) => {
  console.error('[XTagger] Boot failed:', e);
  document.documentElement.removeAttribute('data-xtagger-active');
});

export {};
