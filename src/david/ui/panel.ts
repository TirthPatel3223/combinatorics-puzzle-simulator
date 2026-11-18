import { MOVE_TOKENS, type Move, type MoveToken, formatMove } from '../notation';
import type { DavidReport } from '../state';

export type DavidView = 'corner' | 'face' | 'edge';

export interface DavidPanelHandlers {
  /** A move button (`U`, `F`, `L`, `G`); `counterclockwise` for the ′ row (or Shift-click / right-click). */
  onMoveButton(token: MoveToken, counterclockwise: boolean): void;
  onHoverMove(token: MoveToken | null): void;
  onScramble(): void;
  onReset(): void;
  onUndo(): void;
  onRedo(): void;
  /** Returns an error message, or null when the algorithm was applied. */
  onAlgorithm(text: string): string | null;
  onView(view: DavidView): void;
  onLabels(on: boolean): void;
  onSpeed(factor: number): void;
}

export interface DavidStatus {
  readonly loading?: boolean;
  readonly solved: boolean;
  readonly frameSolved: boolean;
  readonly report: DavidReport;
}

export interface DavidPanelView {
  readonly moves: readonly Move[];
  readonly redoable: readonly Move[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly scramble: string | null;
  readonly status: DavidStatus;
}

export interface DavidPanel {
  update(view: DavidPanelView): void;
  setView(view: DavidView): void;
}

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  shuffle: svg('<path d="M3 17h2.2c1.3 0 2.5-.6 3.2-1.7l5.2-7.6c.7-1.1 1.9-1.7 3.2-1.7H21"/><path d="m18 3 3 3-3 3"/><path d="M3 7h2.6c1.2 0 2.3.5 3 1.4"/><path d="M21 17h-4.4c-1.2 0-2.3-.5-3-1.4"/><path d="m18 14 3 3-3 3"/>'),
  reset: svg('<path d="M20 11.5A8 8 0 1 1 17.7 6"/><path d="M20.5 3.5V8H16"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
};

const MOVE_TITLE: Record<MoveToken, (ccw: boolean) => string> = {
  U: (ccw) => `Up (top) face, 90° ${ccw ? 'counterclockwise' : 'clockwise'}`,
  F: (ccw) => `Front face, 90° ${ccw ? 'counterclockwise' : 'clockwise'}`,
  L: (ccw) => `Left face, 90° ${ccw ? 'counterclockwise' : 'clockwise'}`,
  G: (ccw) =>
    `Corner gear turn: all 8 corners 120° ${ccw ? 'counterclockwise' : 'clockwise'}, all 6 face centres 90° ${ccw ? 'clockwise' : 'counterclockwise'}`,
};

function template(): string {
  const row = (ccw: boolean) =>
    MOVE_TOKENS.map(
      (t) =>
        `<button type="button" class="mv mv--face" data-token="${t}" data-ccw="${ccw ? 1 : 0}" title="${MOVE_TITLE[t](ccw)}">${t}${ccw ? '′' : ''}</button>`,
    ).join('');
  return /* html */ `
  <header class="panel__header">
    <p class="eyebrow eyebrow--brand">${ICON.gear}<span>Meffert's · David Tzur &amp; Oskar van Deventer</span></p>
    <h1 class="brand__title">David's Gear Cube</h1>
    <p class="brand__meta">2012 design · 60 mm · 56 pieces · 9:12 gear ratio</p>
  </header>

  <section class="card" aria-labelledby="h-turn">
    <h2 id="h-turn" class="eyebrow">Turn</h2>
    <p class="mode-note"><code>U</code>, <code>F</code> and <code>L</code> turn those 2×2×2 half-cubes 90° (keeping the <code>DBR</code> reference corner fixed).
      <code>G</code> twists the opposite control corners (<code>UFL</code>–<code>DBR</code>) 120°, driving all 8 corners 120° and all 6 face centres 90°.</p>
    <div class="face-grid face-grid--4">${row(false)}${row(true)}</div>
    <p class="status" data-ref="status" role="status"></p>
    <p class="hint">Drag or two-finger swipe to rotate, pinch to zoom. Click the <code>UFL</code> or <code>DBR</code> corner gear for <code>G</code>;
      click a piece on <code>U</code>, <code>F</code> or <code>L</code> to turn that face (Shift-click or right-click for ′). Keys
      <kbd>U</kbd> <kbd>F</kbd> <kbd>L</kbd> <kbd>G</kbd>, add <kbd>Shift</kbd> for ′.</p>
  </section>

  <div class="actions">
    <button type="button" class="btn btn--primary" data-action="scramble">${ICON.shuffle}<span>Scramble</span></button>
    <button type="button" class="btn btn--ghost" data-action="reset" title="Back to solved">${ICON.reset}<span>Reset</span></button>
    <button type="button" class="btn btn--ghost btn--icon" data-action="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${ICON.undo}</button>
    <button type="button" class="btn btn--ghost btn--icon" data-action="redo" title="Redo (Ctrl+Y)" aria-label="Redo">${ICON.redo}</button>
  </div>

  <section class="card card--compact" data-ref="scrambleBox" aria-label="Scramble" hidden>
    <div class="field-label">Scramble <span class="tag">U · F · L · G</span></div>
    <code class="scramble__text" data-ref="scrambleText"></code>
  </section>

  <section class="card" aria-labelledby="h-alg">
    <label id="h-alg" class="field-label" for="alg-input">Algorithm</label>
    <form class="alg" data-ref="algForm" autocomplete="off">
      <input id="alg-input" class="alg__input" data-ref="alg" type="text" spellcheck="false" placeholder="(G' F' G F L2) (F' G' F G L2)" />
      <button type="submit" class="btn btn--pill">Apply</button>
    </form>
    <p class="alg__error" data-ref="algError" role="alert" hidden></p>
    <p class="hint hint--tight"><code>U</code> <code>F</code> <code>L</code> have order 4; <code>G</code> has order 12
      (<code>G3</code> restores all corners while turning centres 270°; <code>G4</code> restores all centres while twisting corners 120°).
      Try <code>(G' F' G F L2) (F' G' F G L2)</code> to swap two top centres with two bottom centres.</p>
  </section>

  <section class="card" aria-labelledby="h-moves">
    <div class="card__head">
      <h2 id="h-moves" class="eyebrow eyebrow--flush">Moves</h2>
      <span class="count" data-ref="count">0</span>
    </div>
    <div class="history" data-ref="history" aria-live="polite"></div>
  </section>

  <section class="card" aria-labelledby="h-view">
    <h2 id="h-view" class="eyebrow">View</h2>
    <div class="seg" role="group" aria-label="Camera">
      <button type="button" data-view="corner">Corner</button>
      <button type="button" data-view="face">Face-on</button>
      <button type="button" data-view="edge">Edge</button>
    </div>
    <label class="switch">
      <input type="checkbox" data-ref="labels" checked />
      <span class="switch__track" aria-hidden="true"></span>
      <span>Show move labels</span>
    </label>
    <label class="range"><span>Speed</span><input type="range" data-ref="speed" min="0.4" max="2.5" step="0.1" value="1" /></label>
  </section>

  <footer class="about">Conceived by David Tzur (Alex Polonsky, originally "Polo Gear Cube", 2012) and engineered by Oskar van Deventer,
    mass-produced by Meffert's as "David's Gear Cube". Each 9-tooth corner gear meshes with three 12-tooth face-centre gears (3:4 ratio)
    mounted on a 2×2×2 octant skeleton.</footer>
`;
}

export function createDavidPanel(host: HTMLElement, h: DavidPanelHandlers): DavidPanel {
  host.innerHTML = template();
  const ref = <T extends HTMLElement>(name: string) => host.querySelector<T>(`[data-ref="${name}"]`)!;
  const status = ref('status');
  const scrambleBox = ref('scrambleBox');
  const scrambleText = ref('scrambleText');
  const algForm = ref<HTMLFormElement>('algForm');
  const alg = ref<HTMLInputElement>('alg');
  const algError = ref('algError');
  const count = ref('count');
  const history = ref('history');
  const undoBtn = host.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  const redoBtn = host.querySelector<HTMLButtonElement>('[data-action="redo"]')!;

  host.querySelectorAll<HTMLButtonElement>('[data-token]').forEach((b) => {
    const token = b.dataset.token as MoveToken;
    const ccw = b.dataset.ccw === '1';
    b.addEventListener('click', (e) => h.onMoveButton(token, ccw !== e.shiftKey));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      h.onMoveButton(token, !ccw);
    });
    b.addEventListener('pointerenter', () => h.onHoverMove(token));
    b.addEventListener('pointerleave', () => h.onHoverMove(null));
    b.addEventListener('focus', () => h.onHoverMove(token));
    b.addEventListener('blur', () => h.onHoverMove(null));
  });
  const actions: Record<string, () => void> = { scramble: h.onScramble, reset: h.onReset, undo: h.onUndo, redo: h.onRedo };
  host.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.action!]()));
  algForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = h.onAlgorithm(alg.value);
    algError.hidden = !err;
    algError.textContent = err ?? '';
    alg.classList.toggle('is-invalid', !!err);
    if (!err) alg.value = '';
  });
  alg.addEventListener('input', () => {
    algError.hidden = true;
    alg.classList.remove('is-invalid');
  });
  host.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => h.onView(b.dataset.view as DavidView)));
  ref<HTMLInputElement>('labels').addEventListener('change', (e) => h.onLabels((e.target as HTMLInputElement).checked));
  ref<HTMLInputElement>('speed').addEventListener('input', (e) => h.onSpeed(parseFloat((e.target as HTMLInputElement).value)));

  const setView = (view: DavidView) => {
    host.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.classList.toggle('is-on', b.dataset.view === view));
  };
  setView('corner');

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const statusText = (s: DavidStatus): string => {
    if (s.loading) return 'Building the pieces…';
    if (s.solved) return 'Solved ✓';
    const r = s.report;
    const parts: string[] = [];
    if (r.octantsDisplaced === 0 && r.cornerTwist === 0) {
      parts.push('2×2×2 frame & corners solved ✓');
    } else {
      if (r.octantsDisplaced) parts.push(plural(r.octantsDisplaced, 'octant displaced', 'octants displaced'));
      if (r.cornerTwist) parts.push(`corners twisted ${r.cornerTwist === 1 ? '120° CW' : '120° CCW'}`);
    }
    if (r.centresMisplaced) parts.push(plural(r.centresMisplaced, 'centre sector misplaced', 'centre sectors misplaced'));
    return parts.join(' · ');
  };

  return {
    setView,
    update(v: DavidPanelView) {
      status.textContent = statusText(v.status);
      status.classList.toggle('is-good', !v.status.loading && (v.status.solved || v.status.frameSolved));
      undoBtn.disabled = !v.canUndo;
      redoBtn.disabled = !v.canRedo;
      scrambleBox.hidden = !v.scramble;
      scrambleText.textContent = v.scramble ?? '';
      count.textContent = String(v.moves.length);
      history.replaceChildren(...v.moves.map((m) => chip(formatMove(m), false)), ...v.redoable.map((m) => chip(formatMove(m), true)));
      if (v.moves.length + v.redoable.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'history__empty';
        empty.textContent = 'No moves yet. Turn U, F, L or G, or type an algorithm above.';
        history.append(empty);
      }
      history.scrollTop = history.scrollHeight;
    },
  };
}

function chip(text: string, redo: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = redo ? 'chip chip--redo' : 'chip';
  el.textContent = text.replace("'", '′');
  return el;
}
