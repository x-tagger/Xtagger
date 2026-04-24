/**
 * Adversarial render tests for Phase 2c XSS hardening.
 *
 * Verifies that hostile user-authored content, whether typed locally or
 * imported from another account, renders as inert DOM text — never as
 * executable HTML — when interpolated through the popover and popup
 * template-literal patterns wrapped in escapeHtml().
 *
 * Strategy: each test replays the exact interpolation pattern from the
 * fixed site (attribute vs text context), sets innerHTML on a jsdom
 * container, and asserts the resulting DOM is structurally inert — no
 * injected elements, no event-handler attributes, textContent preserves
 * the raw payload.
 */

import type { TypedEventBus } from '@core/events/event-bus';
import type { ExportManifest, Tag } from '@core/model/entities';
import { ExportManifestSchema } from '@core/model/schemas';
import type { LoggerPort } from '@core/ports/logger.port';
import type { StoragePort } from '@core/ports/storage.port';
import { DefaultConflictResolver } from '@core/services/conflict-resolver';
import { ImportExportService } from '@core/services/import-export';
import { ok } from '@core/shared/result';
import { escapeHtml } from '@shared/escape-html';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ─── Adversarial payloads ─────────────────────────────────────────────────────

const PAYLOADS = {
  imgOnerror: '<img src=x onerror="alert(1)">',
  svgOnload: '<svg onload=alert(1)></svg>',
  scriptTag: '"><script>alert(1)</script>',
  attrBreakDq: 'x" onclick="alert(1)" y="',
  attrBreakSq: "x' onclick='alert(1)' y='",
  javascriptUrl: 'javascript:alert(1)',
  dataUrl: 'data:text/html,<script>alert(1)</script>',
  unicodeEscape: '<img src=x onerror=alert(1)>',
  nullByte: 'benign\x00<script>alert(1)</script>',
  mixedQuotes: `"><img src=x onerror='alert(1)'>`,
  textareaBreak: '</textarea><script>alert(1)</script>',
};

// Sites that are executable if injected. innerHTML does NOT run <script>,
// but any of these would fire from an innerHTML write.
const DANGEROUS_TAGS = ['IMG', 'SVG', 'IFRAME', 'OBJECT', 'EMBED', 'SCRIPT'];
const DANGEROUS_ATTRS = [
  'onerror',
  'onload',
  'onclick',
  'onmouseover',
  'onfocus',
  'onanimationstart',
  'onanimationend',
  'ontransitionend',
];

// Attributes that actually interpret "javascript:" or "data:" URLs.
// A literal "javascript:..." inside a data-* or title attribute is harmless.
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'ping', 'cite'];

// Normalise strings that round-trip through the HTML parser: NUL in attribute
// values is replaced with U+FFFD per spec, and the parser may drop NULs in
// text content entirely. Stripping both makes comparisons robust against
// parser policy without weakening the inertness guarantee.
const stripParserNoise = (s: string): string => {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code !== 0x00 && code !== 0xfffd) out += ch;
  }
  return out;
};

function assertInert(container: HTMLElement, rawPayload: string): void {
  // No injected dangerous elements.
  for (const tag of DANGEROUS_TAGS) {
    expect(container.getElementsByTagName(tag).length).toBe(0);
  }
  // No inline event-handler attributes on anything in the subtree.
  const all = container.querySelectorAll('*');
  for (const el of all) {
    for (const attr of DANGEROUS_ATTRS) {
      expect(el.hasAttribute(attr)).toBe(false);
    }
    // javascript:/data: only flagged in URL-bearing attributes.
    for (const urlAttr of URL_ATTRS) {
      const raw = el.getAttribute(urlAttr);
      if (raw !== null) {
        const v = raw.trim().toLowerCase();
        expect(v.startsWith('javascript:')).toBe(false);
        expect(v.startsWith('data:text/html')).toBe(false);
      }
    }
  }
  // textContent preserves the raw payload modulo NUL/U+FFFD round-tripping.
  expect(stripParserNoise(container.textContent ?? '')).toContain(stripParserNoise(rawPayload));
}

