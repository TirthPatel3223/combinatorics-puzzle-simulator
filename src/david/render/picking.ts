import * as THREE from 'three';
import { distance } from '../../puzzle/vec';
import type { Stage } from '../../render/scene';
import { CONTROL_CORNERS, CORNER_SLOTS, FACE_NORMAL, TURN_FACES, type TurnFace, inFaceLayer } from '../geometry';
import { PIECES } from '../model';
import type { MoveToken } from '../notation';
import type { DavidState } from '../state';
import { type DavidVisual, PICK_LAYER } from './meshes';

export interface DavidPickHandlers {
  onHover(token: MoveToken | null, clientX: number, clientY: number): void;
  /** A click/tap on the puzzle. `alternate` = right button or Shift (counterclockwise / G'). */
  onTurn(token: MoveToken, alternate: boolean): void;
}

const CONTROL_OCTANTS = new Set<number>(
  CONTROL_CORNERS.map((name) => CORNER_SLOTS.findIndex((c) => c.name === name)),
);

/**
 * Click-to-turn for David's Gear Cube:
 *  - Clicking either of the two opposite control corner gears (`UFL` or `DBR`) triggers the gear move `G`
 *    (or `G'` with Shift / right-click).
 *  - Clicking any other piece on the active face layers (`U`, `F`, `L`) turns the active face whose
 *    centre is nearest the 3D hit point.
 */
export class DavidPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private hovered: MoveToken | null = null;
  private readonly targets: THREE.Object3D[];

  constructor(
    private readonly stage: Stage,
    visuals: readonly DavidVisual[],
    private readonly getState: () => DavidState,
    private readonly handlers: DavidPickHandlers,
  ) {
    this.targets = visuals.map((v) => v.group);
    this.raycaster.layers.set(PICK_LAYER);
    const el = stage.renderer.domElement;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerleave', () => this.clearHover());
  }

  invalidate(): void {
    /* octant membership is queried live from getState() */
  }

  tokenAt(clientX: number, clientY: number): MoveToken | null {
    const el = this.stage.renderer.domElement;
    const r = el.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const hit = this.raycaster.intersectObjects(this.targets, true).find((h) => typeof h.object.userData.pieceId === 'number');
    if (!hit) return null;
    const pieceId = hit.object.userData.pieceId as number;
    const piece = PIECES[pieceId];
    const st = this.getState();
    const octant = st.octantOf(pieceId);

    // The two opposite control corner gears (UFL and DBR) trigger G / G'.
    if (piece.kind === 'corner' && CONTROL_OCTANTS.has(octant)) {
      return 'G';
    }

    const local = this.stage.root.worldToLocal(hit.point.clone());
    const p: [number, number, number] = [local.x, local.y, local.z];
    let best: TurnFace | null = null;
    let bestD = Infinity;
    for (const f of TURN_FACES) {
      if (!inFaceLayer(octant, f)) continue;
      const d = distance(p, FACE_NORMAL[f]);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  tap(clientX: number, clientY: number, alternate: boolean): void {
    const t = this.tokenAt(clientX, clientY);
    if (t) this.handlers.onTurn(t, alternate);
  }

  clearHover(): void {
    this.setHovered(null, 0, 0);
  }

  get hoveredToken(): MoveToken | null {
    return this.hovered;
  }

  private setHovered(t: MoveToken | null, x: number, y: number) {
    this.hovered = t;
    this.stage.renderer.domElement.style.cursor = t ? 'pointer' : '';
    this.handlers.onHover(t, x, y);
  }

  private pending: { x: number; y: number } | null = null;

  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const first = this.pending === null;
    this.pending = { x: e.clientX, y: e.clientY };
    if (!first) return;
    requestAnimationFrame(() => {
      const p = this.pending!;
      this.pending = null;
      const t = this.tokenAt(p.x, p.y);
      if (t !== this.hovered || t) this.setHovered(t, p.x, p.y);
    });
  };
}
