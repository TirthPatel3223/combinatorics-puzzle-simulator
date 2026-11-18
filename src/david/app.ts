import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { AppContext } from '../apps/context';
import { MoveHistory } from '../puzzle/history';
import { mulberry32 } from '../puzzle/moves';
import { GestureControls } from '../render/controls';
import { loadManifoldKernel } from '../render/manifold';
import { type ViewPreset, createStage } from '../render/scene';
import { TIMING } from './config';
import { type Move, type MoveToken, formatMove, formatSequence, invertMove, parseAlgorithm } from './notation';
import { DavidAnimator } from './render/animator';
import { MoveLabels } from './render/labels';
import { type DavidVisual, buildCoreMesh, buildDavidVisuals, setHighlight } from './render/meshes';
import { DavidPicker } from './render/picking';
import { buildDavidGeometry, defaultFillet } from './render/pieces';
import { generateScramble } from './scramble';
import { DavidState } from './state';
import { bindDavidKeyboard } from './ui/keyboard';
import { type DavidStatus, type DavidView, createDavidPanel } from './ui/panel';

const IDENTITY_ROWS: ViewPreset['rows'] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * Camera presets in the puzzle frame (x = R, y = U, z = F).
 * The default corner view looks at the UFL control corner (with the fixed DBR corner anchored at the back),
 * showing all three active turning faces: U (white) on top, L (red) front-left, and F (green) front-right.
 */
export const DAVID_VIEWS: Readonly<Record<DavidView, ViewPreset>> = {
  corner: { rows: IDENTITY_ROWS, azimuth: -45, elevation: 28 },
  face: { rows: IDENTITY_ROWS, azimuth: 0, elevation: 0 },
  edge: { rows: IDENTITY_ROWS, azimuth: 0, elevation: 45 },
};

