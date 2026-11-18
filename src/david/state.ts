import type { Mat3 } from '../puzzle/vec';
import { CENTRE_SLOTS, EDGE_SLOTS, type Face, inFaceLayer } from './geometry';
import { CENTRE_SLOT_OF_ORI, CORNER_SLOT_OF_ORI, CUBE_GROUP, EDGE_SLOT_OF_ORI, PIECES } from './model';
import { faceTurnTable, gearTurnTable } from './moves';
import type { Move, MoveToken } from './notation';

/** Progress report on how close the puzzle is to solved. */
export interface DavidReport {
  /** Number of 2x2x2 octant frames (out of 8) not in their home orientation. */
  readonly octantsDisplaced: number;
  /** Relative twist (0, 1 = 120° CW, 2 = 120° CCW) of the corner gears against their octant frames. */
  readonly cornerTwist: 0 | 1 | 2;
  /** Number of centre gear sectors (out of 24) sitting on a face of a different colour. */
  readonly centresMisplaced: number;
}

export interface MovingParts {
  /** Primary moving pieces: the 28 pieces of the turning half-cube for a face move, or the 8 corner gears for G. */
  readonly primary: number[];
  /** Driven gears: empty for a face move, or the 24 face-centre sectors for G. */
  readonly driven: number[];
}

/**
 * State of David's Gear Cube.
 *
 * Every piece (8 corner gears, 24 centre sectors, 24 half-edge posts) has a pose represented by a
 * single index `ori[id]` in CUBE_GROUP (0..23): the exact signed permutation matrix taking its
 * prototype to its current 3D position and orientation.
 */
export class DavidState {
  private constructor(readonly ori: Int8Array) {}

  static solved(): DavidState {
    const ori = new Int8Array(PIECES.length);
    for (const p of PIECES) ori[p.id] = p.homeOri;
    return new DavidState(ori);
  }

  clone(): DavidState {
    return new DavidState(this.ori.slice());
  }

  /** Current octant index (0-7) a piece sits in. */
  octantOf(id: number): number {
    const p = PIECES[id];
    const o = this.ori[id];
    if (p.kind === 'corner') return CORNER_SLOT_OF_ORI[o];
    if (p.kind === 'centre') return CENTRE_SLOTS[CENTRE_SLOT_OF_ORI[o]].octant;
    return EDGE_SLOTS[EDGE_SLOT_OF_ORI[o]].octant;
  }

  /** Current slot index (in CORNER_SLOTS, CENTRE_SLOTS or EDGE_SLOTS) a piece sits in. */
  slotOf(id: number): number {
    const p = PIECES[id];
    const o = this.ori[id];
    if (p.kind === 'corner') return CORNER_SLOT_OF_ORI[o];
    if (p.kind === 'centre') return CENTRE_SLOT_OF_ORI[o];
    return EDGE_SLOT_OF_ORI[o];
  }

  /** One 90° quarter turn of a face (`dir = +1` clockwise seen from outside, `-1` counterclockwise). */
  applyFaceQuarter(face: Face, dir: 1 | -1): void {
    const t = faceTurnTable(face, dir);
    for (const p of PIECES) {
      const i = p.id;
      if (!inFaceLayer(this.octantOf(i), face)) continue;
      this.ori[i] = CUBE_GROUP.mul(t.rotIdx, this.ori[i]);
    }
  }

  /** One gear step (`dir = +1` for G: corners 120° CW, centres 90° CCW; `-1` for G'). */
  applyGearStep(dir: 1 | -1): void {
    const t = gearTurnTable(dir);
    for (const p of PIECES) {
      const i = p.id;
      if (p.kind === 'corner') {
        const oct = CORNER_SLOT_OF_ORI[this.ori[i]];
        this.ori[i] = CUBE_GROUP.mul(t.cornerRotByOctant[oct], this.ori[i]);
      } else if (p.kind === 'centre') {
        const face = CENTRE_SLOTS[CENTRE_SLOT_OF_ORI[this.ori[i]]].face;
        this.ori[i] = CUBE_GROUP.mul(t.centreRotByFace[face], this.ori[i]);
      }
    }
  }

  apply(move: Move): void {
    const dir = move.amount > 0 ? 1 : -1;
    const steps = Math.abs(move.amount);
    for (let s = 0; s < steps; s++) {
      if (move.token === 'G') this.applyGearStep(dir);
      else this.applyFaceQuarter(move.token, dir);
    }
  }

  applyAll(moves: readonly Move[]): void {
    for (const m of moves) this.apply(m);
  }

  /** Exact 3x3 rotation matrix placing piece `id` from its prototype frame into the model frame. */
  matrix(id: number): Mat3 {
    return CUBE_GROUP.elements[this.ori[id]];
  }

  /** Pieces that move under `token`: for a face move, its 28-piece half-cube; for G, the 8 corners and 24 centres. */
  movingParts(token: MoveToken): MovingParts {
    const primary: number[] = [];
    const driven: number[] = [];
    if (token === 'G') {
      for (const p of PIECES) {
        if (p.kind === 'corner') primary.push(p.id);
        else if (p.kind === 'centre') driven.push(p.id);
      }
      return { primary, driven };
    }
    for (const p of PIECES) {
      if (inFaceLayer(this.octantOf(p.id), token)) primary.push(p.id);
    }
    return { primary, driven };
  }

  report(): DavidReport {
    // Count how many of the 8 octants have their half-edge posts displaced from home.
    const displacedOctants = new Set<number>();
    for (const p of PIECES) {
      if (p.kind === 'edge' && this.ori[p.id] !== p.homeOri) {
        displacedOctants.add(EDGE_SLOTS[p.home].octant);
      }
    }
    // Check the twist of the DBR corner gear (or any corner gear relative to its octant frame).
    // All 8 corner gears always share the same twist relative to their own octant frames.
    const dbrCorner = PIECES.find((p) => p.kind === 'corner' && p.name === 'DBR')!;
    let cornerTwist: 0 | 1 | 2 = 0;
    if (this.ori[dbrCorner.id] !== dbrCorner.homeOri) {
      const g1 = CUBE_GROUP.mul(gearTurnTable(1).cornerRotByOctant[dbrCorner.home], dbrCorner.homeOri);
      cornerTwist = this.ori[dbrCorner.id] === g1 ? 1 : 2;
    }
    let centresMisplaced = 0;
    for (const p of PIECES) {
      if (p.kind === 'centre') {
        const curFace = CENTRE_SLOTS[CENTRE_SLOT_OF_ORI[this.ori[p.id]]].face;
        const homeFace = CENTRE_SLOTS[p.home].face;
        if (curFace !== homeFace) centresMisplaced++;
      }
    }
    return { octantsDisplaced: displacedOctants.size, cornerTwist, centresMisplaced };
  }

  /** True when every octant frame is solved and every corner gear is aligned with its octant frame. */
  isFrameSolved(): boolean {
    const r = this.report();
    return r.octantsDisplaced === 0 && r.cornerTwist === 0;
  }

  /**
   * Visually solved: every corner gear and half-edge post in its home orientation, and every centre
   * sector sitting on its home face (the four centre sectors of one colour are visually identical).
   */
  isSolved(): boolean {
    const r = this.report();
    return r.octantsDisplaced === 0 && r.cornerTwist === 0 && r.centresMisplaced === 0;
  }

  /** Exact identity of the arrangement (for tests and caching). */
  key(): string {
    return Array.from(this.ori).join(',');
  }

  equals(other: DavidState): boolean {
    return this.key() === other.key();
  }
}
