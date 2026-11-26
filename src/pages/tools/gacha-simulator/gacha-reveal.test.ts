import { describe, expect, it } from 'vitest';
import {
  IDLE_REVEAL,
  REVEAL_TIMINGS,
  isLit,
  isOpen,
  revealSpan,
  revealTransition,
  type RevealState
} from './gacha-reveal';

const pull = (count: number): RevealState =>
  revealTransition(IDLE_REVEAL, { type: 'pull', count }).state;
const elapsed = (state: RevealState) => revealTransition(state, { type: 'elapsed' });

describe('pull reveal', () => {
  it('deals face-down, then opens, lights and settles', () => {
    const dealt = revealTransition(IDLE_REVEAL, { type: 'pull', count: 10 });
    expect(dealt).toEqual({ state: { phase: 'dealt', count: 10 }, after: REVEAL_TIMINGS.hold });

    const opening = elapsed(dealt.state);
    expect(opening.state.phase).toBe('opening');
    expect(opening.after).toBe(revealSpan(10));

    const lit = elapsed(opening.state);
    expect(lit.state.phase).toBe('lit');
    expect(lit.after).toBe(REVEAL_TIMINGS.settle);

    const settled = elapsed(lit.state);
    expect(settled.state.phase).toBe('settled');
    expect(settled.after).toBeNull();
  });

  it('measures the span on the last card, not the first', () => {
    const longest = Math.max(REVEAL_TIMINGS.gate, REVEAL_TIMINGS.turn);
    expect(revealSpan(1)).toBe(REVEAL_TIMINGS.leadIn + longest);
    expect(revealSpan(10)).toBe(revealSpan(1) + REVEAL_TIMINGS.stagger * 9);
  });

  it('lands on the finished pull when the reader skips', () => {
    const skipped = revealTransition(pull(10), { type: 'skip' });
    expect(skipped).toEqual({ state: { phase: 'settled', count: 10 }, after: null });
  });

  it('stays put once settled', () => {
    expect(elapsed({ phase: 'settled', count: 10 })).toEqual({
      state: { phase: 'settled', count: 10 },
      after: null
    });
  });

  it('counts the card as open from the deal, and lit only once the flourish is due', () => {
    expect([isOpen('dealt'), isLit('dealt')]).toEqual([false, false]);
    expect([isOpen('opening'), isLit('opening')]).toEqual([true, false]);
    expect([isOpen('lit'), isLit('lit')]).toEqual([true, true]);
    expect([isOpen('settled'), isLit('settled')]).toEqual([true, true]);
  });
});
