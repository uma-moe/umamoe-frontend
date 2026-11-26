const QUICK_KEY = 'uma:gacha-quick-pulls';

/** True when the reader asked for pulls without their animations; remembered per device. */
export function readQuickPulls(): boolean {
  try {
    return window.localStorage.getItem(QUICK_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeQuickPulls(quick: boolean): void {
  try {
    window.localStorage.setItem(QUICK_KEY, quick ? 'on' : 'off');
  } catch {
    /* The choice still holds for this session when storage is blocked. */
  }
}
