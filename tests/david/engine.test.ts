import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/puzzle/moves';
import { CENTRE_SLOTS, CORNER_SLOTS, EDGE_SLOTS, FACES, FIXED_CORNER, TURN_FACES } from '../../src/david/geometry';
import { CENTRE_SLOT_OF_ORI, CORNER_SLOT_OF_ORI, CUBE_GROUP, EDGE_SLOT_OF_ORI, PIECES } from '../../src/david/model';
import {
  type Move,
  formatSequence,
  invertSequence,
  parseAlgorithm,
} from '../../src/david/notation';
import { generateScramble } from '../../src/david/scramble';
import { DavidState } from '../../src/david/state';

const alg = (text: string): Move[] => {
  const r = parseAlgorithm(text);
  if (!r.ok) throw new Error(r.error);
  return r.moves;
};

const after = (text: string): DavidState => {
  const st = DavidState.solved();
  st.applyAll(alg(text));
  return st;
};

const centreAt = (st: DavidState, slotName: string) => {
  const s = CENTRE_SLOTS.findIndex((x) => x.name === slotName);
  return PIECES.find((p) => p.kind === 'centre' && CENTRE_SLOT_OF_ORI[st.ori[p.id]] === s)!;
};

describe("David's Gear Cube slots and pieces", () => {
  it('has 8 corner, 24 centre-sector and 24 half-edge slots, and 56 pieces (96 stickers)', () => {
    expect(CORNER_SLOTS).toHaveLength(8);
    expect(CENTRE_SLOTS).toHaveLength(24);
    expect(EDGE_SLOTS).toHaveLength(24);
    expect(PIECES).toHaveLength(56);
    const totalStickers = PIECES.reduce((acc, p) => acc + p.colors.length, 0);
    expect(totalStickers).toBe(96);
    for (const f of FACES) {
      const count = PIECES.reduce((acc, p) => acc + p.colors.filter((c) => c === f).length, 0);
      expect(count, `stickers of face ${f}`).toBe(16);
    }
  });

  it('maps the 24 cube rotations 3-to-1 onto corner slots and 1-to-1 onto centre and edge slots', () => {
    expect(CUBE_GROUP.elements).toHaveLength(24);
    for (let c = 0; c < 8; c++) {
      expect(CORNER_SLOT_OF_ORI.filter((s) => s === c)).toHaveLength(3);
    }
    expect([...CENTRE_SLOT_OF_ORI].sort((a, b) => a - b)).toEqual(CENTRE_SLOTS.map((_, i) => i));
    expect([...EDGE_SLOT_OF_ORI].sort((a, b) => a - b)).toEqual(EDGE_SLOTS.map((_, i) => i));
  });
});

