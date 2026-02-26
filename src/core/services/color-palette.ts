/**
 * @module color-palette
 * @layer Core / Services
 * @description Perceptually-uniform colour palette for tag visualisation.
 *
 * Designed in OKLCH colour space (L=lightness, C=chroma, H=hue).
 * 32 colours arranged as two rings of 16:
 *   Base (0–15):     L≈0.73, C≈0.19-0.21 — bright vivid, works on dark bg
 *   Extended (16–31): L≈0.55, C≈0.17-0.19 — darker, saturated, second ring
 *
 * Both rings use hues at 22.5° intervals (360°/16) starting at 15°,
 * giving maximum perceptual separation. Extended ring sits at the same
 * hue angles as base, so each index N and N+16 are the same hue family
 * (one bright, one dark) — intentional for user intuition.
 *
 * Optimised for X.com dark mode + warm display temperatures (night light
 * ~3500K, which effectively dims blue channel ~45%). Blues/violets have
 * slightly boosted chroma to survive the warm shift.
 *
 * Text colours computed from WCAG relative luminance against pill background.
 */

import type { PaletteColor } from '@core/model/entities';

export const COLOR_PALETTE: ReadonlyArray<PaletteColor> = [
  // ── Base palette (0–15): L≈0.73, C≈0.19, hues at 22.5° steps from 15° ──
  { name: 'Flame',      hex: '#FF6B81', textColor: '#0F1117' }, //  0  h=15°
  { name: 'Tangerine',  hex: '#FF7346', textColor: '#0F1117' }, //  1  h=37.5°
  { name: 'Amber',      hex: '#FB8400', textColor: '#0F1117' }, //  2  h=60°
  { name: 'Gold',       hex: '#E19800', textColor: '#0F1117' }, //  3  h=82.5°
  { name: 'Chartreuse', hex: '#BBAC00', textColor: '#0F1117' }, //  4  h=105°
  { name: 'Lime',       hex: '#86BC00', textColor: '#0F1117' }, //  5  h=127.5°
  { name: 'Emerald',    hex: '#27C762', textColor: '#0F1117' }, //  6  h=150°
  { name: 'Jade',       hex: '#00CC9B', textColor: '#0F1117' }, //  7  h=172.5°
  { name: 'Teal',       hex: '#00CACC', textColor: '#0F1117' }, //  8  h=195°
  { name: 'Cerulean',   hex: '#00BFFA', textColor: '#0F1117' }, //  9  h=217.5°
  { name: 'Cobalt',     hex: '#00B0FF', textColor: '#0F1117' }, // 10  h=240°  (+chroma for warm shift)
  { name: 'Iris',       hex: '#599DFF', textColor: '#0F1117' }, // 11  h=262.5°
  { name: 'Violet',     hex: '#9586FF', textColor: '#0F1117' }, // 12  h=285°
  { name: 'Plum',       hex: '#C075FD', textColor: '#0F1117' }, // 13  h=307.5°
  { name: 'Fuchsia',    hex: '#E875E0', textColor: '#0F1117' }, // 14  h=330°
  { name: 'Crimson',    hex: '#FD6DB3', textColor: '#0F1117' }, // 15  h=352.5°

  // ── Extended palette (16–31): L≈0.55, C≈0.17, same hue family as 0–15 ──
  { name: 'Deep Red',   hex: '#C03A51', textColor: '#FFFFFF' }, // 16  h=15°
  { name: 'Rust',       hex: '#C04115', textColor: '#FFFFFF' }, // 17  h=37.5°
  { name: 'Bronze',     hex: '#B55100', textColor: '#FFFFFF' }, // 18  h=60°
  { name: 'Mustard',    hex: '#A16300', textColor: '#FFFFFF' }, // 19  h=82.5°
  { name: 'Olive',      hex: '#827400', textColor: '#FFFFFF' }, // 20  h=105°
  { name: 'Forest',     hex: '#558200', textColor: '#FFFFFF' }, // 21  h=127.5°
  { name: 'Jungle',     hex: '#008B35', textColor: '#FFFFFF' }, // 22  h=150°
  { name: 'Spearmint',  hex: '#008F67', textColor: '#0F1117' }, // 23  h=172.5°
  { name: 'Ocean',      hex: '#008D90', textColor: '#0F1117' }, // 24  h=195°
  { name: 'Denim',      hex: '#008ABC', textColor: '#0F1117' }, // 25  h=217.5°
  { name: 'Indigo',     hex: '#007CD6', textColor: '#0F1117' }, // 26  h=240°
  { name: 'Grape',      hex: '#326CE2', textColor: '#FFFFFF' }, // 27  h=262.5°
  { name: 'Mauve',      hex: '#6554CD', textColor: '#FFFFFF' }, // 28  h=285°
  { name: 'Eggplant',   hex: '#8846BA', textColor: '#FFFFFF' }, // 29  h=307.5°
  { name: 'Orchid',     hex: '#A644A0', textColor: '#FFFFFF' }, // 30  h=330°
  { name: 'Burgundy',   hex: '#B73C7B', textColor: '#FFFFFF' }, // 31  h=352.5°
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getColor = (index: number): PaletteColor => {
  const clamped = Math.max(0, Math.min(index, COLOR_PALETTE.length - 1));
  return COLOR_PALETTE[clamped] ?? COLOR_PALETTE[0]!;
};

export const getBasePalette = (): ReadonlyArray<PaletteColor> =>
  COLOR_PALETTE.slice(0, 16);

export const getExtendedPalette = (): ReadonlyArray<PaletteColor> =>
  COLOR_PALETTE;