// ─── Popover render sites ─────────────────────────────────────────────────────

describe('popover render sites — hostile content renders inert', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('A1/A2 quick-assign pill (attribute + text)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        const safe = escapeHtml(payload);
        container.innerHTML = `<button class="quick-pill" data-name="${safe}">${safe}</button>`;
        assertInert(container, payload);
        // data-name attribute round-trips the raw string (modulo parser NUL handling).
        const btn = container.querySelector('button') as HTMLButtonElement;
        expect(stripParserNoise(btn.dataset.name ?? '')).toBe(stripParserNoise(payload));
        expect(stripParserNoise(btn.textContent ?? '')).toBe(stripParserNoise(payload));
      });
    }
  });

  describe('A3 header title (@username in text)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        const safe = escapeHtml(payload);
        container.innerHTML = `<span class="header-title">Tag @${safe}</span>`;
        assertInert(container, payload);
      });
    }
  });

  describe('A4/A5 existing-pill data attributes (tag id + tag name)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        const safeName = escapeHtml(payload);
        const safeId = escapeHtml(payload);
        container.innerHTML = `<button class="existing-pill" data-tag-id="${safeId}" data-tag-name="${safeName}">${safeName}</button>`;
        assertInert(container, payload);
      });
    }
  });

  describe('A6 title attribute (notes)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        const safe = escapeHtml(payload);
        container.innerHTML = `<button title="${safe}">label</button>`;
        assertInert(container, 'label'); // title attr doesn't show in textContent
        const btn = container.querySelector('button') as HTMLButtonElement;
        expect(stripParserNoise(btn.title)).toBe(stripParserNoise(payload));
        expect(btn.hasAttribute('onclick')).toBe(false);
        expect(btn.hasAttribute('onmouseover')).toBe(false);
      });
    }
  });

  describe('input[value] and textarea content (edit-mode pre-fill)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`input value neutralises: ${label}`, () => {
        const safe = escapeHtml(payload);
        container.innerHTML = `<input type="text" value="${safe}"/>`;
        const input = container.querySelector('input') as HTMLInputElement;
        // Attribute broke into event handlers? Check.
        expect(input.hasAttribute('onclick')).toBe(false);
        expect(input.hasAttribute('onfocus')).toBe(false);
        expect(stripParserNoise(input.value)).toBe(stripParserNoise(payload));
        // No sibling elements were produced by attribute break-out.
        expect(container.children.length).toBe(1);
        expect(container.getElementsByTagName('IMG').length).toBe(0);
        expect(container.getElementsByTagName('SCRIPT').length).toBe(0);
      });

      it(`textarea content neutralises: ${label}`, () => {
        const safe = escapeHtml(payload);
        container.innerHTML = `<textarea>${safe}</textarea>`;
        const ta = container.querySelector('textarea') as HTMLTextAreaElement;
        expect(stripParserNoise(ta.value)).toBe(stripParserNoise(payload));
        expect(container.getElementsByTagName('SCRIPT').length).toBe(0);
      });
    }
  });

  describe('A8 autocomplete item (attribute + text)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        const safe = escapeHtml(payload);
        container.innerHTML = `<div class="autocomplete-item" data-name="${safe}">${safe}</div>`;
        assertInert(container, payload);
      });
    }
  });
});

// ─── Popup render sites ───────────────────────────────────────────────────────

describe('popup render sites — hostile content renders inert', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('tag-pill in user row (attribute title + text)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        // Mirrors popup main.ts:160
        container.innerHTML = `<span class="tag-pill" title="${escapeHtml(payload)}">${escapeHtml(payload)}</span>`;
        assertInert(container, payload);
      });
    }
  });

  describe('search result empty-state (user query in <strong>)', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        // Mirrors popup main.ts:144
        container.innerHTML = `<div class="empty">No results for "<strong>${escapeHtml(payload)}</strong>"</div>`;
        assertInert(container, payload);
      });
    }
  });

  describe('user row data-username attribute', () => {
    for (const [label, payload] of Object.entries(PAYLOADS)) {
      it(`neutralises: ${label}`, () => {
        // Mirrors popup main.ts:164
        container.innerHTML = `<div class="user-row" data-username="${escapeHtml(payload)}">row</div>`;
        const row = container.querySelector('.user-row') as HTMLElement;
        expect(stripParserNoise(row.dataset.username ?? '')).toBe(stripParserNoise(payload));
        expect(row.hasAttribute('onclick')).toBe(false);
        expect(container.children.length).toBe(1);
      });
    }
  });
});

