import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Vec3 } from '../../puzzle/vec';
import { CORNER_SLOTS, FACE_NORMAL, TURN_FACES } from '../geometry';
import type { MoveToken } from '../notation';

const UFL_DIR: Vec3 = CORNER_SLOTS.find((c) => c.name === 'UFL')!.dir;

const BADGE_INFO: ReadonlyArray<{ readonly token: MoveToken; readonly dir: Vec3; readonly radius: number; readonly title: string }> = [
  ...TURN_FACES.map((f) => ({ token: f as MoveToken, dir: FACE_NORMAL[f], radius: 1.48, title: `${f} face turn (90°)` })),
  { token: 'G', dir: UFL_DIR, radius: 2.08, title: 'G corner gear turn (click UFL or DBR corner)' },
];

/** Floating U, F, L and G badges outside the three active faces and the UFL control corner. */
export class MoveLabels {
  private readonly group = new THREE.Group();
  private readonly badges = new Map<MoveToken, { readonly el: HTMLElement; readonly dir: Vec3 }>();
  private readonly tmp = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();

  constructor(private readonly root: THREE.Group) {
    root.add(this.group);
    for (const b of BADGE_INFO) {
      const el = document.createElement('div');
      el.className = 'part-label';
      el.textContent = b.token;
      el.title = b.title;
      const obj = new CSS2DObject(el);
      const [x, y, z] = b.dir;
      obj.position.set(x * b.radius, y * b.radius, z * b.radius);
      this.group.add(obj);
      this.badges.set(b.token, { el, dir: b.dir });
    }
  }

  update(camera: THREE.Camera): void {
    if (!this.group.visible) return;
    this.camDir.copy(camera.position).normalize();
    for (const { el, dir } of this.badges.values()) {
      const facing = this.tmp.set(...dir).applyQuaternion(this.root.quaternion).dot(this.camDir);
      el.classList.toggle('is-behind', facing < -0.2);
    }
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
    for (const { el } of this.badges.values()) el.style.display = on ? '' : 'none';
  }

  setActive(token: MoveToken | null): void {
    for (const [t, { el }] of this.badges) el.classList.toggle('is-active', t === token);
  }
}
