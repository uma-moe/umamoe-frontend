import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';

/**
 * The reveal of a pull, as a state machine: a pull lands face-down, opens, lights its rarities, and
 * settles. The dialog drives it with one timer; the cards only render the phase they are given.
 */
export type RevealPhase = 'dealt' | 'scanning' | 'opening' | 'lit' | 'settled';

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
  /** How long a trainee's board shows one colour wave before the next. */
  scan: number;
  /** How long a holo gate wears its gold before the second wave takes it rainbow. */
  rainbow: number;
  /** The beat between the last colour wave and the doors opening. */
  scanTail: number;
  /** How long a gate takes to swap to the rarity it drew. */
  flip: number;
  /** How long a gate's light stays up when a wave reaches it. */
  flash: number;
}

export const REVEAL_TIMINGS: RevealTimings = {
  hold: 300,
  gate: 460,
  turn: 460,
  stagger: 45,
  leadIn: 100,
  settle: 300,
  scan: 150,
  rainbow: 500,
  scanTail: 360,
  flip: 260,
  flash: 380
};

export interface RevealState {
  phase: RevealPhase;
  /** The cards of the pull in flight, which is what the stagger is measured on. */
  count: number;
  /** Which board dealt: a trainee's gates are coloured in waves, a support card turns over. */
  kind: GachaKind;
  /** How many colour waves a trainee's board takes, which is two whether or not it drew a holo. */
  waves: number;
  /** How long each wave holds before the next one lands. */
  beat: number;
}

export type RevealEvent =
  /** A pull landed; the cards are dealt face-down with their plainest gates. */
  | { type: 'pull'; count: number; kind: GachaKind; waves?: number; beat?: number }
  /** The phase's own duration ran out. */
  | { type: 'elapsed' }
  /** The reader skipped: land on the finished pull. */
  | { type: 'skip' };

export const IDLE_REVEAL: RevealState = {
  phase: 'settled',
  count: 0,
  kind: 'character',
  waves: 0,
  beat: 0
};

/**
 * How long after the cards start moving the first card's light is due. A trainee's light comes up with
 * her doors, so the halo is already blooming when the art is uncovered; a support card's waits for its
 * turn to land, since its face is still coming round.
 */
export function revealLitLead(kind: GachaKind, timings: RevealTimings = REVEAL_TIMINGS): number {
  return kind === 'character' ? timings.leadIn : timings.leadIn + timings.turn;
}

/**
 * How long the colour waves over a trainee's gates take: one beat per wave, less the first, then the
 * pause before anything opens. The board is coloured in two waves either way, so the length never
 * depends on what the pull drew.
 */
export function scanSpan(
  state: { waves: number; beat: number },
  timings: RevealTimings = REVEAL_TIMINGS
): number {
  return state.beat * Math.max(0, state.waves - 1) + timings.scanTail;
}

/**
 * What a trainee's gate wears after `wave` colour waves. The first colours the top row of the board —
 * or, when the pull drew a holo, everything that was worth colouring — and the second either colours
 * the row below it or takes the holo ones rainbow, which is the upgrade the pull is really about.
 */
export function colouredGate(drawn: number, wave: number, goldWave: number): number {
  if (drawn < 2 || wave < goldWave) return 1;
  if (drawn === 3) return wave >= 2 ? 3 : 2;
  return 2;
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
      state: {
        phase: 'dealt',
        count: event.count,
        kind: event.kind,
        waves: event.waves ?? 0,
        beat: event.beat ?? timings.scan
      },
      after: timings.hold
    };
  }

  switch (state.phase) {
    case 'dealt':
      /* A trainee's gates are dealt plain and then coloured a wave at a time; a support card turns. */
      return state.kind === 'character'
        ? { state: { ...state, phase: 'scanning' }, after: scanSpan(state, timings) }
        : { state: { ...state, phase: 'opening' }, after: revealLitLead('support', timings) };
    case 'scanning':
      /* The doors part once the gates have shown what they drew. */
      return { state: { ...state, phase: 'opening' }, after: revealLitLead('character', timings) };
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
  return phase !== 'dealt' && phase !== 'scanning';
}

/** True while a trainee's gates are being coloured, and the only time they pop as they upgrade. */
export function isScanning(phase: RevealPhase): boolean {
  return phase === 'scanning';
}

/** True once the rarity flourish is due. */
export function isLit(phase: RevealPhase): boolean {
  return phase === 'lit' || phase === 'settled';
}
