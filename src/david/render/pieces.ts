import type { CrossSection, Manifold, ManifoldToplevel, Mat4, Vec2 } from 'manifold-3d';
import { type Mat3, type Vec3, cross, normalize } from '../../puzzle/vec';
import {
  type BodyData,
  type FilletOptions,
  type MeshData,
  type Surface,
  bodyData,
  creaseRemovers,
  findCreases,
  meshData,
} from '../../render/fillet';
import { scoped } from '../../render/manifold';
import { DIM, LOOK, MM } from '../config';
import { CENTRE_MM, CORNER_MM, EDGE_BAR_MM, centreSticker, cornerSticker, edgeBarSticker } from '../stickers';
import { Outline, insideSphere, outsideSphere, planeSurface, radialWall } from './surfaces';

/**
 * The three piece prototypes of David's Gear Cube (corner gear, face-centre gear sector, and octant
 * half-edge post) plus the core sphere, built once with manifold-3d and instanced across the 56 pieces.
 *
 * Every rotation in David's Gear Cube (both the 90° 2x2x2 face turns and the 120°/90° gear turns) is
 * about an axis through the cube centre (0, 0, 0). Every piece body is therefore built as a cone from
 * the cube centre over its outer plateau (the sticker grown by the 0.50 mm padding), down to the black
 * core ball. Because rotations map cones from the centre to cones from the centre, two bodies can only
 * meet where their footprints on the unit sphere meet, and the 2D clearance check on the face plane
 * covers the entire depth down to the core.
 *
 *  - Corner (built at UFR): a single cone in the (1, 1, 1) diagonal frame over the union of its three
 *    face plateaus, their bridges across the bevelled edges, and the solid black vertex cap inside the
 *    circular vertex sticker cutout; cut by the three face planes, three bevel planes, and core sphere.
 *  - Centre sector (built at F:UFR): a cone along +z over the 3-tooth quarter-sector plateau (with the
 *    inner black hub quadrant filled in flush with the face plane), cut by z = 1 and the core sphere.
 *  - Half-edge post (built at FR:UFR): a single cone in the (1, 0, 1)/√2 edge-diagonal frame over the
 *    two bar plateaus on F and R and their bridge across the FR bevel; cut by z = 1, x = 1, the FR
 *    bevel plane, and the core sphere.
 *
 * All convex outer creases are rounded with a rolling-ball fillet (`src/render/fillet.ts`).
 */

export type BodyMesh = BodyData;

export interface StickerMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normal: Vec3;
}

export interface PrototypeGeometry {
  /** Rounded body with analytic normals. */
  readonly body: BodyMesh;
  /** Sharp body (far fewer triangles), used on an invisible layer for raycast picking. */
  readonly pick: MeshData;
  /** In the order of `DavidPiece.colors`. */
  readonly stickers: readonly StickerMesh[];
  readonly volume: number;
}

export interface DavidGeometry {
  readonly corner: PrototypeGeometry;
  readonly centre: PrototypeGeometry;
  readonly edge: PrototypeGeometry;
  readonly core: BodyMesh;
}

type Keep = <M extends { delete(): void }>(m: M) => M;

/** Bevel: the plane x + z = BEVEL (etc.) passes through the plateau edge (bevelStart, 1). */
export const BEVEL = 1 + DIM.bevelStartMm * MM;
/** Plastic margin around every sticker. */
export const PAD = DIM.paddingMm * MM;
/** Half-gap along the x = 0, y = 0, z = 0 cut planes. */
export const GAP = DIM.gapMm * MM;
/** Pieces stop this far outside the core ball so they never touch it. */
const CORE_CLEAR = 0.02 * MM;
const R_CORE = DIM.coreRadiusMm * MM;
/** Cones start inside the core (the core sphere then cuts them cleanly). */
const CONE_FLOOR = R_CORE - 0.3 * MM;
const SEG = LOOK.offsetSegments;

export function defaultFillet(): FilletOptions {
  return {
    outerRadius: DIM.roundOuterMm * MM,
    innerRadius: DIM.roundInnerMm * MM,
    step: LOOK.filletStepMm * MM,
    arcStep: (LOOK.filletArcStepDeg * Math.PI) / 180,
    maxReach: (DIM.paddingMm - 0.15) * MM,
    maxTurn: (10 * Math.PI) / 180,
  };
}

