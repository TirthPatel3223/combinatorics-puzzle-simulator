import { MOVE_TOKENS, type Move, type MoveToken } from './notation';

const FACE_AMOUNTS = [1, -1, 1, -1, 2] as const;
const GEAR_AMOUNTS = [1, -1, 1, -1, 2, -2, 3] as const;

/**
 * Seeded random-move scramble using only `U`, `F`, `L` and `G` (keeping the DBR reference corner's
 * octant frame fixed). Consecutive moves use different tokens so nothing cancels or merges, and `G`
 * moves are interleaved frequently so the centre sectors are thoroughly mixed across faces.
 */
export function generateScramble(rng: () => number, length = 25): Move[] {
  const moves: Move[] = [];
  let prev: MoveToken | null = null;
  let sinceGear = 0;
  while (moves.length < length) {
    let token: MoveToken;
    if (prev !== 'G' && sinceGear >= 2 && rng() < 0.55) {
      token = 'G';
    } else {
      const options = MOVE_TOKENS.filter((t) => t !== prev);
      token = options[Math.floor(rng() * options.length)];
    }
    const amounts = token === 'G' ? GEAR_AMOUNTS : FACE_AMOUNTS;
    const amount = amounts[Math.floor(rng() * amounts.length)];
    moves.push({ token, amount });
    prev = token;
    sinceGear = token === 'G' ? 0 : sinceGear + 1;
  }
  return moves;
}
