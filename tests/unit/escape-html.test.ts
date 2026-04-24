import { escapeHtml } from '@shared/escape-html';
import { describe, expect, it } from 'vitest';

describe('escapeHtml', () => {
  describe('each of the 5 characters', () => {
    it('escapes &', () => {
      expect(escapeHtml('&')).toBe('&amp;');
    });
    it('escapes <', () => {
      expect(escapeHtml('<')).toBe('&lt;');
    });
    it('escapes >', () => {
      expect(escapeHtml('>')).toBe('&gt;');
    });
    it('escapes "', () => {
      expect(escapeHtml('"')).toBe('&quot;');
    });
    it("escapes '", () => {
      expect(escapeHtml("'")).toBe('&#39;');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('passes unicode through unchanged', () => {
      expect(escapeHtml('héllo 🏷️ 日本語')).toBe('héllo 🏷️ 日本語');
    });

    it('does not double-escape already-escaped strings', () => {
      // An already-escaped "&amp;" should become "&amp;amp;" — double-escaping
      // IS the correct behaviour because the input is a literal string, not
      // markup. Verify the output is deterministic and reversible.
      expect(escapeHtml('&amp;')).toBe('&amp;amp;');
      expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
    });

    it('throws TypeError on non-string input', () => {
      // @ts-expect-error -- verifying runtime guard
      expect(() => escapeHtml(null)).toThrow(TypeError);
      // @ts-expect-error
      expect(() => escapeHtml(undefined)).toThrow(TypeError);
      // @ts-expect-error
      expect(() => escapeHtml(42)).toThrow(TypeError);
      // @ts-expect-error
      expect(() => escapeHtml({ toString: () => '<x>' })).toThrow(TypeError);
    });
  });

  describe('legitimate user content with special chars', () => {
    it('renders "R&D" as literal text post-escape', () => {
      expect(escapeHtml('R&D')).toBe('R&amp;D');
    });

    it('renders "Sue\'s notes" as literal text post-escape', () => {
      expect(escapeHtml("Sue's notes")).toBe('Sue&#39;s notes');
    });

    it('renders "a < b" as literal text post-escape', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('renders mixed punctuation correctly', () => {
      expect(escapeHtml(`"quoted" & <tagged>`)).toBe('&quot;quoted&quot; &amp; &lt;tagged&gt;');
    });
  });

  describe('XSS payload inertisation', () => {
    it('neutralises <img onerror> attribute injection', () => {
      expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('neutralises attribute-break via double quote', () => {
      expect(escapeHtml('x" onclick=alert(1) y="')).toBe('x&quot; onclick=alert(1) y=&quot;');
    });

    it('neutralises attribute-break via single quote', () => {
      expect(escapeHtml("x' onclick=alert(1) y='")).toBe('x&#39; onclick=alert(1) y=&#39;');
    });

    it('neutralises tag-break via >', () => {
      expect(escapeHtml('"><script>alert(1)</script>')).toBe(
        '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    });
  });
});
