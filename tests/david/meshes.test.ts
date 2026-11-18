import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/puzzle/moves';
import type { Mat3, Vec3 } from '../../src/puzzle/vec';
import { loadManifoldKernel } from '../../src/render/manifold';
import { DIM, MM } from '../../src/david/config';
import { PIECES } from '../../src/david/model';
import {
  PAD,
  type Proto,
  type PrototypeSolids,
  buildDavidGeometry,
  buildPrototypeSolids,
  defaultFillet,
  roundedSolid,
} from '../../src/david/render/pieces';
import { generateScramble } from '../../src/david/scramble';
import { DavidState } from '../../src/david/state';

let wasm: ManifoldToplevel;
let solids: PrototypeSolids;
const rounded = new Map<string, Manifold>();
const owned: Array<{ delete(): void }> = [];
const keep = <M extends { delete(): void }>(m: M): M => {
  owned.push(m);
  return m;
};

const KINDS = ['corner', 'centre', 'edge'] as const;
type Kind = (typeof KINDS)[number];

beforeAll(async () => {
  wasm = await loadManifoldKernel();
  solids = buildPrototypeSolids(wasm, keep);
  for (const k of KINDS) rounded.set(k, roundedSolid(solids[k], defaultFillet()));
}, 60000);

afterAll(() => {
  for (const m of owned) m.delete();
});

const mat4 = (r: Mat3): Mat4 => [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1];

function proto(kind: Kind): Proto {
  return solids[kind];
}

function placed(st: DavidState): Manifold[] {
  return PIECES.map((p) => keep(proto(p.kind).sharp.transform(mat4(st.matrix(p.id)))));
}

interface Directions {
  readonly axis: Vec3;
  readonly angle: number;
  readonly lo: Vec3;
  readonly hi: Vec3;
  readonly rMin: number;
}

function directions(m: Manifold): Directions {
  const mesh = m.getMesh();
  const P = mesh.numProp;
  const n = mesh.vertProperties.length / P;
  const dirs: Vec3[] = [];
  const s = [0, 0, 0];
  const lo = [1, 1, 1];
  const hi = [-1, -1, -1];
  let rMin = Infinity;
  for (let i = 0; i < n; i++) {
    const x = mesh.vertProperties[i * P];
    const y = mesh.vertProperties[i * P + 1];
    const z = mesh.vertProperties[i * P + 2];
    const l = Math.hypot(x, y, z);
    rMin = Math.min(rMin, l);
    const d: Vec3 = [x / l, y / l, z / l];
    dirs.push(d);
    for (let k = 0; k < 3; k++) {
      s[k] += d[k];
      lo[k] = Math.min(lo[k], d[k]);
      hi[k] = Math.max(hi[k], d[k]);
    }
  }
  const l = Math.hypot(...s);
  const axis: Vec3 = [s[0] / l, s[1] / l, s[2] / l];
  let angle = 0;
  for (const d of dirs) angle = Math.max(angle, Math.acos(Math.min(1, d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2])));
  return { axis, angle, lo: lo as unknown as Vec3, hi: hi as unknown as Vec3, rMin };
}

function mayMeet(a: Directions, b: Directions): boolean {
  const c = a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2];
  if (Math.acos(Math.max(-1, Math.min(1, c))) > a.angle + b.angle + 1e-6) return false;
  for (let k = 0; k < 3; k++) if (a.lo[k] > b.hi[k] + 0.05 || b.lo[k] > a.hi[k] + 0.05) return false;
  return true;
}

const AT_REST_MM3 = 0.01;
function worstOverlap(st: DavidState): { mm3: number; a: string; b: string } {
  const ms = [...placed(st), solids.core];
  const names = [...PIECES.map((p) => `${p.kind} ${p.name}`), 'core'];
  const dirs = ms.map((m, i) => (i < PIECES.length ? directions(m) : null));
  const coreR = DIM.coreRadiusMm * MM;
  let worst = { mm3: 0, a: '', b: '' };
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const di = dirs[i];
      const dj = dirs[j];
      if (di && dj && !mayMeet(di, dj)) continue;
      if (!dj && di && di.rMin > coreR) continue;
      const v = keep(ms[i].intersect(ms[j])).volume() / MM ** 3;
      if (v > worst.mm3) worst = { mm3: v, a: names[i], b: names[j] };
    }
  }
  return worst;
}

function planeToTop(m: Manifold, n: Vec3, d: number): { m: Manifold; map: (p: Vec3) => [number, number] } {
  const ref: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u0: Vec3 = [ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]];
  const ul = Math.hypot(...u0);
  const u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const w: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const M: Mat4 = [u[0], w[0], n[0], 0, u[1], w[1], n[1], 0, u[2], w[2], n[2], 0, 0, 0, -d, 1];
  return {
    m: keep(m.transform(M)),
    map: (p) => [u[0] * p[0] + u[1] * p[1] + u[2] * p[2], w[0] * p[0] + w[1] * p[1] + w[2] * p[2]],
  };
}

function distToPolys(p: [number, number], polys: [number, number][][]): number {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
  }
  return best;
}

