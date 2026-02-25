/**
 * @module color-palette
 * @layer Core / Services
 * @description Curated accessible color palette for tag visualization.
 * All 32 colors hand-picked for: contrast, distinguishability (incl. color-vision deficiency),
 * and visual coherence on both X.com light and dark themes.
 *
 * Base palette: indices 0–15 (always shown)
 * Extended palette: indices 16–31 (shown when extendedPalette setting is enabled)
 */

import type { PaletteColor } from '@core/model/entities';

// ─── Palette Definition ───────────────────────────────────────────────────────

export const COLOR_PALETTE: ReadonlyArray<PaletteColor> = [
  // ── Base palette (0–15) ───────────────────────────────────────────────────
  { name: 'Coral Red',       hex: '#E63946', textColor: '#FFFFFF', base: true  },
  { name: 'Tangerine',       hex: '#F4A261', textColor: '#1A1A1A', base: true  },
  { name: 'Amber',           hex: '#E9C46A', textColor: '#1A1A1A', base: true  },
  { name: 'Sage',            hex: '#57CC99', textColor: '#1A1A1A', base: true  },
  { name: 'Teal',            hex: '#22B5BF', textColor: '#1A1A1A', base: true  },
  { name: 'Sky',             hex: '#48CAE4', textColor: '#1A1A1A', base: true  },
  { name: 'Cobalt',          hex: '#4361EE', textColor: '#FFFFFF', base: true  },
  { name: 'Violet',          hex: '#7B2D8B', textColor: '#FFFFFF', base: true  },
  { name: 'Rose',            hex: '#F72585', textColor: '#FFFFFF', base: true  },
  { name: 'Blush',           hex: '#FFAFCC', textColor: '#1A1A1A', base: true  },
  { name: 'Slate',           hex: '#6C757D', textColor: '#FFFFFF', base: true  },
  { name: 'Graphite',        hex: '#343A40', textColor: '#FFFFFF', base: true  },
  { name: 'Mint',            hex: '#B7E4C7', textColor: '#1A1A1A', base: true  },
  { name: 'Lavender',        hex: '#C8B1E4', textColor: '#1A1A1A', base: true  },
  { name: 'Peach',           hex: '#FFCBA4', textColor: '#1A1A1A', base: true  },
  { name: 'Sand',            hex: '#D4A373', textColor: '#1A1A1A', base: true  },

  // ── Extended palette (16–31) ──────────────────────────────────────────────
  { name: 'Crimson',         hex: '#9D0208', textColor: '#FFFFFF', base: false },
  { name: 'Burnt Orange',    hex: '#D62828', textColor: '#FFFFFF', base: false },
  { name: 'Gold',            hex: '#FFD60A', textColor: '#1A1A1A', base: false },
  { name: 'Lime',            hex: '#AACC00', textColor: '#1A1A1A', base: false },
  { name: 'Forest',          hex: '#386641', textColor: '#FFFFFF', base: false },
  { name: 'Emerald',         hex: '#1B998B', textColor: '#FFFFFF', base: false },
  { name: 'Ocean',           hex: '#0077B6', textColor: '#FFFFFF', base: false },
  { name: 'Indigo',          hex: '#3A0CA3', textColor: '#FFFFFF', base: false },
  { name: 'Plum',            hex: '#560BAD', textColor: '#FFFFFF', base: false },
  { name: 'Fuchsia',         hex: '#C77DFF', textColor: '#1A1A1A', base: false },
  { name: 'Dusty Rose',      hex: '#C9A0A0', textColor: '#1A1A1A', base: false },
  { name: 'Warm White',      hex: '#FAF3DD', textColor: '#1A1A1A', base: false },
  { name: 'Ice Blue',        hex: '#CAF0F8', textColor: '#1A1A1A', base: false },
  { name: 'Khaki',           hex: '#A8995A', textColor: '#FFFFFF', base: false },
  { name: 'Steel',           hex: '#5C677D', textColor: '#FFFFFF', base: false },
  { name: 'Charcoal',        hex: '#1A1A2E', textColor: '#FFFFFF', base: false },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getColor = (index: number): PaletteColor => {
  const color = COLOR_PALETTE[Math.max(0, Math.min(index, COLOR_PALETTE.length - 1))];
  // Safe: index is clamped to valid range
  return color ?? COLOR_PALETTE[0]!;
};

export const getBasePalette = (): ReadonlyArray<PaletteColor> =>
  COLOR_PALETTE.filter((c) => c.base);

export const getExtendedPalette = (): ReadonlyArray<PaletteColor> =>
  COLOR_PALETTE;
