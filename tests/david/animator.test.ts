import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MoveHistory } from '../../src/puzzle/history';
import { PIECES } from '../../src/david/model';
import { type Move, invertMove, parseAlgorithm } from '../../src/david/notation';
import { DavidAnimator } from '../../src/david/render/animator';
import type { DavidVisual } from '../../src/david/render/meshes';
import { DavidState } from '../../src/david/state';

function fakeVisuals(): DavidVisual[] {
  return PIECES.map((p) => ({
    pieceId: p.id,
    kind: p.kind,
    group: new THREE.Group(),
    meshes: [],
    bodyMaterial: new THREE.MeshPhysicalMaterial(),
    stickerMaterials: [],
  }));
}

function run(animator: DavidAnimator, start = 0): number {
  let t = start;
  for (let i = 0; i < 100000 && animator.busy; i++) animator.update((t += 16));
  expect(animator.busy).toBe(false);
  return t;
}

const q = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
function quatOf(st: DavidState, id: number): THREE.Quaternion {
  const m = st.matrix(id);
  m4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  return q.setFromRotationMatrix(m4).clone();
}

function expectMeshesMatch(visuals: readonly DavidVisual[], st: DavidState) {
  for (const v of visuals) expect(v.group.quaternion.angleTo(quatOf(st, v.pieceId)), PIECES[v.pieceId].name).toBeLessThan(1e-6);
}

describe("David's Gear Cube animator + history", () => {
  it('animates face and gear moves into exact engine poses, undoes and redoes them', () => {
    const visuals = fakeVisuals();
    const animator = new DavidAnimator(visuals, DavidState.solved());
    const history = new MoveHistory<Move>(invertMove);
    const logical = DavidState.solved();
    const p = parseAlgorithm("U G F' G2' L2 G3 U' F L'");
    if (!p.ok) throw new Error(p.error);
    for (const m of p.moves) {
      logical.apply(m);
      animator.enqueue(m, 300);
      history.push(m);
    }
    let t = run(animator);
    expect(animator.visualState.equals(logical)).toBe(true);
    expectMeshesMatch(visuals, animator.visualState);
    const forward = animator.visualState.clone();
    let m;
    while ((m = history.undo())) animator.enqueue(m, 300);
    t = run(animator, t);
    expect(animator.visualState.isSolved()).toBe(true);
    while ((m = history.redo())) animator.enqueue(m, 300);
    run(animator, t);
    expect(animator.visualState.equals(forward)).toBe(true);
    expectMeshesMatch(visuals, animator.visualState);
  });

  it('half way through G (t = 0.5) all 8 corners have turned 60°, all 24 centres 45°, and all 24 edge posts 0°', () => {
    const visuals = fakeVisuals();
    const animator = new DavidAnimator(visuals, DavidState.solved());
    const solved = DavidState.solved();
    animator.previewAt({ token: 'G', amount: 1 }, 0.5);

    for (const p of PIECES) {
      const ang = visuals[p.id].group.quaternion.angleTo(quatOf(solved, p.id));
      if (p.kind === 'corner') {
        expect(ang, p.name).toBeCloseTo(Math.PI / 3, 6); // 60°
      } else if (p.kind === 'centre') {
        expect(ang, p.name).toBeCloseTo(Math.PI / 4, 6); // 45°
      } else {
        expect(ang, p.name).toBeLessThan(1e-6); // 0°
      }
    }
    animator.previewAt(null);
    expectMeshesMatch(visuals, solved);
  });
});