describe('moves and group properties', () => {
  it('each active face turn (U, F, L) moves 28 pieces (4 octants) and has order 4', () => {
    const st0 = DavidState.solved();
    for (const f of TURN_FACES) {
      const { primary, driven } = st0.movingParts(f);
      expect(primary).toHaveLength(28);
      expect(driven).toHaveLength(0);
      const st = DavidState.solved();
      for (let i = 1; i <= 4; i++) {
        st.apply({ token: f, amount: 1 });
        expect(st.equals(st0), `${f}^${i}`).toBe(i === 4);
      }
    }
  });

  it('U, F and L never move the fixed DBR octant frame, its corner gear, or its 3 centre sectors', () => {
    const dbrOct = CORNER_SLOTS.findIndex((c) => c.name === FIXED_CORNER);
    const dbrPieces = PIECES.filter((p) => {
      if (p.kind === 'corner') return p.home === dbrOct;
      if (p.kind === 'centre') return CENTRE_SLOTS[p.home].octant === dbrOct;
      return EDGE_SLOTS[p.home].octant === dbrOct;
    });
    expect(dbrPieces).toHaveLength(7); // 1 corner + 3 centre sectors + 3 half-edge posts
    const st = after("U F L U2 F' L' U F2 L2");
    for (const p of dbrPieces) {
      expect(st.ori[p.id], p.name).toBe(p.homeOri);
    }
  });

  it('the gear turn G moves 8 corners (120° CW) and 24 centres (90° CCW), leaves all 24 edge posts fixed, and has order 12', () => {
    const st0 = DavidState.solved();
    const { primary, driven } = st0.movingParts('G');
    expect(primary).toHaveLength(8);
    expect(driven).toHaveLength(24);

    const st = DavidState.solved();
    for (let i = 1; i <= 12; i++) {
      st.apply({ token: 'G', amount: 1 });
      // Edge posts never move during G:
      for (const p of PIECES) {
        if (p.kind === 'edge') expect(st.ori[p.id]).toBe(p.homeOri);
      }
      // Corners have period 3 (120° per step):
      const cornersHome = PIECES.filter((p) => p.kind === 'corner').every((p) => st.ori[p.id] === p.homeOri);
      expect(cornersHome, `G^${i} corners`).toBe(i % 3 === 0);
      // Centre sectors have period 4 (90° per step):
      const centresHome = PIECES.filter((p) => p.kind === 'centre').every((p) => st.ori[p.id] === p.homeOri);
      expect(centresHome, `G^${i} centres`).toBe(i % 4 === 0);
      // Visually solved whenever corners are home (since centre sectors stay on their home face under pure G):
      expect(st.isSolved(), `G^${i} visually solved`).toBe(i % 3 === 0);
      // Exact piece-identity period is lcm(3, 4) = 12:
      expect(st.equals(st0), `G^${i} exact`).toBe(i === 12);
    }
  });

  it("verifies Martywolfman's centre-swapping algorithms with U, F, L and G", () => {
    // 1. Swap two centres on L and two on R without disturbing the 2x2x2 octants or corners:
    const swapLR = after("(F G F' G' L2) (G F G' F' L2)");
    expect(swapLR.isFrameSolved()).toBe(true);
    expect(swapLR.report()).toEqual({ octantsDisplaced: 0, cornerTwist: 0, centresMisplaced: 0 });
    expect(centreAt(swapLR, 'L:UFL').name).toBe('L:DBL');
    expect(centreAt(swapLR, 'L:DBL').name).toBe('L:UFL');
    expect(centreAt(swapLR, 'R:UBR').name).toBe('R:DFR');
    expect(centreAt(swapLR, 'R:DFR').name).toBe('R:UBR');
    // Order 2: applying it twice returns to exact solved state:
    expect(after("(F G F' G' L2) (G F G' F' L2) (F G F' G' L2) (G F G' F' L2)").equals(DavidState.solved())).toBe(true);

    // 2. Swap two top (U) centres with two bottom (D) centres without disturbing the 2x2x2 octants or corners:
    const swapUD = after("(G' F' G F L2) (F' G' F G L2)");
    expect(swapUD.isFrameSolved()).toBe(true);
    expect(swapUD.report()).toEqual({ octantsDisplaced: 0, cornerTwist: 0, centresMisplaced: 4 });
    expect(swapUD.isSolved()).toBe(false);
    expect(centreAt(swapUD, 'U:UFL').name).toBe('D:DBL');
    expect(centreAt(swapUD, 'D:DBL').name).toBe('U:UFL');
    expect(centreAt(swapUD, 'U:UBR').name).toBe('D:DFR');
    expect(centreAt(swapUD, 'D:DFR').name).toBe('U:UBR');
    // Order 2:
    expect(after("(G' F' G F L2) (F' G' F G L2) (G' F' G F L2) (F' G' F G L2)").equals(DavidState.solved())).toBe(true);
  });

  it('a random scramble followed by its inverse returns to solved and keeps DBR edge bars fixed', () => {
    const rng = mulberry32(2026);
    const dbrOct = CORNER_SLOTS.findIndex((c) => c.name === FIXED_CORNER);
    const dbrEdges = PIECES.filter((p) => p.kind === 'edge' && EDGE_SLOTS[p.home].octant === dbrOct);
    for (let trial = 0; trial < 20; trial++) {
      const moves = generateScramble(rng, 30);
      const st = DavidState.solved();
      st.applyAll(moves);
      for (const e of dbrEdges) expect(st.ori[e.id]).toBe(e.homeOri);
      st.applyAll(invertSequence(moves));
      expect(st.equals(DavidState.solved())).toBe(true);
    }
  });

  it('parses and formats notation cleanly, rejecting fixed-corner faces and full-cycle no-ops', () => {
    const moves = alg("U F' L2 G G' G3 G4'");
    expect(formatSequence(moves)).toBe("U F' L2 G G' G3 G4'");
    expect(parseAlgorithm('R').ok).toBe(false);
    expect(parseAlgorithm('D').ok).toBe(false);
    expect(parseAlgorithm('B').ok).toBe(false);
    expect(parseAlgorithm('U4').ok).toBe(false);
    expect(parseAlgorithm('G12').ok).toBe(false);
  });
});
