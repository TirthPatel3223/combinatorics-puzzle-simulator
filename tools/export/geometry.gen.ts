/**
 * Geometry export for the solving pipeline (the Cube_Solving_Pipeline project).
 *
 * For each Tangram variant this writes the pieces, stickers and moves exactly as the app builds them:
 *   - every sticker as a frame in space: its centre (area centroid) and its outward normal, with its
 *     colour (the cube face it sits on when solved) and the piece it belongs to;
 *   - every piece's vertices and centroid (the pipeline proves from them that no move ever cuts a piece);
 *   - every primitive move as a rotation matrix plus the region it turns: pieces whose centroid c has
 *     n·c > d. Corner layers give two moves (one 60° or 120° step each way), flips one (self-inverse);
 *   - check walks: seeded random move sequences played on the app's own engine (PuzzleState), with the
 *     final orientation matrix of every piece. The pipeline replays them on the move tables it compiles.
 *
 * The pipeline compiles this file into permutation tables (core/geometry.py there); nothing in it is
 * specific to the Tangram Cube except this exporter.
 *
 * Run: npx vitest run --config tools/export/vitest.config.ts
 * Output: tools/export/out/tangram-<variant>.json, or the folder in EXPORT_DIR.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { CUT_S, FACE_COLORS } from '../../src/config';
import { type PuzzleModel, createModel } from '../../src/puzzle/model';
import { AXES, type Move, formatMove, invertMove, mulberry32 } from '../../src/puzzle/moves';
import { FACE_IDS, FACE_NORMALS } from '../../src/puzzle/pieces';
import { PuzzleState } from '../../src/puzzle/state';
import type { VariantId } from '../../src/puzzle/variants';
import { type Mat3, type Vec3, add, cross, length, scale, sub } from '../../src/puzzle/vec';

const OUT = process.env.EXPORT_DIR ?? join(__dirname, 'out');
const CHECK_WALKS = 20;
const SEED = 20261115;

const rows = (m: Mat3): number[][] => [
  [m[0], m[1], m[2]],
  [m[3], m[4], m[5]],
  [m[6], m[7], m[8]],
];

/** Area centroid of a planar convex polygon. */
function polygonCentroid(pts: readonly Vec3[]): Vec3 {
  let area = 0;
  let acc: Vec3 = [0, 0, 0];
  for (let t = 1; t + 1 < pts.length; t++) {
    const a = length(cross(sub(pts[t], pts[0]), sub(pts[t + 1], pts[0]))) / 2;
    area += a;
    acc = add(acc, scale(add(add(pts[0], pts[t]), pts[t + 1]), a / 3));
  }
  return scale(acc, 1 / area);
}

function gitInfo(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
    const dirty = execSync('git status --porcelain -- src', { cwd: __dirname }).toString().trim() !== '';
    return { commit, dirty };
  } catch {
    return { commit: 'unknown', dirty: true };
  }
}

/** The primitive moves: one step each way on a corner layer, one flip per edge. */
function primitiveMoves(model: PuzzleModel): Move[] {
  const out: Move[] = [];
  for (const axis of AXES) {
    out.push({ axis, amount: 1 });
    if (model.axes[axis].kind === 'corner') out.push({ axis, amount: -1 });
  }
  return out;
}

function exportVariant(variant: VariantId): object {
  const model = createModel(variant, CUT_S);
  const moves = primitiveMoves(model);
  const pieces = model.pieces.map((p) => ({
    id: p.id,
    layer: p.layer,
    code: p.code,
    centroid: p.poly.centroid,
    vertices: p.poly.vertices,
  }));
  const stickers = model.pieces.flatMap((p) =>
    p.stickers.map((s) => ({
      piece: p.id,
      colour: FACE_IDS.indexOf(s.face),
      centre: polygonCentroid(s.polygon),
      normal: FACE_NORMALS[s.face],
      polygon: s.polygon,
    })),
  );
  const moveDefs = moves.map((m) => {
    const def = model.axes[m.axis];
    return {
      name: formatMove(m),
      inverse: formatMove(invertMove(m)),
      axis: m.axis,
      amount: m.amount,
      order: def.kind === 'corner' ? model.variant.cornerOrder : 2,
      rotation: rows(model.moveMatrix(m)),
      region: { normal: def.region.n, offset: def.region.d },
    };
  });

  const checks = [];
  for (let k = 0; k < CHECK_WALKS; k++) {
    const rng = mulberry32(SEED + k);
    const n = 20 + Math.floor(rng() * 181);
    const walk: Move[] = [];
    for (let i = 0; i < n; i++) walk.push(moves[Math.floor(rng() * moves.length)]);
    const st = PuzzleState.solved(model);
    st.applyAll(walk);
    checks.push({
      moves: walk.map(formatMove),
      orientation: model.pieces.map((_, i) => rows(st.pieceMatrix(i))),
    });
  }

  return {
    format: 'puzzle-geometry/1',
    name: variant === 'extreme' ? 'tangram_cube_extreme' : 'tangram_cube',
    title: model.variant.name,
    source: { project: 'Cube_Modeling', ...gitInfo(), cut_s: CUT_S, variant },
    colours: FACE_IDS.map((f) => ({ face: f, hex: FACE_COLORS[f] })),
    pieces,
    stickers,
    moves: moveDefs,
    checks,
  };
}

it('exports the Tangram Cube geometry for the solving pipeline', () => {
  mkdirSync(OUT, { recursive: true });
  for (const variant of ['extreme', 'original'] as const) {
    writeFileSync(join(OUT, `tangram-${variant}.json`), JSON.stringify(exportVariant(variant)) + '\n');
  }
});
