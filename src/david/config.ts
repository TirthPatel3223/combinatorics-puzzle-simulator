import type { Face } from './geometry';
import { CORNER_MM, PADDING_MM } from './stickers';

/**
 * Constants for David's Gear Cube (conceived by David Tzur / Alex Polonsky, designed by Oskar van Deventer,
 * mass-produced by Meffert's). Change them here only.
 *
 * Model units: 1 = the distance from the centre to a face plane = 30 mm (face-to-face 60 mm, matching the
 * TwistyPuzzles Museum entry pkey 3420). Sticker outlines live in `stickers.ts`.
 */
export const EDGE_MM = 60;
/** Model units per millimetre. */
export const MM = 2 / EDGE_MM;

/**
 * Standard Meffert's David's Gear Cube colour scheme (verified across retail and museum photos):
 * White opposite Yellow, Green opposite Blue, Red opposite Orange, with Red on L and Orange on R when
 * White is on U and Green is on F.
 */
export const COLORS: Readonly<Record<Face, string>> = {
  U: '#f5f5f2', // white
  D: '#ffd21f', // yellow
  F: '#11a94f', // green
  B: '#1557d6', // blue
  L: '#d0142c', // red
  R: '#ff6b1a', // orange
};

/**
 * Piece geometry (mm unless noted). Every piece body is a cone from the cube centre over its plateau
 * (the sticker grown by the padding), down to the black core sphere.
 */
export const DIM = {
  /** Plastic margin around every sticker, uniform on every piece. */
  paddingMm: PADDING_MM,
  /** Half-gap left along the x = 0, y = 0, z = 0 cut planes (two neighbours are 2 × gapMm apart). */
  gapMm: 0.15,
  /** Bevel along every cube edge: starts one padding past the outer border of the corner and edge stickers. */
  bevelStartMm: CORNER_MM.ue + PADDING_MM,
  /** Stickers sit just above the plastic plateau. */
  stickerLiftMm: 0.05,
  /** Solid black core sphere that all conical pieces rest on. */
  coreRadiusMm: 27.5,
  /** Rolling-ball rounding of outer plateau rims and bevels (stays within the 0.50 mm padding). */
  roundOuterMm: Math.min(0.4, PADDING_MM - 0.1),
  /** Rolling-ball rounding of inner creases. */
  roundInnerMm: 0.3,
};

export const LOOK = {
  bodyColor: '#141416',
  coreColor: '#0b0b0d',
  segments: 64,
  coreSegments: 96,
  /** Segments per full circle for the rounded joins of the plateau outlines. */
  offsetSegments: 72,
  /** Profiles along each rounded crease, and the largest angle between points of one fillet arc. */
  filletStepMm: 1.0,
  filletArcStepDeg: 15,
};

export const TIMING = {
  /** Duration of a single face quarter turn or 120°/90° gear step. */
  moveMs: 420,
  fastMoveMs: 80,
};