// ─── Import-then-render end-to-end path ───────────────────────────────────────

function makeStubStorage(): StoragePort {
  return {
    getTagsForUser: async () => ok([]),
    queryTags: async () => ok({ users: [], totalCount: 0 }),
    saveTag: async (t: Tag) => ok(t),
    bulkImport: async () => ok({ added: 0, merged: 0, skipped: 0 }),
    deleteTag: async () => ok(undefined),
    updateTag: async (t: Tag) => ok(t),
    getAllTagNames: async () => ok([]),
    getSettings: async () => ok(undefined),
    saveSettings: async () => ok(undefined),
    getMeta: async () => ok(undefined),
    setMeta: async () => ok(undefined),
  } as unknown as StoragePort;
}

function makeStubBus(): TypedEventBus {
  return {
    emit: () => {},
    on: () => () => {},
    off: () => {},
  } as unknown as TypedEventBus;
}

function makeStubLogger(): LoggerPort {
  const noop = () => {};
  const logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  } as unknown as LoggerPort;
  return logger;
}

function makeHostileManifest(payload: string): ExportManifest {
  const tag: Tag = {
    id: '11111111-1111-4111-8111-111111111111',
    name: payload,
    colorIndex: 0,
    notes: payload,
    source: { type: 'local' },
    createdAt: 1000,
    updatedAt: 1000,
  };
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    platform: 'x.com',
    // schema requires 64-char hex; actual value doesn't matter for these tests
    // (checksum mismatch doesn't block parse, only flips checksumValid).
    checksum: 'a'.repeat(64),
    entries: { 'x.com:alice': [tag] },
  };
}

describe('import-then-render: hostile tag survives parseManifest but renders inert', () => {
  const service = new ImportExportService(
    makeStubStorage(),
    makeStubBus(),
    new DefaultConflictResolver(),
    makeStubLogger(),
  );

  it('ExportManifestSchema accepts hostile content verbatim (no strip, no reject)', () => {
    // Confirms the serialisation layer is a passthrough — the fix MUST live
    // at render-time, not at the schema layer.
    const manifest = makeHostileManifest(PAYLOADS.imgOnerror);
    const res = ExportManifestSchema.safeParse(manifest);
    expect(res.success).toBe(true);
    if (res.success) {
      const firstEntry = Object.values(res.data.entries)[0];
      const firstTag = firstEntry?.[0];
      expect(firstTag?.name).toBe(PAYLOADS.imgOnerror);
    }
  });

  for (const [label, payload] of Object.entries(PAYLOADS)) {
    it(`previewImport → popover-pattern render stays inert: ${label}`, async () => {
      const manifest = makeHostileManifest(payload);
      const raw = JSON.stringify(manifest);
      const res = await service.previewImport(raw);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const firstEntry = Object.values(res.value.manifest.entries)[0];
      const parsed = firstEntry?.[0];
      expect(parsed).toBeDefined();
      if (!parsed) return;
      // Content survives the import boundary verbatim.
      expect(parsed.name).toBe(payload);
      expect(parsed.notes).toBe(payload);

      // Render it through the popover existing-pill pattern.
      const container = document.createElement('div');
      const safeName = escapeHtml(parsed.name);
      const safeNotes = escapeHtml(parsed.notes ?? '');
      container.innerHTML = `<button class="existing-pill" data-tag-name="${safeName}" title="${safeNotes}">${safeName}</button>`;
      document.body.appendChild(container);

      assertInert(container, payload);

      container.remove();
    });
  }
});