const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** 3-fold rotation about (1, 1, 1): (x, y, z) -> (z, x, y) maps F to R and R to U. */
const CYC: Mat3 = [0, 0, 1, 1, 0, 0, 0, 1, 0];
const CYC2: Mat3 = [0, 1, 0, 0, 0, 1, 1, 0, 0];
/** Reflection swapping x and z: maps (u, v, 1) on F to (1, v, u) on R for the FR edge post. */
const SWAP_XZ: Mat3 = [0, 0, 1, 0, 1, 0, 1, 0, 0];

const apply3 = (r: Mat3, p: Vec3): Vec3 => [
  r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
  r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
  r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
];

function mat4(r: Mat3, t: Vec3 = [0, 0, 0]): Mat4 {
  return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, t[0], t[1], t[2], 1];
}

function perp(n: Vec3): [Vec3, Vec3] {
  const ref: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(ref, n));
  return [u, cross(n, u)];
}

class Shape {
  readonly surfaces: Surface[] = [];
  readonly prims = new Map<number, readonly number[]>();
  readonly clips = new Map<number, Manifold>();
  private nextGroup = 0;

  constructor(
    readonly wasm: ManifoldToplevel,
    readonly keep: Keep,
  ) {}

  group(): number {
    return this.nextGroup++;
  }

  surface(s: Surface): number {
    return this.surfaces.push(s) - 1;
  }

  mark(m: Manifold, ...surfaces: number[]): Manifold {
    const o = this.keep(m.asOriginal());
    this.prims.set(o.originalID(), surfaces);
    return o;
  }

  halfSpace(n: Vec3, d: number): Manifold {
    const L = 8;
    const { keep } = this;
    const box = keep(keep(this.wasm.Manifold.cube([2 * L, 2 * L, 2 * L])).translate([-L, -L, -2 * L]));
    const [u, w] = perp(n);
    return keep(box.transform([u[0], u[1], u[2], 0, w[0], w[1], w[2], 0, n[0], n[1], n[2], 0, n[0] * d, n[1] * d, n[2] * d, 1]));
  }

  cone(region: CrossSection, z0: number, z1: number, divisions = 0): Manifold {
    const { keep } = this;
    const k = z1 / z0;
    return keep(keep(keep(region.scale([z0, z0])).extrude(z1 - z0, divisions, 0, [k, k])).translate([0, 0, z0]));
  }

  core(): Manifold {
    const s = this.surface(outsideSphere(R_CORE + CORE_CLEAR, { kind: 'core', outer: false, group: WALLS }));
    return this.mark(this.keep(this.wasm.Manifold.sphere(R_CORE + CORE_CLEAR, LOOK.coreSegments)), s);
  }
}

const WALLS = 0;

function coneStart(region: CrossSection): number {
  const b = region.bounds();
  const far = Math.max(
    Math.hypot(b.min[0], b.min[1]),
    Math.hypot(b.min[0], b.max[1]),
    Math.hypot(b.max[0], b.min[1]),
    Math.hypot(b.max[0], b.max[1]),
  );
  return CONE_FLOOR / Math.sqrt(1 + far * far);
}

function polys(cs: CrossSection): [number, number][][] {
  return cs.toPolygons().map((p) => p.map((v) => [v[0], v[1]] as [number, number]));
}

function stickerMesh(wasm: ManifoldToplevel, cs: CrossSection, place: (p: Vec2) => Vec3, normal: Vec3): StickerMesh {
  const ps = cs.toPolygons();
  const flat: Vec2[] = ps.flat();
  const tris = wasm.triangulate(ps, 1e-9);
  const positions = new Float32Array(flat.length * 3);
  flat.forEach((p, i) => positions.set(place(p), 3 * i));
  const indices = new Uint32Array(tris.length * 3);
  const at = (v: number): Vec3 => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];
  tris.forEach((t, i) => {
    const [a, b, c] = [at(t[0]), at(t[1]), at(t[2])];
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const flip = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] < 0;
    indices.set(flip ? [t[0], t[2], t[1]] : t, 3 * i);
  });
  return { positions, indices, normal };
}

const lift = () => DIM.stickerLiftMm * MM;

export interface Proto {
  readonly sharp: Manifold;
  readonly shape: Shape;
  readonly stickers: readonly StickerMesh[];
}

const PLATEAU_NOTCH_MM = 0.3;

function plateauOf(sticker: CrossSection, keep: Keep): CrossSection {
  const grown = keep(sticker.offset(PAD, 'Round', 2, SEG));
  const c = PLATEAU_NOTCH_MM * MM;
  return clean(keep(keep(grown.offset(c, 'Round', 2, SEG)).offset(-c, 'Round', 2, SEG)), keep);
}

