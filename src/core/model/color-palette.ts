/**
 * @file color-palette.ts
 * @layer Core / Model
 * @description Curated, accessible color palette for tag visualization.
 *
 * Colors are hand-picked for:
 * - Sufficient contrast on both light and dark X.com themes
 * - Distinguishability for common color vision deficiencies (deuteranopia, protanopia)
 * - Aesthetic coherence — they look good together
 *
 * colorIndex in Tag entities references this array. Using indices (not hex values)
 * means we can refine colors in palette updates without breaking existing tags.
 *
 * Standard palette: indices 0-15. Extended (settings unlock): indices 16-31.
 */

import type { PaletteColor } from './entities.ts';

// ─── Standard Palette (0-15) ─────────────────────────────────────────────────

export const STANDARD_PALETTE: readonly PaletteColor[] = [
  // Reds & Pinks
  { name: 'Crimson',    hex: '#E63946', textHex: '#FFFFFF', colorblindSafe: true  }, // 0
  { name: 'Rose',       hex: '#FF6B9D', textHex: '#FFFFFF', colorblindSafe: false }, // 1

  // Oranges & Ambers
  { name: 'Amber',      hex: '#F4A261', textHex: '#1A1A2E', colorblindSafe: true  }, // 2
  { name: 'Tangerine',  hex: '#E76F51', textHex: '#FFFFFF', colorblindSafe: true  }, // 3

  // Yellows
  { name: 'Sunflower',  hex: '#FFD166', textHex: '#1A1A2E', colorblindSafe: true  }, // 4

  // Greens
  { name: 'Emerald',    hex: '#06D6A0', textHex: '#1A1A2E', colorblindSafe: false }, // 5
  { name: 'Forest',     hex: '#2D6A4F', textHex: '#FFFFFF', colorblindSafe: true  }, // 6

  // Blues
  { name: 'Sky',        hex: '#4CC9F0', textHex: '#1A1A2E', colorblindSafe: true  }, // 7
  { name: 'Cobalt',     hex: '#3A86FF', textHex: '#FFFFFF', colorblindSafe: true  }, // 8
  { name: 'Navy',       hex: '#023E8A', textHex: '#FFFFFF', colorblindSafe: true  }, // 9

  // Purples & Violets
  { name: 'Lavender',   hex: '#BDB2FF', textHex: '#1A1A2E', colorblindSafe: true  }, // 10
  { name: 'Violet',     hex: '#7B2FBE', textHex: '#FFFFFF', colorblindSafe: true  }, // 11

  // Neutrals
  { name: 'Slate',      hex: '#6B7280', textHex: '#FFFFFF', colorblindSafe: true  }, // 12
  { name: 'Charcoal',   hex: '#374151', textHex: '#FFFFFF', colorblindSafe: true  }, // 13
  { name: 'Silver',     hex: '#D1D5DB', textHex: '#1A1A2E', colorblindSafe: true  }, // 14

  // Accent
  { name: 'Gold',       hex: '#F59E0B', textHex: '#1A1A2E', colorblindSafe: true  }, // 15
] as const;

// ─── Extended Palette (16-31) — unlocked in settings ────────────────────────

export const EXTENDED_PALETTE: readonly PaletteColor[] = [
  { name: 'Coral',      hex: '#FF6B6B', textHex: '#FFFFFF', colorblindSafe: false }, // 16
  { name: 'Salmon',     hex: '#FA8072', textHex: '#FFFFFF', colorblindSafe: false }, // 17
  { name: 'Peach',      hex: '#FFDAB9', textHex: '#1A1A2E', colorblindSafe: true  }, // 18
  { name: 'Lemon',      hex: '#FFFACD', textHex: '#1A1A2E', colorblindSafe: true  }, // 19
  { name: 'Mint',       hex: '#98FF98', textHex: '#1A1A2E', colorblindSafe: false }, // 20
  { name: 'Sage',       hex: '#87AE73', textHex: '#1A1A2E', colorblindSafe: true  }, // 21
  { name: 'Teal',       hex: '#008080', textHex: '#FFFFFF', colorblindSafe: true  }, // 22
  { name: 'Cyan',       hex: '#00CED1', textHex: '#1A1A2E', colorblindSafe: false }, // 23
  { name: 'Periwinkle', hex: '#CCCCFF', textHex: '#1A1A2E', colorblindSafe: true  }, // 24
  { name: 'Indigo',     hex: '#4B0082', textHex: '#FFFFFF', colorblindSafe: true  }, // 25
  { name: 'Mauve',      hex: '#E0B0FF', textHex: '#1A1A2E', colorblindSafe: true  }, // 26
  { name: 'Plum',       hex: '#8E4585', textHex: '#FFFFFF', colorblindSafe: true  }, // 27
  { name: 'Brown',      hex: '#795548', textHex: '#FFFFFF', colorblindSafe: true  }, // 28
  { name: 'Khaki',      hex: '#C3B091', textHex: '#1A1A2E', colorblindSafe: true  }, // 29
  { name: 'Stone',      hex: '#9E9E9E', textHex: '#1A1A2E', colorblindSafe: true  }, // 30
  { name: 'Onyx',       hex: '#353935', textHex: '#FFFFFF', colorblindSafe: true  }, // 31
] as const;

// ─── Full Palette ─────────────────────────────────────────────────────────────

export const FULL_PALETTE: readonly PaletteColor[] = [...STANDARD_PALETTE, ...EXTENDED_PALETTE];

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Returns the PaletteColor for a given index.
 * Falls back to index 0 (Crimson) if the index is out of range.
 *
 * @param colorIndex The tag's colorIndex field.
 * @param extended Whether to include the extended palette.
 */
export function getPaletteColor(colorIndex: number, extended = false): PaletteColor {
  const palette = extended ? FULL_PALETTE : STANDARD_PALETTE;
  const color = palette[colorIndex];
  // Fallback to first color if index is invalid
  return color ?? (STANDARD_PALETTE[0] as PaletteColor);
}

/**
 * Returns all colorblind-safe colors from the standard palette.
 * Useful for accessibility mode or first-time user suggestions.
 */
export function getColorblindSafePalette(): readonly PaletteColor[] {
  return STANDARD_PALETTE.filter((c) => c.colorblindSafe);
}

/**
 * Validates that a colorIndex is within bounds.
 */
export function isValidColorIndex(index: number, extended = false): boolean {
  const max = extended ? FULL_PALETTE.length - 1 : STANDARD_PALETTE.length - 1;
  return Number.isInteger(index) && index >= 0 && index <= max;
}