/** The David's Gear Cube app. */
export async function start(ctx: AppContext): Promise<void> {
  const { stageEl, panelEl, tipEl } = ctx;
  document.title = "David's Gear Cube · 3D simulator";

  const history = new MoveHistory<Move>(invertMove);
  let speed = 1;
  let scrambleText: string | null = null;
  let hovered: MoveToken | null = null;
  let logical = DavidState.solved();
  let ready = false;
  let animator!: DavidAnimator;
  let visuals!: DavidVisual[];
  let picker!: DavidPicker;

  const stage = createStage(stageEl, DAVID_VIEWS, 'corner');
  const labels = new MoveLabels(stage.root);

  const panel = createDavidPanel(panelEl, {
    onMoveButton: (token, ccw) => turn(token, ccw),
    onHoverMove: (token) => hover(token, null),
    onScramble: scramble,
    onReset: reset,
    onUndo: undo,
    onRedo: redo,
    onAlgorithm: (text) => {
      if (!ready) return 'Still building the pieces…';
      if (!text.trim()) return "Type some moves first, e.g. (G' F' G F L2) (F' G' F G L2).";
      const p = parseAlgorithm(text);
      if (!p.ok) return p.error;
      for (const m of p.moves) enqueue(m);
      return null;
    },
    onView: (view) => {
      stage.setView(view);
      panel.setView(view);
    },
    onLabels: (on) => labels.setVisible(on),
    onSpeed: (f) => {
      speed = f;
    },
  });

  refresh({ loading: true, solved: true, frameSolved: true, report: logical.report() });
  requestAnimationFrame(function loop(now) {
    if (ready) animator.update(now);
    labels.update(stage.camera);
    stage.frame(now);
    requestAnimationFrame(loop);
  });

  const wasm = await loadManifoldKernel(wasmUrl);
  const geo = buildDavidGeometry(wasm, ctx.params.get('round') === '0' ? null : defaultFillet());
  visuals = buildDavidVisuals(geo);
  for (const v of visuals) stage.root.add(v.group);
  stage.root.add(buildCoreMesh(geo));
  animator = new DavidAnimator(visuals, DavidState.solved());
  ready = true;

  picker = new DavidPicker(stage, visuals, () => animator.visualState, {
    onHover: (token, x, y) => hover(token, { x, y }),
    onTurn: (token, alt) => turn(token, alt),
  });
  new GestureControls(stageEl, stage, {
    onTap: (x, y, alt) => picker.tap(x, y, alt),
    onGestureStart: () => picker.clearHover(),
  });
  bindDavidKeyboard({ onMove: (t, ccw) => turn(t, ccw), onUndo: undo, onRedo: redo });

  animator.onApplied = () => {
    picker.invalidate();
    if (hovered) hover(hovered, null);
  };

  function turn(token: MoveToken, counterclockwise: boolean) {
    if (!ready) return;
    enqueue({ token, amount: counterclockwise ? -1 : 1 });
  }

  function enqueue(m: Move, record = true) {
    logical.apply(m);
    animator.enqueue(m, TIMING.moveMs / speed);
    if (record) history.push(m);
    refreshStatus();
  }

  function undo() {
    if (!ready) return;
    const m = history.undo();
    if (m) enqueue(m, false);
    else refreshStatus();
  }

  function redo() {
    if (!ready) return;
    const m = history.redo();
    if (m) enqueue(m, false);
    else refreshStatus();
  }

  function reset() {
    if (!ready) return;
    logical = DavidState.solved();
    animator.reset(DavidState.solved());
    picker.invalidate();
    history.clear();
    scrambleText = null;
    hover(hovered, null);
    refreshStatus();
  }

  function scramble() {
    if (!ready) return;
    const moves = generateScramble(mulberry32((Math.random() * 2 ** 32) >>> 0));
    logical = DavidState.solved();
    animator.reset(DavidState.solved());
    picker.invalidate();
    history.clear();
    for (const m of moves) {
      logical.apply(m);
      animator.enqueue(m, TIMING.fastMoveMs / speed);
    }
    scrambleText = formatSequence(moves);
    refreshStatus();
  }

  function hover(token: MoveToken | null, at: { x: number; y: number } | null) {
    hovered = token;
    if (!ready) return;
    if (!token || animator.busy) {
      for (const v of visuals) setHighlight(v, 'none');
      labels.setActive(null);
      tipEl.hidden = true;
      return;
    }
    const { primary, driven } = animator.visualState.movingParts(token);
    const inPrimary = new Set(primary);
    const inDriven = new Set(driven);
    for (const v of visuals) {
      setHighlight(v, inPrimary.has(v.pieceId) ? 'primary' : inDriven.has(v.pieceId) ? 'driven' : 'none');
    }
    labels.setActive(token);
    if (at) {
      tipEl.textContent =
        token === 'G'
          ? 'G · corners 120° CW, centres 90° CCW'
          : `${formatMove({ token, amount: 1 })} · 90° (2×2×2 half-cube)`;
      tipEl.classList.remove('is-blocked');
      const r = stageEl.getBoundingClientRect();
      tipEl.style.transform = `translate(${at.x - r.left + 14}px, ${at.y - r.top + 16}px)`;
      tipEl.hidden = false;
    }
  }

  function computeStatus(st: DavidState): DavidStatus {
    return { solved: st.isSolved(), frameSolved: st.isFrameSolved(), report: st.report() };
  }

  function refreshStatus() {
    refresh(computeStatus(logical));
  }

  function refresh(status: DavidStatus) {
    panel.update({
      moves: history.moves,
      redoable: history.redoable,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      scramble: scrambleText,
      status,
    });
  }

  refreshStatus();

  Object.assign(window as unknown as Record<string, unknown>, {
    david: {
      stage,
      get state() {
        return animator.visualState;
      },
      get logical() {
        return logical;
      },
      play(text: string) {
        const p = parseAlgorithm(text);
        if (!p.ok) return p.error;
        for (const m of p.moves) enqueue(m);
        return 'ok';
      },
      preview(text: string | null, t = 0.5) {
        if (text === null) return animator.previewAt(null);
        const p = parseAlgorithm(text);
        if (!p.ok || p.moves.length !== 1) return 'give one move';
        animator.previewAt(p.moves[0], t);
        return 'ok';
      },
    },
  });
}
