import { type P2, type PathNode, SketchError, add2, mul2, path, rot2, sub2 } from './sketch';

/**
 * Sticker outlines of David's Gear Cube (12-tooth face-centre gear split into 4 quarter-sectors,
 * 9-tooth corner gears with 3 teeth per face, and the 2x2x2 octant edge-bar posts).
 *
 * Every outline is a constrained parametric sketch of straight lines, circular arcs and tangent fillets,
 * fitted to a D4-rectified photo of Meffert's David's Gear Cube by `tools/david/fit_stickers.py`.
 * The same sketch construction lives in the Python fitter, and `tests/david/stickers.test.ts` checks
 * that both produce identical reference polygons.
 */

// <generated> by tools/david/fit_stickers.py (re-run it to change these numbers)
export const CENTRE_MM = {
  dCut: 0.6500,
  rHub: 7.8500,
  rRoot: 12.9500,
  rTip: 19.1500,
  wBase: 1.0500,
  wTip: 1.0000,
  rRf: 0.4500,
  rTf: 0.7500,
  rCf: 0.3000,
} as const;

export const CORNER_MM = {
  ue: 28.5000,
  rCut: 7.2000,
  dRoot1: 17.6500,
  phiT: 32.2000,
  dRoot: 17.1500,
  dTip: 23.0500,
  wb: 1.3800,
  wt: 0.9500,
  dEroot: 15.6500,
  dEtip: 19.9000,
  weBase: 1.7200,
  weTip: 1.2200,
  rV1: 0.4500,
  rRf: 0.5000,
  rTf: 0.8500,
  rEtf: 0.7000,
  rEof: 0.4500,
} as const;

export const EDGE_BAR_MM = {
  u0: 1.1500,
  u1: 3.1500,
  v0: 23.6000,
  v1: 28.5000,
  rB: 0.3500,
} as const;

export const PADDING_MM = 0.50;
// </generated>

/** Model units per mm (the face plane is 1 = 30 mm from the centre). */
const U = 1 / 30;

/**
 * Quarter-sector sticker of the 12-tooth face-centre gear on the F face in the UFR quadrant
 * (face coordinates: x right, y up, face centre at the origin), model units, counterclockwise.
 *
 * One half is sketched and mirrored about x = y: the radial cut edge y = dCut, the 15° tooth, and
 * the lower half of the 45° diagonal tooth; mirroring completes the 45° tooth, adds the 75° tooth and
 * the vertical cut edge x = dCut, and closes back to (xIn, dCut) along the inner hub circle of radius
 * rHub around the face centre.
 */
export function centreSticker(mm: typeof CENTRE_MM = CENTRE_MM): P2[] {
  const s = Object.fromEntries(Object.entries(mm).map(([k, v]) => [k, v * U])) as Record<keyof typeof CENTRE_MM, number>;
  if (s.rHub <= s.dCut * Math.SQRT2 + 0.01) throw new SketchError('rHub too small');
  if (s.rRoot <= s.rHub + 0.03 || s.rTip <= s.rRoot + 0.05) throw new SketchError('centre radii out of order');
  if (s.wTip <= s.rTf * 0.8 || s.wBase <= s.wTip - 0.01) throw new SketchError('centre tooth width invalid');

  const xIn = Math.sqrt(s.rHub * s.rHub - s.dCut * s.dCut);
  const xRoot = Math.sqrt(s.rRoot * s.rRoot - s.dCut * s.dCut);
  const t15 = (15 * Math.PI) / 180;
  const t45 = (45 * Math.PI) / 180;

  const b0Lo = rot2([s.rRoot, -s.wBase], t15);
  const t0Lo = rot2([s.rTip, -s.wTip], t15);
  const t0Hi = rot2([s.rTip, +s.wTip], t15);
  const b0Hi = rot2([s.rRoot, +s.wBase], t15);
  const b1Lo = rot2([s.rRoot, -s.wBase], t45);
  const t1Lo = rot2([s.rTip, -s.wTip], t45);

  if (b0Lo[1] <= s.dCut + 0.008) throw new SketchError('15° tooth lower base too close to cut line');

  const half: PathNode[] = [
    { p: [xIn, s.dCut] },
    { p: [xRoot, s.dCut], r: s.rCf },
    { p: b0Lo, r: s.rRf },
    { p: t0Lo, r: s.rTf },
    { p: t0Hi, r: s.rTf },
    { p: b0Hi, r: s.rRf },
    { p: b1Lo, r: s.rRf },
    { p: t1Lo, r: s.rTf },
  ];
  const mirrored: PathNode[] = half
    .slice()
    .reverse()
    .map((nd): PathNode => ({ p: [nd.p[1], nd.p[0]], r: nd.r }));
  const nodes: PathNode[] = [{ ...half[0], arc: { c: [0, 0], ccw: false } }, ...half.slice(1), ...mirrored];
  return path(nodes);
}

