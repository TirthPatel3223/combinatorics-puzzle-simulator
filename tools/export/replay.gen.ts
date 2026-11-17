/**
 * Replays solutions found by the solving pipeline on this app's own engine.
 *
 * The pipeline writes a JSON list of { variant, scramble, solution } in the app's notation
 * (scripts/solve.py --replay-json there). Each scramble is applied to a solved puzzle, then the solution;
 * the puzzle must be solved again. This is an independent check: the pipeline already replays every
 * solution on the move tables it compiled from this model.
 *
 * Run: SOLUTIONS=<path to the JSON> npx vitest run --config tools/export/vitest.config.ts
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { CUT_S } from '../../src/config';
import { createModel } from '../../src/puzzle/model';
import { parseAlgorithm } from '../../src/puzzle/moves';
import { PuzzleState } from '../../src/puzzle/state';
import type { VariantId } from '../../src/puzzle/variants';

interface Entry {
  readonly variant: VariantId;
  readonly scramble: string;
  readonly solution: string;
}

const path = process.env.SOLUTIONS;

it.skipIf(!path)('pipeline solutions solve their scrambles on the 3D engine', () => {
  const entries = JSON.parse(readFileSync(path!, 'utf8')) as Entry[];
  expect(entries.length).toBeGreaterThan(0);
  for (const [k, e] of entries.entries()) {
    const model = createModel(e.variant, CUT_S);
    const scramble = parseAlgorithm(e.scramble, model.variant);
    const solution = parseAlgorithm(e.solution, model.variant);
    if (!scramble.ok || !solution.ok) throw new Error(`entry ${k}: cannot parse the notation`);
    const st = PuzzleState.solved(model);
    st.applyAll(scramble.moves);
    expect(st.isSolved(), `entry ${k}: the scramble leaves the puzzle solved`).toBe(scramble.moves.length === 0);
    st.applyAll(solution.moves);
    expect(st.isSolved(), `entry ${k}: the solution does not solve the scramble`).toBe(true);
  }
  console.log(`replayed ${entries.length} solutions on the 3D engine: all solved`);
});
