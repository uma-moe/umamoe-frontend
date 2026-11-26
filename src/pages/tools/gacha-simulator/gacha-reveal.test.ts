import { describe, expect, it } from 'vitest';
import {
  IDLE_REVEAL,
  REVEAL_TIMINGS,
  colouredGate,
  isLit,
  isOpen,
  isScanning,
  revealLitLead,
  revealTransition,
  scanSpan,
  type RevealState
} from './gacha-reveal';

const pull = (count: number, kind: 'character' | 'support' = 'support'): RevealState =>
  revealTransition(IDLE_REVEAL, { type: 'pull', count, kind }).state;
const elapsed = (state: RevealState) => revealTransition(state, { type: 'elapsed' });

describe('pull reveal', () => {
  it('deals face-down, then opens, lights and settles a support pull', () => {
    const dealt = revealTransition(IDLE_REVEAL, { type: 'pull', count: 10, kind: 'support' });
    expect(dealt).toEqual({
      state: { phase: 'dealt', count: 10, kind: 'support', waves: 0, beat: REVEAL_TIMINGS.scan },
      after: REVEAL_TIMINGS.hold
    });

    const opening = elapsed(dealt.state);
    expect(opening.state.phase).toBe('opening');
    expect(opening.after).toBe(revealLitLead('support'));

    const lit = elapsed(opening.state);
    expect(lit.state.phase).toBe('lit');
    expect(lit.after).toBe(REVEAL_TIMINGS.settle + REVEAL_TIMINGS.stagger * 9);

    const settled = elapsed(lit.state);
    expect(settled.state.phase).toBe('settled');
    expect(settled.after).toBeNull();
  });

  it('colours a trainee board in two waves, then opens it', () => {
    const dealt = revealTransition(IDLE_REVEAL, {
      type: 'pull',
      count: 10,
      kind: 'character',
      waves: 2,
      beat: REVEAL_TIMINGS.rainbow
    }).state;
    const scanning = elapsed(dealt);
    expect(scanning.state.phase).toBe('scanning');
    expect(scanning.after).toBe(scanSpan({ waves: 2, beat: REVEAL_TIMINGS.rainbow }));

    const opening = elapsed(scanning.state);
    expect(opening.state.phase).toBe('opening');
    expect(opening.after).toBe(revealLitLead('character'));
  });

  it('holds a trainee gate shut through the waves, and opens it only after', () => {
    expect([isOpen('dealt'), isScanning('dealt')]).toEqual([false, false]);
    expect([isOpen('scanning'), isScanning('scanning')]).toEqual([false, true]);
    expect([isOpen('opening'), isScanning('opening')]).toEqual([true, false]);
  });

  it('lights a trainee as her doors start to part, so the halo is up when the art shows', () => {
    expect(revealLitLead('character')).toBeLessThan(REVEAL_TIMINGS.gate * 0.5);
  });

  it('holds a support card light until its turn has landed', () => {
    expect(revealLitLead('support')).toBe(REVEAL_TIMINGS.leadIn + REVEAL_TIMINGS.turn);
  });

  it('puts one beat between the two colour waves and the tail after them', () => {
    expect(scanSpan({ waves: 1, beat: REVEAL_TIMINGS.scan })).toBe(REVEAL_TIMINGS.scanTail);
    expect(scanSpan({ waves: 2, beat: REVEAL_TIMINGS.scan })).toBe(
      REVEAL_TIMINGS.scan + REVEAL_TIMINGS.scanTail
    );
    /* A holo board holds its gold longer, so its beat is the rainbow's. */
    expect(scanSpan({ waves: 2, beat: REVEAL_TIMINGS.rainbow })).toBe(
      REVEAL_TIMINGS.rainbow + REVEAL_TIMINGS.scanTail
    );
  });

  it('colours a row per wave when the pull drew no holo', () => {
    /* Top row (gold on wave 1), bottom row (gold on wave 2), nothing else changes. */
    expect([0, 1, 2].map((wave) => colouredGate(2, wave, 1))).toEqual([1, 2, 2]);
    expect([0, 1, 2].map((wave) => colouredGate(2, wave, 2))).toEqual([1, 1, 2]);
    expect([0, 1, 2].map((wave) => colouredGate(1, wave, 1))).toEqual([1, 1, 1]);
  });

  it('takes a holo gate gold with the whole board, then rainbow on the second wave', () => {
    expect([0, 1, 2].map((wave) => colouredGate(3, wave, 1))).toEqual([1, 2, 3]);
  });

  it('lands on the finished pull when the reader skips', () => {
    const skipped = revealTransition(pull(10), { type: 'skip' });
    expect(skipped.state.phase).toBe('settled');
    expect(skipped.after).toBeNull();
  });

  it('stays put once settled', () => {
    expect(
      elapsed({ phase: 'settled', count: 10, kind: 'support', waves: 0, beat: 0 }).after
    ).toBeNull();
  });

  it('counts the card as open from the deal, and lit only once the flourish is due', () => {
    expect([isOpen('dealt'), isLit('dealt')]).toEqual([false, false]);
    expect([isOpen('opening'), isLit('opening')]).toEqual([true, false]);
    expect([isOpen('lit'), isLit('lit')]).toEqual([true, true]);
    expect([isOpen('settled'), isLit('settled')]).toEqual([true, true]);
  });
});