function clean(cs: CrossSection, keep: Keep): CrossSection {
  return keep(cs.simplify(0.003 * MM));
}

function signedArea(poly: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    area += x0 * y1 - x1 * y0;
  }
  return area;
}

/** Project a face region (on z = 1, turned by `fr`) from the origin onto the plane z = 1 of `frame`. */
function projectToFrame(cs: CrossSection, fr: Mat3, frame: Mat3): Vec2[][] {
  return cs.toPolygons().map((poly) => {
    const out = poly.map(([u, v]): Vec2 => {
      const p = apply3(fr, [u, v, 1]);
      const w = frame[2] * p[0] + frame[5] * p[1] + frame[8] * p[2];
      return [(frame[0] * p[0] + frame[3] * p[1] + frame[6] * p[2]) / w, (frame[1] * p[0] + frame[4] * p[1] + frame[7] * p[2]) / w];
    });
    return signedArea(out) >= 0 === (signedArea(poly) >= 0) ? out : out.reverse();
  });
}

// ------------------------------------------------------------------------------------------ corner

const DIAG: Mat3 = (() => {
  const e1 = normalize([1, -1, 0]);
  const d = normalize([1, 1, 1]);
  const e2 = cross(d, e1);
  return [e1[0], e2[0], d[0], e1[1], e2[1], d[1], e1[2], e2[2], d[2]];
})();

/** The corner gear's region on its F face (face coordinates on z = 1): plateau, vertex cap and bevel bridges. */
export function cornerRegions(wasm: ManifoldToplevel, keep: Keep): { sticker: CrossSection; region: CrossSection } {
  const { CrossSection } = wasm;
  const sticker = keep(new CrossSection([cornerSticker() as Vec2[]], 'Positive'));
  const plateau = plateauOf(sticker, keep);
  const ue = CORNER_MM.ue * MM;
  const lo = (CORNER_MM.ue - CORNER_MM.dEtip) * MM - PAD;
  const vlo = (CORNER_MM.ue - CORNER_MM.rCut) * MM - PAD;
  // Bridges over the FR and UF bevelled edges (from the edge-tooth tips all the way to the vertex)
  // plus the solid black vertex cap inside the circular sticker cutout.
  const bridgeR = keep(keep(CrossSection.square([1.2 - ue, 1.2 - lo])).translate([ue, lo]));
  const bridgeU = keep(keep(CrossSection.square([1.2 - lo, 1.2 - ue])).translate([lo, ue]));
  const vertexCap = keep(keep(CrossSection.square([1.2 - vlo, 1.2 - vlo])).translate([vlo, vlo]));
  const edge = 1 + 1e-4;
  const face = keep(keep(CrossSection.square([edge + 0.4, edge + 0.4])).translate([-0.4, -0.4]));
  const close = 0.4 * MM;
  let region = keep(CrossSection.union([plateau, bridgeR, bridgeU, vertexCap]));
  region = keep(keep(region.offset(close, 'Round', 2, SEG)).offset(-close, 'Round', 2, SEG));
  region = clean(keep(region.intersect(face)), keep);
  return { sticker, region };
}

function buildCorner(wasm: ManifoldToplevel, keep: Keep): Proto {
  const { CrossSection } = wasm;
  const sh = new Shape(wasm, keep);
  const { sticker, region } = cornerRegions(wasm, keep);
  const s = Math.SQRT1_2;
  const faces: Mat3[] = [I3, CYC, CYC2]; // F, R, U of the UFR corner
  const section = clean(keep(new CrossSection(faces.flatMap((fr) => projectToFrame(region, fr, DIAG)), 'Positive')), keep);
  const wall = sh.surface(radialWall(DIAG, new Outline(polys(section)), { kind: 'wall', outer: false, group: WALLS }));
  const top = 1.85;
  let solid = sh.mark(sh.cone(section, coneStart(section), top, 6), wall);
  solid = keep(solid.subtract(sh.core()));
  solid = keep(solid.transform(mat4(DIAG)));
  const cuts: [Vec3, number, string][] = [
    [[1, 0, 0], 1, 'face'],
    [[0, 1, 0], 1, 'face'],
    [[0, 0, 1], 1, 'face'],
    [[s, s, 0], BEVEL * s, 'bevel'],
    [[0, s, s], BEVEL * s, 'bevel'],
    [[s, 0, s], BEVEL * s, 'bevel'],
  ];
  for (const [n, d, kind] of cuts) {
    const k = sh.surface(planeSurface(n, d, { kind, outer: true, group: sh.group() + 1 }));
    solid = keep(solid.intersect(sh.mark(sh.halfSpace(n, d), k)));
  }
  const L = lift();
  const onF = (p: Vec2): Vec3 => [p[0], p[1], 1 + L];
  const stickers: StickerMesh[] = [
    stickerMesh(wasm, sticker, (p) => apply3(CYC2, onF(p)), [0, 1, 0]), // U
    stickerMesh(wasm, sticker, onF, [0, 0, 1]), // F
    stickerMesh(wasm, sticker, (p) => apply3(CYC, onF(p)), [1, 0, 0]), // R
  ];
  return { sharp: solid, shape: sh, stickers };
}

