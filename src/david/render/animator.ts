import * as THREE from 'three';
import { CENTRE_SLOTS, CORNER_SLOTS, FACE_NORMAL } from '../geometry';
import { PIECES } from '../model';
import { CENTRE_GEAR_RAD, CORNER_GEAR_RAD, FACE_QUARTER_RAD } from '../moves';
import type { Move } from '../notation';
import type { DavidState } from '../state';
import { type DavidVisual, setPieceTransform } from './meshes';

interface Queued {
  readonly move: Move;
  readonly durationMs: number;
}

interface PieceMotion {
  readonly id: number;
  readonly axis: THREE.Vector3;
  readonly totalAngle: number;
  readonly from: THREE.Quaternion;
}

interface Active extends Queued {
  readonly start: number;
  readonly motions: readonly PieceMotion[];
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const qTurn = new THREE.Quaternion();

function buildMotions(state: DavidState, visuals: readonly DavidVisual[], move: Move): PieceMotion[] {
  const motions: PieceMotion[] = [];
  if (move.token === 'G') {
    for (const p of PIECES) {
      if (p.kind === 'corner') {
        const oct = state.slotOf(p.id);
        const axis = new THREE.Vector3(...CORNER_SLOTS[oct].dir);
        motions.push({
          id: p.id,
          axis,
          totalAngle: CORNER_GEAR_RAD * move.amount,
          from: visuals[p.id].group.quaternion.clone(),
        });
      } else if (p.kind === 'centre') {
        const face = CENTRE_SLOTS[state.slotOf(p.id)].face;
        const axis = new THREE.Vector3(...FACE_NORMAL[face]);
        motions.push({
          id: p.id,
          axis,
          totalAngle: CENTRE_GEAR_RAD * move.amount,
          from: visuals[p.id].group.quaternion.clone(),
        });
      }
    }
    return motions;
  }
  const axis = new THREE.Vector3(...FACE_NORMAL[move.token]);
  const totalAngle = FACE_QUARTER_RAD * move.amount;
  const { primary } = state.movingParts(move.token);
  for (const id of primary) {
    motions.push({ id, axis, totalAngle, from: visuals[id].group.quaternion.clone() });
  }
  return motions;
}

/**
 * Plays moves one after another:
 *  - For a face turn (`U`, `F`, `L`), the 28 pieces in that face's half-cube rotate 90° about the face normal.
 *  - For a gear turn (`G`), all 8 corner gears rotate 120° about their respective outward body diagonals
 *    simultaneously while all 24 centre sectors rotate 90° about their respective outward face normals,
 *    and the 24 half-edge posts remain stationary.
 */
export class DavidAnimator {
  private queue: Queued[] = [];
  private active: Active | null = null;
  onApplied: (m: Move) => void = () => {};

  constructor(
    private readonly visuals: readonly DavidVisual[],
    private state: DavidState,
  ) {
    this.syncAll();
  }

  get busy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  get visualState(): DavidState {
    return this.state;
  }

  reset(state: DavidState): void {
    this.queue = [];
    this.active = null;
    this.state = state;
    this.syncAll();
  }

  enqueue(move: Move, durationMs: number): void {
    this.queue.push({ move, durationMs });
  }

  syncAll(): void {
    for (const v of this.visuals) setPieceTransform(v, this.state.matrix(v.pieceId));
  }

  /**
   * Show `move` frozen at fraction `t` (0-1, no easing) from the displayed state without applying it;
   * `null` snaps back.
   */
  previewAt(move: Move | null, t = 0.5): void {
    this.syncAll();
    if (!move) return;
    const motions = buildMotions(this.state, this.visuals, move);
    for (const m of motions) {
      qTurn.setFromAxisAngle(m.axis, m.totalAngle * t);
      this.visuals[m.id].group.quaternion.copy(qTurn).multiply(m.from);
    }
  }

  update(now: number): void {
    if (!this.active) {
      const next = this.queue.shift();
      if (!next) return;
      const motions = buildMotions(this.state, this.visuals, next.move);
      const n = Math.abs(next.move.amount);
      const durationMs = (next.durationMs * (0.7 + 0.3 * n)) / (1 + Math.min(this.queue.length, 6) * 0.35);
      this.active = { ...next, durationMs, start: now, motions };
    }
    const a = this.active;
    const t = a.durationMs <= 0 ? 1 : Math.min(1, (now - a.start) / a.durationMs);
    const e = ease(t);
    for (const m of a.motions) {
      qTurn.setFromAxisAngle(m.axis, m.totalAngle * e);
      this.visuals[m.id].group.quaternion.copy(qTurn).multiply(m.from);
    }
    if (t >= 1) {
      this.state.apply(a.move);
      this.active = null;
      this.syncAll();
      this.onApplied(a.move);
    }
  }
}