/**
 * Corner gear sticker on the F face of the UFR corner (face coordinates: x right, y up, face centre
 * at the origin), model units, counterclockwise.
 *
 * One half is sketched and mirrored about x = y: starting at the diagonal valley (vd, vd) which
 * receives the centre gear's 45° tooth, it traces the lower-right interior tooth (pointing towards the
 * centre gear's 30° valley at angle phiT from the right edge), the side valley (which receives the
 * centre gear's 15° tooth), the half-tooth along the right cube edge x = ue, and the straight outer
 * border up to the circular vertex cutout of radius rCut centred at (ue, ue).
 */
export function cornerSticker(mm: typeof CORNER_MM = CORNER_MM): P2[] {
  const s = Object.fromEntries(
    Object.entries(mm).map(([k, v]) => [k, k === 'phiT' ? (v * Math.PI) / 180 : v * U]),
  ) as Record<keyof typeof CORNER_MM, number>;

  if (s.rCut <= 0.05 || s.dRoot <= s.rCut + 0.05 || s.dTip <= s.dRoot + 0.05) {
    throw new SketchError('corner distances out of order');
  }
  if (s.wt <= s.rTf + 1e-4 || s.wb <= s.wt - 0.005) throw new SketchError('corner tooth width invalid');
  if (s.weTip <= (s.rEtf + s.rEof) * 0.6 || s.weBase <= s.weTip - 0.005) throw new SketchError('edge tooth width invalid');

  const C: P2 = [s.ue, s.ue];
  const uDir: P2 = [-Math.sin(s.phiT), -Math.cos(s.phiT)];
  const vPerp: P2 = [Math.cos(s.phiT), -Math.sin(s.phiT)];

  const vd = s.ue - s.dRoot1 / Math.SQRT2;
  const pDiag: P2 = [vd, vd];
  const bIn = sub2(add2(C, mul2(uDir, s.dRoot)), mul2(vPerp, s.wb));
  const tIn = sub2(add2(C, mul2(uDir, s.dTip)), mul2(vPerp, s.wt));
  const tOut = add2(add2(C, mul2(uDir, s.dTip)), mul2(vPerp, s.wt));
  const bOut = add2(add2(C, mul2(uDir, s.dRoot)), mul2(vPerp, s.wb));

  const eRoot: P2 = [s.ue - s.weBase, s.ue - s.dEroot];
  const eTipIn: P2 = [s.ue - s.weTip, s.ue - s.dEtip];
  const eTipOut: P2 = [s.ue, s.ue - s.dEtip];
  const eTop: P2 = [s.ue, s.ue - s.rCut];

  if (bIn[0] <= bIn[1] + 0.008) throw new SketchError('interior tooth crosses diagonal');

  const half: PathNode[] = [
    { p: bIn, r: s.rRf },
    { p: tIn, r: s.rTf },
    { p: tOut, r: s.rTf },
    { p: bOut, r: s.rRf },
    { p: eRoot, r: s.rRf },
    { p: eTipIn, r: s.rEtf },
    { p: eTipOut, r: s.rEof },
    { p: eTop },
  ];
  const mirrored: PathNode[] = half
    .slice()
    .reverse()
    .map((nd, idx): PathNode =>
      idx === 0
        ? { p: [nd.p[1], nd.p[0]], arc: { c: C, ccw: false } }
        : { p: [nd.p[1], nd.p[0]], r: nd.r },
    );
  return path([{ p: pDiag, r: s.rV1 }, ...half, ...mirrored]);
}

/**
 * Rectangular bar sticker of an octant half-edge post, on the F face at the FR+ half-edge
 * (u in [v0, v1] towards the right edge x = 1, v in [u0, u1] just above the y = 0 horizontal cut line),
 * model units, counterclockwise.
 */
export function edgeBarSticker(mm: typeof EDGE_BAR_MM = EDGE_BAR_MM): P2[] {
  const s = Object.fromEntries(Object.entries(mm).map(([k, v]) => [k, v * U])) as Record<keyof typeof EDGE_BAR_MM, number>;
  if (s.u1 - s.u0 <= 2 * s.rB + 0.005 || s.v1 - s.v0 <= 2 * s.rB + 0.005) {
    throw new SketchError('edge bar too small for fillet');
  }
  return path([
    { p: [s.v0, s.u0], r: s.rB },
    { p: [s.v1, s.u0], r: s.rB },
    { p: [s.v1, s.u1], r: s.rB },
    { p: [s.v0, s.u1], r: s.rB },
  ]);
}