// ------------------------------------------------------------------------------------------ centre sector

/** The centre sector's plateau on the F face (quadrant 1): sticker grown by PAD plus the solid black inner hub wedge. */
export function centreRegions(wasm: ManifoldToplevel, keep: Keep): { sticker: CrossSection; region: CrossSection } {
  const { CrossSection } = wasm;
  const sticker = keep(new CrossSection([centreSticker() as Vec2[]], 'Positive'));
  const plateau = plateauOf(sticker, keep);
  const g = GAP;
  const rHub = (CENTRE_MM.rHub + DIM.paddingMm) * MM;
  const rCorner = (CENTRE_MM.rCf + DIM.paddingMm) * MM;
  const box = keep(
    keep(
      keep(CrossSection.square([rHub - g - 2 * rCorner, rHub - g - 2 * rCorner])).offset(rCorner, 'Round', 2, SEG),
    ).translate([g + rCorner, g + rCorner]),
  );
  const quad = keep(keep(CrossSection.square([1.2, 1.2])).translate([g, g]));
  const region = clean(keep(keep(CrossSection.union([plateau, box])).intersect(quad)), keep);
  return { sticker, region };
}

function buildCentre(wasm: ManifoldToplevel, keep: Keep): Proto {
  const sh = new Shape(wasm, keep);
  const { sticker, region } = centreRegions(wasm, keep);
  const wall = sh.surface(radialWall(I3, new Outline(polys(region)), { kind: 'wall', outer: false, group: WALLS }));
  const topS = sh.surface(planeSurface([0, 0, 1], 1, { kind: 'face', outer: true, group: sh.group() + 1 }));
  let solid = sh.mark(sh.cone(region, coneStart(region), 1.05, 4), wall);
  solid = keep(solid.intersect(sh.mark(sh.halfSpace([0, 0, 1], 1), topS)));
  solid = keep(solid.subtract(sh.core()));
  const L = lift();
  return {
    sharp: solid,
    shape: sh,
    stickers: [stickerMesh(wasm, sticker, (p) => [p[0], p[1], 1 + L], [0, 0, 1])],
  };
}

// ------------------------------------------------------------------------------------------ half-edge post

const EDGE_DIAG: Mat3 = (() => {
  const d = normalize([1, 0, 1]);
  const e1: Vec3 = [0, 1, 0];
  const e2 = cross(d, e1);
  return [e1[0], e2[0], d[0], e1[1], e2[1], d[1], e1[2], e2[2], d[2]];
})();

/** The half-edge post's region on its F face: bar plateau plus the bridge across the FR bevel. */
export function edgeRegions(wasm: ManifoldToplevel, keep: Keep): { sticker: CrossSection; region: CrossSection } {
  const { CrossSection } = wasm;
  const sticker = keep(new CrossSection([edgeBarSticker() as Vec2[]], 'Positive'));
  const plateau = plateauOf(sticker, keep);
  const ue = EDGE_BAR_MM.v1 * MM;
  const y0 = EDGE_BAR_MM.u0 * MM - PAD;
  const y1 = EDGE_BAR_MM.u1 * MM + PAD;
  const bridge = keep(keep(CrossSection.square([1.2 - ue, y1 - y0])).translate([ue, y0]));
  const edge = 1 + 1e-4;
  const face = keep(keep(CrossSection.square([edge + 0.2, edge + 0.2])).translate([-0.2, -0.2]));
  const region = clean(keep(keep(CrossSection.union([plateau, bridge])).intersect(face)), keep);
  return { sticker, region };
}

