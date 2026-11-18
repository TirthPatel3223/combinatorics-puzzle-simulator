import { type Vec3, dot, normalize } from '../puzzle/vec';

/**
 * Geometry and slots of David's Gear Cube.
 *
 * Model frame: x = R (+1), L (-1); y = U (+1), D (-1); z = F (+1), B (-1); cube is [-1, 1]^3
 * (1 unit = 30 mm).
 *
 * The three orthogonal 2x2x2 cut planes (x = 0, y = 0, z = 0) split the cube into 8 octants.
 * Every octant holds:
 *  - 1 corner gear (9 teeth total around its 3-fold body diagonal; 3 teeth per face);
 *  - 3 face-centre gear sectors (1 on each of the octant's 3 faces; 4 sectors per face form a
 *    12-tooth face-centre gear);
 *  - 3 half-edge posts (1 at each of the octant's 3 cube-edge corners, with 2 bar stickers each).
 *
 * To preserve perspective (just like fixing a reference block on a 2x2x2), the DBR octant frame
 * (+1, -1, -1) is kept fixed during face turns, so the active face moves are U, F and L. The
 * corner-turning gear move (G / G') is controlled by the opposite corner pair UFL and DBR: it leaves
 * all 8 octant frames (the 24 half-edge posts) stationary, rotates all 8 corner gears 120° in place
 * about their outward body diagonals, and drives all 6 face-centre gears 90° in the opposite sense
 * about their outward face normals (9:12 = 3:4 gear ratio).
 */

export type Face = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';
export const FACES: readonly Face[] = ['U', 'D', 'F', 'B', 'L', 'R'];

/** The three face turns that do not move the fixed DBR reference corner. */
export type TurnFace = 'U' | 'F' | 'L';
export const TURN_FACES: readonly TurnFace[] = ['U', 'F', 'L'];

/** The fixed reference corner octant (untouched by U, F and L face turns). */
export const FIXED_CORNER = 'DBR';
/** The pair of opposite corners that trigger the gear turn G / G' when clicked. */
export const CONTROL_CORNERS: readonly [string, string] = ['UFL', 'DBR'];

export const FACE_NORMAL: Readonly<Record<Face, Vec3>> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

/** Face whose outward normal is (within 1e-6) the unit vector v, or null. */
export function faceOf(v: Vec3): Face | null {
  for (const f of FACES) {
    const n = FACE_NORMAL[f];
    if (Math.abs(n[0] - v[0]) < 1e-6 && Math.abs(n[1] - v[1]) < 1e-6 && Math.abs(n[2] - v[2]) < 1e-6) return f;
  }
  return null;
}

export interface CornerSlot {
  readonly index: number;
  readonly name: string;
  /** Sign vector (±1, ±1, ±1). */
  readonly sign: Vec3;
  /** Outward unit body-diagonal axis. */
  readonly dir: Vec3;
  /** The three faces meeting at this corner. */
  readonly faces: readonly Face[];
}

export interface CentreSlot {
  readonly index: number;
  /** e.g. "F:UFR" for the UFR quadrant of the F face centre gear. */
  readonly name: string;
  readonly face: Face;
  /** Corner/octant slot index (0-7) this sector sits in. */
  readonly octant: number;
  /** Unit direction of `3 * n_face + sign_octant` (unique across all 24 centre sector slots). */
  readonly dir: Vec3;
}

export interface EdgeSlot {
  readonly index: number;
  /** e.g. "FR:UFR" for the UFR half of the FR cube edge. */
  readonly name: string;
  /** Corner/octant slot index (0-7) this half-edge post belongs to. */
  readonly octant: number;
  /** The two faces sharing this cube edge. */
  readonly faces: readonly [Face, Face];
  /** The third face of the octant (determines which side of the mid-edge cut plane this post is on). */
  readonly sideFace: Face;
  /** Unit direction of `2 * (n_f1 + n_f2) + n_side` (unique across all 24 half-edge slots). */
  readonly dir: Vec3;
}

function cornerName(s: Vec3): string {
  return `${s[1] > 0 ? 'U' : 'D'}${s[2] > 0 ? 'F' : 'B'}${s[0] > 0 ? 'R' : 'L'}`;
}

function buildCorners(): CornerSlot[] {
  const out: CornerSlot[] = [];
  for (const sy of [1, -1]) {
    for (const sz of [1, -1]) {
      for (const sx of [1, -1]) {
        const sign: Vec3 = [sx, sy, sz];
        out.push({
          index: out.length,
          name: cornerName(sign),
          sign,
          dir: normalize(sign),
          faces: FACES.filter((f) => dot(FACE_NORMAL[f], sign) > 0),
        });
      }
    }
  }
  return out;
}

export const CORNER_SLOTS: readonly CornerSlot[] = buildCorners();

function buildCentres(): CentreSlot[] {
  const out: CentreSlot[] = [];
  for (const f of FACES) {
    const nf = FACE_NORMAL[f];
    CORNER_SLOTS.forEach((c, octant) => {
      if (dot(nf, c.sign) <= 0) return;
      const dir = normalize([3 * nf[0] + c.sign[0], 3 * nf[1] + c.sign[1], 3 * nf[2] + c.sign[2]]);
      out.push({ index: out.length, name: `${f}:${c.name}`, face: f, octant, dir });
    });
  }
  return out;
}

export const CENTRE_SLOTS: readonly CentreSlot[] = buildCentres();

const FACE_RANK: Readonly<Record<Face, number>> = { U: 0, D: 0, F: 1, B: 1, R: 2, L: 2 };

function buildEdges(): EdgeSlot[] {
  const out: EdgeSlot[] = [];
  CORNER_SLOTS.forEach((c, octant) => {
    const fs = c.faces;
    for (let i = 0; i < 3; i++) {
      const sideFace = fs[i];
      const f1 = fs[(i + 1) % 3];
      const f2 = fs[(i + 2) % 3];
      const [a, b] = FACE_RANK[f1] <= FACE_RANK[f2] ? [f1, f2] : [f2, f1];
      const na = FACE_NORMAL[a];
      const nb = FACE_NORMAL[b];
      const ns = FACE_NORMAL[sideFace];
      const dir = normalize([2 * (na[0] + nb[0]) + ns[0], 2 * (na[1] + nb[1]) + ns[1], 2 * (na[2] + nb[2]) + ns[2]]);
      out.push({ index: out.length, name: `${a}${b}:${c.name}`, octant, faces: [a, b], sideFace, dir });
    }
  });
  return out;
}

export const EDGE_SLOTS: readonly EdgeSlot[] = buildEdges();

/** Index of the slot whose direction matches v (within 1e-6), or -1. */
export function findByDir<T extends { readonly dir: Vec3 }>(slots: readonly T[], v: Vec3): number {
  return slots.findIndex((s) => Math.abs(s.dir[0] - v[0]) < 1e-6 && Math.abs(s.dir[1] - v[1]) < 1e-6 && Math.abs(s.dir[2] - v[2]) < 1e-6);
}

/** Is an octant in the turning half-cube of face f? */
export function inFaceLayer(octant: number, f: Face): boolean {
  return dot(CORNER_SLOTS[octant].sign, FACE_NORMAL[f]) > 0;
}