function insidePolys(p: [number, number], polys: [number, number][][]): boolean {
  let c = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

function stickerPlanes(kind: Kind): { pts: Vec3[]; n: Vec3; d: number }[] {
  return proto(kind).stickers.map((s) => {
    const pts: Vec3[] = [];
    for (let i = 0; i < s.positions.length; i += 3) pts.push([s.positions[i], s.positions[i + 1], s.positions[i + 2]]);
    const n = s.normal;
    const lift = DIM.stickerLiftMm * MM;
    const d = n[0] * pts[0][0] + n[1] * pts[0][1] + n[2] * pts[0][2] - lift;
    return { pts, n, d };
  });
}

describe("David's Gear Cube piece solids", () => {
  it('builds three valid single-component prototypes with the right stickers', () => {
    for (const [kind, n] of [['corner', 3], ['centre', 1], ['edge', 2]] as const) {
      const p = proto(kind);
      expect(p.sharp.status(), kind).toBe('NoError');
      expect(p.sharp.volume(), kind).toBeGreaterThan(0);
      expect(p.sharp.decompose().length, `${kind} is one piece`).toBe(1);
      const r = rounded.get(kind)!;
      expect(r.status(), kind).toBe('NoError');
      expect(r.decompose().length, `rounded ${kind} is one piece`).toBe(1);
      expect(r.volume() / p.sharp.volume(), kind).toBeGreaterThan(0.95);
      expect(r.volume() / p.sharp.volume(), kind).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.stickers.length, kind).toBe(n);
      for (const s of p.stickers) expect(s.indices.length).toBeGreaterThan(0);
    }
  });

  it('every sticker triangle faces outward (no culled stickers)', () => {
    for (const kind of KINDS) {
      for (const s of proto(kind).stickers) {
        const P = s.positions;
        for (let t = 0; t < s.indices.length; t += 3) {
          const [a, b, c] = [s.indices[t], s.indices[t + 1], s.indices[t + 2]].map((v) => [P[3 * v], P[3 * v + 1], P[3 * v + 2]]);
          const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          expect(n[0] * s.normal[0] + n[1] * s.normal[1] + n[2] * s.normal[2], kind).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('builds the render meshes quickly, with unit normals that face out of their triangles', () => {
    const t0 = performance.now();
    const g = buildDavidGeometry(wasm);
    expect(performance.now() - t0).toBeLessThan(15000);
    for (const kind of KINDS) {
      const b = g[kind].body;
      expect(b.positions.length).toBe(b.normals.length);
      expect(b.indices.length % 3).toBe(0);
      expect(g[kind].pick.indices.length).toBeGreaterThan(0);
      let bad = 0;
      for (let t = 0; t < b.indices.length; t += 3) {
        const [i, j, k] = [b.indices[t], b.indices[t + 1], b.indices[t + 2]];
        const p = (v: number) => [b.positions[3 * v], b.positions[3 * v + 1], b.positions[3 * v + 2]];
        const [A, B, C] = [p(i), p(j), p(k)];
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const fl = Math.hypot(f[0], f[1], f[2]);
        for (const v of [i, j, k]) {
          const n = [b.normals[3 * v], b.normals[3 * v + 1], b.normals[3 * v + 2]];
          expect(Math.abs(Math.hypot(n[0], n[1], n[2]) - 1)).toBeLessThan(1e-3);
          if (fl > 1e-9 && (n[0] * f[0] + n[1] * f[1] + n[2] * f[2]) / fl <= 0) bad++;
        }
      }
      expect(bad, kind).toBe(0);
    }
  }, 60000);

  it('every sticker sits inside its flat plateau with at least the 0.50 mm plastic margin', () => {
    const pad = PAD / MM;
    for (const kind of KINDS) {
      for (const s of stickerPlanes(kind)) {
        const { m, map } = planeToTop(proto(kind).sharp, s.n, s.d - 1e-5);
        const top = m.slice(0).toPolygons() as [number, number][][];
        const inner = s.pts.map((p) => distToPolys(map(p), top) / MM);
        expect(Math.min(...inner), kind).toBeGreaterThan(pad - 0.03);
      }
    }
  });

  it('stickers sit on the flat: the rounding stops short of every sticker', () => {
    for (const kind of KINDS) {
      const r = rounded.get(kind)!;
      for (const s of stickerPlanes(kind)) {
        const { m, map } = planeToTop(r, s.n, s.d - 2e-5);
        const top = m.slice(0).toPolygons() as [number, number][][];
        for (const p of s.pts) {
          const q = map(p);
          expect(insidePolys(q, top), `${kind} sticker point on the flat top`).toBe(true);
          expect(distToPolys(q, top) / MM, kind).toBeGreaterThan(0.05);
        }
      }
    }
  });

  it('nothing overlaps when solved or scrambled', () => {
    const w0 = worstOverlap(DavidState.solved());
    expect(w0.mm3, `solved: ${w0.a} / ${w0.b}`).toBeLessThan(AT_REST_MM3);

    const rng = mulberry32(2026);
    const st = DavidState.solved();
    st.applyAll(generateScramble(rng, 25));
    const w1 = worstOverlap(st);
    expect(w1.mm3, `scrambled: ${w1.a} / ${w1.b}`).toBeLessThan(AT_REST_MM3);
  }, 120000);
});
