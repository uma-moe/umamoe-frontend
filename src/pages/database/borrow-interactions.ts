import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
import { inheritanceRepository, type BorrowInteractionContext } from './inheritance-repository';

const VIEW_INTERVAL_MS = 30 * 60 * 1000;
const COPY_INTERVAL_MS = 30 * 1000;
const VIEW_FLUSH_MS = 2_000;
const queuedViews = new Map<string, BorrowInteractionContext & { trainer_id: string }>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushHandlersInstalled = false;

function hash64(input: string): string {
  let h1 = 0xdeadbeef >>> 0;
  let h2 = 0x41c6ce57 >>> 0;
  for (let index = 0; index < input.length; index++) {
    const value = input.charCodeAt(index) & 0xff;
    h1 = Math.imul(h1 ^ value, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ value, 1597334677) >>> 0;
  }
  h1 = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
  h2 = (Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)) >>> 0;
  return `${h2.toString(16).padStart(8, '0')}${h1.toString(16).padStart(8, '0')}`;
}

function borrowKey(record: InheritanceRecord): string {
  const parts: string[] = [];
  const number = (value: number | undefined, fallback = 0) => parts.push(String(Number.isFinite(value) ? value : fallback));
  const list = (values: readonly number[] | undefined) => parts.push((values ?? []).join(','));
  number(record.mainParentId); number(record.leftParentId); number(record.rightParentId); number(record.rankScore); number(record.rarity);
  list(record.blueSparks); list(record.pinkSparks); list(record.greenSparks); list(record.whiteSparks);
  number(record.winCount); number(record.whiteCount); number(record.mainBlue); number(record.mainPink); number(record.mainGreen); list(record.mainWhite);
  number(record.leftBlue); number(record.leftPink); number(record.leftGreen); list(record.leftWhite);
  number(record.rightBlue); number(record.rightPink); number(record.rightGreen); list(record.rightWhite);
  list(record.mainWinSaddles); list(record.leftWinSaddles); list(record.rightWinSaddles); list(record.raceResults);
  number(record.supportCardId); number(record.supportLimitBreak, -1); number(record.supportExperience, -1);
  return `bk1:${hash64(parts.join('|'))}`;
}

export function borrowContext(record: InheritanceRecord): BorrowInteractionContext {
  return {
    borrow_key: borrowKey(record), inheritance_id: record.id, support_card_id: record.supportCardId ?? null,
    support_card_limit_break: record.supportLimitBreak ?? null, support_card_experience: record.supportExperience ?? null
  };
}

function interactionKey(record: InheritanceRecord): string {
  const context = borrowContext(record);
  return [record.accountId, context.borrow_key ?? '', context.inheritance_id ?? 0, context.support_card_id ?? 0, context.support_card_limit_break ?? '', context.support_card_experience ?? ''].join(':');
}

function mark(action: 'view' | 'copy', record: InheritanceRecord): boolean {
  const interval = action === 'view' ? VIEW_INTERVAL_MS : COPY_INTERVAL_MS;
  try {
    const storageKey = `uma.borrow.${action}.${interactionKey(record)}`;
    const now = Date.now();
    const previous = Number(sessionStorage.getItem(storageKey));
    if (Number.isFinite(previous) && previous > 0 && now - previous < interval) return false;
    sessionStorage.setItem(storageKey, String(now));
  } catch { /* Tracking is best effort when storage is unavailable. */ }
  return true;
}

async function flushViews(useBeacon = false): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  const views = [...queuedViews.values()];
  queuedViews.clear();
  if (!views.length) return;
  if (useBeacon && navigator.sendBeacon) {
    try { if (navigator.sendBeacon('/api/borrow/views', new Blob([JSON.stringify({ views })], { type: 'application/json' }))) return; } catch { /* Fall through. */ }
  }
  await inheritanceRepository.trackBorrowViews(views).catch(() => undefined);
}

function installFlushHandlers(): void {
  if (flushHandlersInstalled) return;
  flushHandlersInstalled = true;
  window.addEventListener('pagehide', () => { void flushViews(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushViews(true); });
}

export function queueBorrowView(record: InheritanceRecord): void {
  if (!mark('view', record)) return;
  installFlushHandlers();
  const context = { trainer_id: record.accountId, ...borrowContext(record) };
  queuedViews.set(interactionKey(record), context);
  if (queuedViews.size >= 20) { void flushViews(); return; }
  if (!flushTimer) flushTimer = setTimeout(() => { void flushViews(); }, VIEW_FLUSH_MS);
}

export function trackBorrowCopy(record: InheritanceRecord): Promise<number> | undefined {
  if (!mark('copy', record)) return undefined;
  const previous = record.borrowCopies;
  return inheritanceRepository.trackBorrowCopy(record.accountId, borrowContext(record)).then((response) => {
    if (!response.success) return previous;
    const count = response.copy_count ?? response.total_count ?? 0;
    return Math.max(previous + (response.accepted ? 1 : 0), Number.isFinite(count) ? count : 0);
  }).catch(() => previous);
}
