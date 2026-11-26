import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';

/**
 * The reveal of a pull, as a state machine: a pull lands face-down, opens, lights its rarities, and
 * settles. The dialog drives it with one timer; the cards only render the phase they are given.
 */
export type RevealPhase = 'dealt' | 'opening' | 'lit' | 'settled';

export interface RevealTimings {
  /** How long the cards sit face-down before anything opens. */
  hold: number;
  /** How long a trainee's gate takes to swing open. */
  gate: number;
  /** How long a support card takes to turn over. */
  turn: number;
  /** The offset each card waits behind the one before it. */
  stagger: number;
  /** The delay before the first card moves. */
  leadIn: number;
  /** How long the last card's flourish gets to itself before the buttons come back. */
  settle: number;
}

export const REVEAL_TIMINGS: RevealTimings = {
  hold: 800,
  gate: 460,
  turn: 560,
  stagger: 45,
  leadIn: 100,
  settle: 300
};

export interface RevealState {
  phase: RevealPhase;
  /** The cards of the pull in flight, which is what the stagger is measured on. */
  count: number;
  /** Which board dealt: a trainee's shade lifts during the gates, a card turns over instead. */
  kind: GachaKind;
}

export type RevealEvent =
  /** A pull landed; the cards are dealt face-down. */
  | { type: 'pull'; count: number; kind: GachaKind }
  /** The phase's own duration ran out. */
  | { type: 'elapsed' }
  /** The reader skipped: land on the finished pull. */
  | { type: 'skip' };

export const IDLE_REVEAL: RevealState = { phase: 'settled', count: 0, kind: 'character' };

/**
 * How long after the cards start moving the first card's light is due. A trainee's shine catches the
 * last tenth of the unshade; a support card's waits for its turn to land, since its face is still
 * coming round.
 */
export function revealLitLead(kind: GachaKind, timings: RevealTimings = REVEAL_TIMINGS): number {
  return kind === 'character' ? timings.leadIn + timings.gate * 0.9 : timings.leadIn + timings.turn;
}

/** How long the whole deal takes, from the first card's start to the last card landing. */
export function revealSpan(count: number, timings: RevealTimings = REVEAL_TIMINGS): number {
  const longest = Math.max(timings.gate, timings.turn);
  return timings.leadIn + longest + timings.stagger * Math.max(0, count - 1);
}

/**
 * The state after an event, with how long it lasts. A null duration means the machine has come to
 * rest and waits for the next event.
 */
export function revealTransition(
  state: RevealState,
  event: RevealEvent,
  timings: RevealTimings = REVEAL_TIMINGS
): { state: RevealState; after: number | null } {
  if (event.type === 'skip') return { state: { ...state, phase: 'settled' }, after: null };

  if (event.type === 'pull') {
    return {
      state: { phase: 'dealt', count: event.count, kind: event.kind },
      after: timings.hold
    };
  }

  switch (state.phase) {
    case 'dealt':
      /* The light follows the first card, and each card's own stagger delay holds it back. */
      return {
        state: { ...state, phase: 'opening' },
        after: revealLitLead(state.kind, timings)
      };
    case 'opening':
      /* The buttons wait for the last card's flourish to have started. */
      return {
        state: { ...state, phase: 'lit' },
        after: timings.settle + timings.stagger * Math.max(0, state.count - 1)
      };
    case 'lit':
      return { state: { ...state, phase: 'settled' }, after: null };
    default:
      return { state, after: null };
  }
}

/** True once the cards are no longer waiting face-down. */
export function isOpen(phase: RevealPhase): boolean {
  return phase !== 'dealt';
}

/** True once the rarity flourish is due. */
export function isLit(phase: RevealPhase): boolean {
  return phase === 'lit' || phase === 'settled';
}
