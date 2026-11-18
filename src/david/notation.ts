import { TURN_FACES, type TurnFace } from './geometry';

/**
 * Notation for David's Gear Cube (with the DBR reference corner fixed):
 *  - `U`, `F`, `L`: 90° clockwise quarter turn of that face (seen from outside the face); order 4.
 *  - `G`: gear turn — twists all 8 corner gears 120° clockwise (seen from outside each corner) and
 *    rotates all 6 face-centre gears 90° counterclockwise (seen from outside each face), while
 *    leaving the 8 octant frames (edge bars) fixed. `G3` restores all corner orientations (centres
 *    rotated 270°), `G4` restores all centre sectors (corners twisted 120°), and `G12` is a full
 *    identity cycle.
 */
export type MoveToken = TurnFace | 'G';
export const MOVE_TOKENS: readonly MoveToken[] = [...TURN_FACES, 'G'];

export interface Move {
  readonly token: MoveToken;
  /** Step count, positive for clockwise / G, negative for ' (never 0). */
  readonly amount: number;
}

/** Order of a move generator in the exact piece-permutation group. */
export function tokenOrder(token: MoveToken): number {
  return token === 'G' ? 12 : 4;
}

/** Normalise a step count modulo the generator's order into (−order/2, order/2] (0 stays 0). */
export function normalizeAmount(token: MoveToken, amount: number): number {
  const order = tokenOrder(token);
  let a = ((Math.round(amount) % order) + order) % order;
  if (a > order / 2) a -= order;
  return a;
}

export function invertMove(m: Move): Move {
  return { token: m.token, amount: normalizeAmount(m.token, -m.amount) };
}

export function invertSequence(moves: readonly Move[]): Move[] {
  return moves.slice().reverse().map(invertMove);
}

export function formatMove(m: Move): string {
  const n = Math.abs(m.amount);
  return m.token + (n === 1 ? '' : String(n)) + (m.amount < 0 ? "'" : '');
}

export function formatSequence(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ');
}

export type ParseResult =
  | { readonly ok: true; readonly moves: Move[] }
  | { readonly ok: false; readonly error: string; readonly index: number };

const TOKEN = /([A-Za-z])(\d*)(['’`]?)(\d*)/y;

/** Parse e.g. "(F G F' G' L2) (G F G' F' L2)" (whitespace, parentheses and commas optional). */
export function parseAlgorithm(text: string): ParseResult {
  const moves: Move[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/[\s,;()[\]]/.test(ch)) {
      i++;
      continue;
    }
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(text);
    if (!m) {
      return {
        ok: false,
        error: `Unexpected "${ch}". Use moves ${MOVE_TOKENS.join(' ')}, with an optional number and '.`,
        index: i,
      };
    }
    const raw = m[1].toUpperCase();
    if (!(MOVE_TOKENS as readonly string[]).includes(raw)) {
      return {
        ok: false,
        error: `"${m[0]}": only ${MOVE_TOKENS.join(', ')} moves are used (the DBR corner is kept fixed).`,
        index: i,
      };
    }
    const token = raw as MoveToken;
    const digits = m[2] || m[4];
    if (m[2] && m[4]) {
      return { ok: false, error: `"${m[0]}": put the number before the ' (e.g. ${token}2').`, index: i };
    }
    const count = digits ? parseInt(digits, 10) : 1;
    const amount = normalizeAmount(token, m[3] ? -count : count);
    if (amount === 0) {
      const order = tokenOrder(token);
      return {
        ok: false,
        error: `${m[0]} is ${order} steps (a full cycle): it has no effect.`,
        index: i,
      };
    }
    moves.push({ token, amount });
    i += m[0].length;
  }
  return { ok: true, moves };
}
