import * as THREE from 'three';
import type { Mat3 } from '../../puzzle/vec';
import type { MeshData } from '../../render/fillet';
import { COLORS, LOOK } from '../config';
import { PIECES, type PieceKind } from '../model';
import type { BodyMesh, DavidGeometry, StickerMesh } from './pieces';

/**
 * Layer of the invisible picking meshes. The camera renders only layer 0, and the picker's raycaster
 * tests only this layer, so clicks hit the light sharp-edged bodies rather than the rounded ones.
 */
export const PICK_LAYER = 1;
const PICK_MATERIAL = new THREE.MeshBasicMaterial();

export interface DavidVisual {
  readonly pieceId: number;
  readonly kind: PieceKind;
  readonly group: THREE.Group;
  readonly meshes: readonly THREE.Mesh[];
  readonly bodyMaterial: THREE.MeshPhysicalMaterial;
  readonly stickerMaterials: readonly THREE.MeshPhysicalMaterial[];
}

function bodyGeometry(m: BodyMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function plainGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function stickerGeometry(m: StickerMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  const n = new Float32Array(m.positions.length);
  for (let i = 0; i < n.length; i += 3) n.set(m.normal, i);
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function plasticMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: LOOK.bodyColor,
    roughness: 0.42,
    metalness: 0,
    specularIntensity: 0.35,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.7,
  });
}

export function buildDavidVisuals(geo: DavidGeometry): DavidVisual[] {
  const one = (p: DavidGeometry['corner']) => ({
    body: bodyGeometry(p.body),
    pick: plainGeometry(p.pick),
    stickers: p.stickers.map(stickerGeometry),
  });
  const shared = { corner: one(geo.corner), centre: one(geo.centre), edge: one(geo.edge) };
  return PIECES.map((piece) => {
    const g = shared[piece.kind];
    const group = new THREE.Group();
    group.name = `piece-${piece.id}-${piece.kind}-${piece.name}`;
    const bodyMaterial = plasticMaterial();
    const body = new THREE.Mesh(g.body, bodyMaterial);
    body.userData.pieceId = piece.id;
    group.add(body);
    const pick = new THREE.Mesh(g.pick, PICK_MATERIAL);
    pick.layers.set(PICK_LAYER);
    pick.userData.pieceId = piece.id;
    group.add(pick);
    const meshes: THREE.Mesh[] = [body];
    const stickerMaterials: THREE.MeshPhysicalMaterial[] = [];
    g.stickers.forEach((sg, i) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: COLORS[piece.colors[i]],
        roughness: 0.45,
        metalness: 0,
        specularIntensity: 0.5,
        clearcoat: 0.25,
        clearcoatRoughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(sg, mat);
      mesh.userData.pieceId = piece.id;
      group.add(mesh);
      meshes.push(mesh);
      stickerMaterials.push(mat);
    });
    return { pieceId: piece.id, kind: piece.kind, group, meshes, bodyMaterial, stickerMaterials };
  });
}

export function buildCoreMesh(geo: DavidGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(
    bodyGeometry(geo.core),
    new THREE.MeshPhysicalMaterial({ color: LOOK.coreColor, roughness: 0.92, metalness: 0, specularIntensity: 0.2 }),
  );
  mesh.name = 'core';
  return mesh;
}

const M4 = new THREE.Matrix4();

export function setPieceTransform(v: DavidVisual, m: Mat3): void {
  M4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  v.group.quaternion.setFromRotationMatrix(M4);
}

/** Highlight: primary moving pieces in blue, driven centre gears (for G) in a lighter cyan tint. */
export type Highlight = 'none' | 'primary' | 'driven';

const PRIMARY = new THREE.Color('#60a5fa');
const DRIVEN = new THREE.Color('#a5f3fc');
const BLACK = new THREE.Color(0x000000);

export function setHighlight(v: DavidVisual, h: Highlight): void {
  const c = h === 'primary' ? PRIMARY : h === 'driven' ? DRIVEN : BLACK;
  v.bodyMaterial.emissive.copy(c);
  v.bodyMaterial.emissiveIntensity = h === 'none' ? 0 : h === 'primary' ? 0.55 : 0.35;
  for (const m of v.stickerMaterials) {
    m.emissive.copy(h === 'none' ? BLACK : m.color);
    m.emissiveIntensity = h === 'none' ? 0 : h === 'primary' ? 0.18 : 0.1;
  }
}
