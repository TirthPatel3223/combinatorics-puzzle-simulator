import { generateGroup } from '../puzzle/group';
import { type Mat3, type Vec3, mat3Vec, normalize } from '../puzzle/vec';
import { CENTRE_SLOTS, CORNER_SLOTS, EDGE_SLOTS, type Face, faceOf, findByDir } from './geometry';

export type PieceKind = 'corner' | 'centre' | 'edge';

export interface DavidPiece {
  readonly id: number;
  readonly kind: PieceKind;
  /** Name of the home slot, e.g. "UFR", "F:UFR", "FR:UFR". */
  readonly name: string;
  /** Home slot index in CORNER_SLOTS (0-7), CENTRE_SLOTS (0-23) or EDGE_SLOTS (0-23). */
  readonly home: number;
  /** Index in CUBE_GROUP of the rotation taking the prototype (built in UFR) to its home slot. */
  readonly homeOri: number;
  /**
   * Sticker colours, in prototype sticker order:
   *  - corner: [U (+y), F (+z), R (+x) faces of the UFR prototype]
   *  - centre: [F (+z) face of the F:UFR prototype]
   *  - edge:   [F (+z), R (+x) faces of the FR:UFR prototype]
   */
  readonly colors: readonly Face[];
}

const R90X: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const R90Y: Mat3 = [0, 0, 1, 0, 1, 0, -1, 0, 0];
/** The 24 proper rotations of the cube. */
export const CUBE_GROUP = generateGroup([R90X, R90Y]);

const PROTO_CORNER_DIR: Vec3 = normalize([1, 1, 1]);
const PROTO_CENTRE_DIR: Vec3 = normalize([1, 1, 4]);
const PROTO_EDGE_DIR: Vec3 = normalize([2, 1, 2]);

/** Corner slot index (0-7) reached by each cube rotation applied to the UFR prototype. */
export const CORNER_SLOT_OF_ORI: readonly number[] = CUBE_GROUP.elements.map((g) =>
  findByDir(CORNER_SLOTS, mat3Vec(g, PROTO_CORNER_DIR)),
);

/** Centre slot index (0-23) reached by each cube rotation applied to the F:UFR prototype (a bijection). */
export const CENTRE_SLOT_OF_ORI: readonly number[] = CUBE_GROUP.elements.map((g) =>
  findByDir(CENTRE_SLOTS, mat3Vec(g, PROTO_CENTRE_DIR)),
);

/** Edge slot index (0-23) reached by each cube rotation applied to the FR:UFR prototype (a bijection). */
export const EDGE_SLOT_OF_ORI: readonly number[] = CUBE_GROUP.elements.map((g) =>
  findByDir(EDGE_SLOTS, mat3Vec(g, PROTO_EDGE_DIR)),
);

function face(v: Vec3): Face {
  const f = faceOf(v);
  if (!f) throw new Error(`not a face normal: ${v}`);
  return f;
}

function buildPieces(): DavidPiece[] {
  const pieces: DavidPiece[] = [];
  CORNER_SLOTS.forEach((slot, i) => {
    const ori = CORNER_SLOT_OF_ORI.indexOf(i);
    const g = CUBE_GROUP.elements[ori];
    pieces.push({
      id: pieces.length,
      kind: 'corner',
      name: slot.name,
      home: i,
      homeOri: ori,
      colors: [face(mat3Vec(g, [0, 1, 0])), face(mat3Vec(g, [0, 0, 1])), face(mat3Vec(g, [1, 0, 0]))],
    });
  });
  CENTRE_SLOTS.forEach((slot, i) => {
    const ori = CENTRE_SLOT_OF_ORI.indexOf(i);
    const g = CUBE_GROUP.elements[ori];
    pieces.push({
      id: pieces.length,
      kind: 'centre',
      name: slot.name,
      home: i,
      homeOri: ori,
      colors: [face(mat3Vec(g, [0, 0, 1]))],
    });
  });
  EDGE_SLOTS.forEach((slot, i) => {
    const ori = EDGE_SLOT_OF_ORI.indexOf(i);
    const g = CUBE_GROUP.elements[ori];
    pieces.push({
      id: pieces.length,
      kind: 'edge',
      name: slot.name,
      home: i,
      homeOri: ori,
      colors: [face(mat3Vec(g, [0, 0, 1])), face(mat3Vec(g, [1, 0, 0]))],
    });
  });
  return pieces;
}

/** All 56 pieces: 8 corner gears (ids 0-7), 24 centre sectors (8-31), 24 half-edge posts (32-55). */
export const PIECES: readonly DavidPiece[] = buildPieces();

export const PIECE_COUNT = PIECES.length;