function buildEdge(wasm: ManifoldToplevel, keep: Keep): Proto {
  const { CrossSection } = wasm;
  const sh = new Shape(wasm, keep);
  const { sticker, region } = edgeRegions(wasm, keep);
  const s = Math.SQRT1_2;
  const faces: Mat3[] = [I3, SWAP_XZ]; // F and R faces of the FR:UFR half-edge post
  const section = clean(keep(new CrossSection(faces.flatMap((fr) => projectToFrame(region, fr, EDGE_DIAG)), 'Positive')), keep);
  const wall = sh.surface(radialWall(EDGE_DIAG, new Outline(polys(section)), { kind: 'wall', outer: false, group: WALLS }));
  let solid = sh.mark(sh.cone(section, coneStart(section), 1.55, 4), wall);
  solid = keep(solid.subtract(sh.core()));
  solid = keep(solid.transform(mat4(EDGE_DIAG)));
  const cuts: [Vec3, number, string][] = [
    [[0, 0, 1], 1, 'face'],
    [[1, 0, 0], 1, 'face'],
    [[s, 0, s], BEVEL * s, 'bevel'],
  ];
  for (const [n, d, kind] of cuts) {
    const k = sh.surface(planeSurface(n, d, { kind, outer: true, group: sh.group() + 1 }));
    solid = keep(solid.intersect(sh.mark(sh.halfSpace(n, d), k)));
  }
  const L = lift();
  const stickers: StickerMesh[] = [
    stickerMesh(wasm, sticker, (p) => [p[0], p[1], 1 + L], [0, 0, 1]), // F
    stickerMesh(wasm, sticker, (p) => [1 + L, p[1], p[0]], [1, 0, 0]), // R
  ];
  return { sharp: solid, shape: sh, stickers };
}

// ------------------------------------------------------------------------------------------ core

function buildCore(wasm: ManifoldToplevel, keep: Keep): { solid: Manifold; shape: Shape } {
  const { Manifold } = wasm;
  const sh = new Shape(wasm, keep);
  const s = sh.surface(insideSphere(R_CORE, { kind: 'core', outer: false, group: WALLS }));
  const solid = sh.mark(keep(Manifold.sphere(R_CORE, LOOK.coreSegments)), s);
  return { solid, shape: sh };
}

// ------------------------------------------------------------------------------------------ assembly

export function roundedSolid(proto: Proto, fillet: FilletOptions | null): Manifold {
  if (!fillet) return proto.sharp;
  const { surfaces, prims, clips, wasm, keep } = proto.shape;
  const removers = findCreases(proto.sharp.getMesh(), surfaces, prims).flatMap((c) =>
    creaseRemovers(wasm, surfaces[c.a], surfaces[c.b], c.points, fillet).map((m) => {
      let out = keep(m);
      for (const k of [c.a, c.b]) {
        const clip = clips.get(k);
        if (clip) out = keep(out.intersect(clip));
      }
      return out;
    }),
  );
  if (!removers.length) return proto.sharp;
  const body = keep(wasm.Manifold.difference([proto.sharp, ...removers]));
  const parts = body.decompose().map(keep);
  return parts.length > 1 ? parts.reduce((a, b) => (b.volume() > a.volume() ? b : a)) : body;
}

export interface PrototypeSolids {
  readonly corner: Proto;
  readonly centre: Proto;
  readonly edge: Proto;
  readonly core: Manifold;
}

export function buildPrototypeSolids(wasm: ManifoldToplevel, keep: Keep): PrototypeSolids {
  return {
    corner: buildCorner(wasm, keep),
    centre: buildCentre(wasm, keep),
    edge: buildEdge(wasm, keep),
    core: buildCore(wasm, keep).solid,
  };
}

export function buildDavidGeometry(wasm: ManifoldToplevel, fillet: FilletOptions | null = defaultFillet()): DavidGeometry {
  return scoped((keep) => {
    const geo = (p: Proto): PrototypeGeometry => {
      const body = roundedSolid(p, fillet);
      return {
        body: bodyData(body.getMesh(), p.shape.surfaces, p.shape.prims),
        pick: meshData(p.sharp.getMesh()),
        stickers: p.stickers,
        volume: p.sharp.volume(),
      };
    };
    const core = buildCore(wasm, keep);
    return {
      corner: geo(buildCorner(wasm, keep)),
      centre: geo(buildCentre(wasm, keep)),
      edge: geo(buildEdge(wasm, keep)),
      core: bodyData(core.solid.getMesh(), core.shape.surfaces, core.shape.prims),
    };
  });
}
