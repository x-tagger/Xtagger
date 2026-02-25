import { describe, it, expect } from 'vitest';
import { COLOR_PALETTE, getColor, getBasePalette, getExtendedPalette } from '../../src/core/services/color-palette';

describe('ColorPalette', () => {
  it('has exactly 32 colors', () => {
    expect(COLOR_PALETTE.length).toBe(32);
  });

  it('has exactly 16 base colors', () => {
    expect(getBasePalette().length).toBe(16);
  });

  it('getExtendedPalette returns all 32', () => {
    expect(getExtendedPalette().length).toBe(32);
  });

  it('getColor clamps to valid range', () => {
    expect(getColor(-1)).toEqual(COLOR_PALETTE[0]);
    expect(getColor(999)).toEqual(COLOR_PALETTE[31]);
  });

  it('all hex colors are 7-char strings starting with #', () => {
    for (const c of COLOR_PALETTE) {
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('all colors have unique names', () => {
    const names = COLOR_PALETTE.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
