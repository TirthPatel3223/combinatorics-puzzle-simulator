import { MOVE_TOKENS, type MoveToken } from '../notation';

export interface DavidKeyHandlers {
  /** A move key (`U`, `F`, `L`, `G`); `counterclockwise` when Shift is held. */
  onMove(token: MoveToken, counterclockwise: boolean): void;
  onUndo(): void;
  onRedo(): void;
}

/** Keys U F L G trigger that move; with Shift, counterclockwise ('). Ctrl+Z / Ctrl+Y undo and redo. */
export function bindDavidKeyboard(h: DavidKeyHandlers): void {
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        h.onUndo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        h.onRedo();
      }
      return;
    }
    if (e.altKey || e.repeat) return;
    const t = e.key.toUpperCase() as MoveToken;
    if (e.key.length === 1 && (MOVE_TOKENS as readonly string[]).includes(t)) {
      e.preventDefault();
      h.onMove(t, e.shiftKey);
    }
  });
}
