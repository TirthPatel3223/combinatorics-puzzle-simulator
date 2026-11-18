import { type Mat3, axisAngleMat3 } from '../puzzle/vec';
import { CORNER_SLOTS, FACES, FACE_NORMAL, type Face } from './geometry';
import { CUBE_GROUP } from './model';

/**
 * Exact move tables for David's Gear Cube.
 *
 * 1. Face turn X (`dir = +1` clockwise seen from outside X, `-1` counterclockwise):
 *    Rotates the 4 octants on X's side of the cube (4 corner gears, 12 centre sectors, 12 half-edge
 *    posts = 28 pieces) by `-dir * 90°` right-handed about X's outward normal.
 *
 * 2. Gear turn G (`dir = +1` for G, `-1` for G'):
 *    - Leaves all 24 half-edge posts (the 8 octant frames) stationary.
 *    - Twists every corner gear in place by `-dir * 120°` right-handed about its current octant's
 *      outward body diagonal (i.e. 120° clockwise seen from outside each corner for G).
 *    - Rotates every face-centre gear (4 sectors per face) by `+dir * 90°` right-handed about its
 *      current face's outward normal (i.e. 90° counterclockwise seen from outside each face for G).
 *
 * Every one of those rotations is an exact signed permutation matrix in CUBE_GROUP (0..23), so state
 * updates are pure integer multiplications in CUBE_GROUP with zero drift.
 */

/** Right-handed angle of a clockwise face quarter turn about its outward normal. */
export const FACE_QUARTER_RAD = -Math.PI / 2;
/** Right-handed angle of a G (+1) corner gear twist about its outward body diagonal (120° CW from outside). */
export const CORNER_GEAR_RAD = -(2 * Math.PI) / 3;
/** Right-handed angle of a G (+1) face-centre gear rotation about its outward face normal (90° CCW from outside). */
export const CENTRE_GEAR_RAD = Math.PI / 2;

function roundMat(m: Mat3): Mat3 {
  return m.map((x) => Math.round(x)) as unknown as Mat3;
}

export interface FaceTurnTable {
  readonly face: Face;
  readonly dir: 1 | -1;
  readonly rotMat: Mat3;
  /** CUBE_GROUP index of rotMat. */
  readonly rotIdx: number;
}

export interface GearTurnTable {
  readonly dir: 1 | -1;
  /** Per corner slot (0-7): CUBE_GROUP index of its 120° twist about that corner's outward diagonal. */
  readonly cornerRotByOctant: readonly number[];
  /** Per face: CUBE_GROUP index of its 90° centre rotation about that face's outward normal. */
  readonly centreRotByFace: Readonly<Record<Face, number>>;
}

const FACE_TABLES = new Map<string, FaceTurnTable>();
for (const f of FACES) {
  for (const d of [1, -1] as const) {
    const rotMat = roundMat(axisAngleMat3(FACE_NORMAL[f], d * FACE_QUARTER_RAD));
    const rotIdx = CUBE_GROUP.find(rotMat);
    if (rotIdx < 0) throw new Error(`face rotation not in CUBE_GROUP: ${f} ${d}`);
    FACE_TABLES.set(`${f}${d}`, { face: f, dir: d, rotMat, rotIdx });
  }
}

function buildGearTable(dir: 1 | -1): GearTurnTable {
  const cornerRotByOctant = CORNER_SLOTS.map((c) => {
    const m = roundMat(axisAngleMat3(c.dir, dir * CORNER_GEAR_RAD));
    const idx = CUBE_GROUP.find(m);
    if (idx < 0) throw new Error(`corner gear twist not in CUBE_GROUP: ${c.name}`);
    return idx;
  });
  const centreRotByFace = Object.fromEntries(
    FACES.map((f) => {
      const m = roundMat(axisAngleMat3(FACE_NORMAL[f], dir * CENTRE_GEAR_RAD));
      const idx = CUBE_GROUP.find(m);
      if (idx < 0) throw new Error(`centre gear rotation not in CUBE_GROUP: ${f}`);
      return [f, idx];
    }),
  ) as Record<Face, number>;
  return { dir, cornerRotByOctant, centreRotByFace };
}

const GEAR_POS = buildGearTable(1);
const GEAR_NEG = buildGearTable(-1);

export function faceTurnTable(face: Face, dir: 1 | -1): FaceTurnTable {
  return FACE_TABLES.get(`${face}${dir}`)!;
}

export function gearTurnTable(dir: 1 | -1): GearTurnTable {
  return dir === 1 ? GEAR_POS : GEAR_NEG;
}
