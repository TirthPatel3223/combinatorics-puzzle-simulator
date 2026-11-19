import { describe, expect, it } from 'vitest';
import { ARC_STEP, type P2, signedArea } from '../../src/david/sketch';
import { centreSticker, cornerSticker, edgeBarSticker } from '../../src/david/stickers';
import { STICKER_REFERENCE as REF } from './fixtures/sticker-reference';

const MM = 1 / 30;

function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function toPoly(p: P2, poly: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}
function hausdorff(a: readonly P2[], b: readonly P2[]): number {
  let h = 0;
  for (const p of a) h = Math.max(h, toPoly(p, b));
  for (const p of b) h = Math.max(h, toPoly(p, a));
  return h;
}
function selfIntersects(poly: readonly P2[]): boolean {
  const n = poly.length;
  const orient = (a: P2, b: P2, c: P2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = poly[j];
      const d = poly[(j + 1) % n];
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return true;
    }
  }
  return false;
}
function turns(poly: readonly P2[]): number[] {
  const n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    const u = [p[0] - a[0], p[1] - a[1]];
    const v = [b[0] - p[0], b[1] - p[1]];
    return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
  });
}

describe("David's Gear Cube parametric sticker outlines", () => {
  const centre = centreSticker();
  const corner = cornerSticker();
  const edge = edgeBarSticker();

  it('rebuild exactly what the photo fitter generated', () => {
    expect(hausdorff(centre, REF.centre) / MM).toBeLessThan(0.02);
    expect(hausdorff(corner, REF.corner) / MM).toBeLessThan(0.02);
    expect(hausdorff(edge, REF.edge) / MM).toBeLessThan(0.02);
  });

  it('are simple counterclockwise polygons strictly inside the first quadrant (0, 1)^2', () => {
    for (const poly of [centre, corner, edge]) {
      expect(signedArea(poly)).toBeGreaterThan(0);
      expect(selfIntersects(poly)).toBe(false);
      for (const [x, y] of poly) {
        expect(x).toBeGreaterThan(0);
        expect(y).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeLessThan(1);
      }
    }
  });

  it('cover the whole piece face: the centre sector reaches the face centre, the corner the vertex', () => {
    const near = (poly: readonly P2[], q: P2) => Math.min(...poly.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    // Within a fillet's reach of the square corner (no circular hub or vertex cutout).
    expect(near(centre, [0.65 * MM, 0.65 * MM]) / MM).toBeLessThan(0.2);
    expect(near(corner, [28.5 * MM, 28.5 * MM]) / MM).toBeLessThan(0.2);
  });

  it('centre sector and corner gear stickers are mirror-symmetric about x = y', () => {
    expect(hausdorff(centre, centre.map(([x, y]): P2 => [y, x])) / MM).toBeLessThan(1e-6);
    expect(hausdorff(corner, corner.map(([x, y]): P2 => [y, x])) / MM).toBeLessThan(1e-6);
  });

  it('have smooth tangent fillets everywhere (no sharp corners)', () => {
    const tol = ARC_STEP + 1e-6;
    expect(turns(centre).filter((t) => Math.abs(t) > tol).length).toBe(0);
    expect(turns(corner).filter((t) => Math.abs(t) > tol).length).toBe(0);
    expect(turns(edge).filter((t) => Math.abs(t) > tol).length).toBe(0);
  });
});
