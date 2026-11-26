<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { GachaSpend } from '@/lib/gacha-simulator/gacha-budget';
  import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';
  import type { GachaPurchaseOffer } from '@/lib/gacha-simulator/gacha-purchases';
  import GachaResultCard from './GachaResultCard.svelte';
  import type { SessionResult } from './gacha-session';
  import {
    IDLE_REVEAL,
    REVEAL_TIMINGS,
    colouredGate,
    isOpen,
    revealTransition,
    type RevealEvent,
    type RevealState
  } from './gacha-reveal';

  /**
   * A pull's beats are the reveal machine's; the cards read the same timings from these custom
   * properties, so a card's own turn cannot drift from the phase it is in.
   */
  const TURN_MS = REVEAL_TIMINGS.turn;
  const STAGGER_MS = REVEAL_TIMINGS.stagger;
  const LEAD_IN_MS = REVEAL_TIMINGS.leadIn;
  const HOLD_MS = REVEAL_TIMINGS.hold;
  const FLIP_MS = REVEAL_TIMINGS.flip;
  const FLASH_MS = REVEAL_TIMINGS.flash;

  export interface GachaPurchaseOption {
    offer: GachaPurchaseOffer;
    plan: GachaSpend;
  }

  interface Props {
    open?: boolean;
    /** The banner's name, which is all the header needs to say. */
    bannerName: string;
    kind: GachaKind;
    /** Only the pull that just happened; the banner's whole history stays on the setup page. */
    results: SessionResult[];
    /** The banner's purchases, each with what it would spend and whether the wallet covers it. */
    purchases: readonly GachaPurchaseOption[];
    /** A pull is drawing and loading its art; the pressed button waits on it. */
    drawing: boolean;
    /** Skip the deal and the flourish, keeping only the wait for the art. */
    quick: boolean;
    blockedNote?: string;
    /** The draw message the page already built, announced from inside the modal. */
    announcement: string;
    announcementSeq: number;
    onpull: (offer: GachaPurchaseOffer) => void;
    onclose: () => void;
  }

  let {
    open = $bindable(false),
    bannerName,
    kind,
    results,
    purchases,
    drawing,
    quick,
    blockedNote,
    announcement,
    announcementSeq,
    onpull,
    onclose
  }: Props = $props();

  /** Which purchase started the pull in flight, so only it shows the wait. */
  let pending = $state<GachaPurchaseOffer['id'] | null>(null);
  /** Where the reveal is; the cards render the phase they are handed. */
  let reveal = $state<RevealState>(IDLE_REVEAL);
  /** The draw the reveal belongs to, so a new batch cannot mount wearing the last pull's phase. */
  let revealFor = $state<number | undefined>(undefined);
  /** The one timer the machine is waiting on. */
  let timer: number | undefined;
  /**
   * How many colour waves have run: 0 while the gates are plain, 1 after the first, 2 after the
   * second. A trainee board always takes two, whatever it drew.
   */
  let wave = $state(0);

  const current = $derived(results[0]?.drawIndex);
  /** A batch only wears the phase that belongs to it. */
  const phase = $derived(revealFor === current ? reveal.phase : 'dealt');
  const boardOpen = $derived(isOpen(phase));
  const settling = $derived(results.length > 0 && phase !== 'lit' && phase !== 'settled');
  /** Where the board splits into rows of five, which is what the two waves take turns on. */
  const half = $derived(Math.ceil(results.length / 2));
  const hasHolo = $derived(results.some((result) => result.rarity >= 3));
  /** A holo pull colours the whole board on the first wave; without one, the waves take a row each. */
  const waves = $derived(
    hasHolo ? 2 : results.some((result, index) => index >= half && result.rarity >= 2) ? 2 : 1
  );
  /** A pull with a holo holds its gold longer, since the second wave is the upgrade worth watching. */
  const beat = $derived(hasHolo ? REVEAL_TIMINGS.rainbow : REVEAL_TIMINGS.scan);
  /**
   * What a gate is wearing right now, and the wave that takes it gold. With a holo on the board every
   * rare is coloured on the first wave, leaving the second for the rainbow; without one, each wave
   * takes a row.
   */
  function gateRarity(result: SessionResult, index: number): number {
    if (phase === 'dealt') return 1;
    if (phase !== 'scanning') return result.rarity;
    return colouredGate(result.rarity, wave, hasHolo || index < half ? 1 : 2);
  }

  const affordable = $derived(purchases.some(({ plan }) => plan.shortfall === 0));

  $effect(() => {
    if (!drawing) pending = null;
  });

  /** Steps the machine and clears whatever it was waiting on. */
  function dispatch(event: RevealEvent) {
    window.clearTimeout(timer);
    const { state, after } = revealTransition(reveal, event);
    reveal = state;
    timer =
      after === null ? undefined : window.setTimeout(() => dispatch({ type: 'elapsed' }), after);
  }

  $effect(() => {
    const newest = results[0]?.drawIndex;
    const count = results.length;
    const still = quick || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (newest === undefined) return;

    /* The machine reads its own state, so the step runs untracked: a tracked read would make the
       effect depend on the phase it just wrote. */
    untrack(() => {
      revealFor = newest;
      dispatch(still ? { type: 'skip' } : { type: 'pull', count, kind, waves, beat });
    });

    return () => window.clearTimeout(timer);
  });

  /* The colour waves over a trainee's gates: the whole board takes its colour a wave at a time, and a
     pull that drew a holo spends the second wave on the rainbow instead. */
  $effect(() => {
    if (phase !== 'scanning') return;
    wave = 1;
    if (waves < 2) {
      return () => {
        wave = 0;
      };
    }

    const timer = window.setTimeout(() => {
      wave = 2;
    }, beat);

    return () => {
      window.clearTimeout(timer);
      wave = 0;
    };
  });

  /** Ends the deal and the flourish at once, landing on the finished pull. */
  function skip() {
    dispatch({ type: 'skip' });
  }
</script>

<Dialog
  bind:open
  title={bannerName}
  icon="dice"
  maxWidth="960px"
  maxHeight="90vh"
  height="90vh"
  mobileMaxHeight="97dvh"
  contentPadding="10px 12px"
  mobileContentPadding="6px"
  mobileFill
  {onclose}
>
  <div class="pull-grid">
    {#if results.length}
      <ol
        class="result-grid"
        class:single={results.length === 1}
        class:characters={kind === 'character'}
        class:at-once={kind === 'character'}
        class:no-motion={quick}
        style:--turn="{TURN_MS}ms"
        style:--stagger="{STAGGER_MS}ms"
        style:--lead-in="{LEAD_IN_MS}ms"
        style:--hold="{HOLD_MS}ms"
        style:--flip="{FLIP_MS}ms"
        style:--flash="{FLASH_MS}ms"
        aria-label={`${results.length} ${results.length === 1 ? 'card' : 'cards'} from this pull`}
      >
        {#each results as result, index (result.drawIndex)}
          <li style:--reveal-index={Math.min(index, 9)}>
            <GachaResultCard
              {result}
              {kind}
              position={result.drawIndex}
              pull
              {phase}
              gateRarity={gateRarity(result, index)}
              flourish={!quick}
              instant={quick}
            />
          </li>
        {/each}
      </ol>
    {:else}
      <p class="pull-empty">
        <b>Nothing pulled yet.</b>
        <span>Your draws land here, one after another.</span>
      </p>
    {/if}
  </div>

  {#snippet actions()}
    <div class="pull-controls">
      <!-- A reveal in flight turns the purchases into the one thing worth pressing: skip it. -->
      <div
        class="pull-actions"
        class:single={settling}
      >
        {#if settling}
          <Button
            icon="play"
            size="sm"
            onclick={skip}
          >
            Skip animation
          </Button>
        {:else}
          {#each purchases as { offer, plan } (offer.id)}
            <Button
              icon="dice"
              size="sm"
              title={offer.guaranteed ? 'The 10th draw is SR or above' : undefined}
              loading={drawing && pending === offer.id}
              disabled={drawing || plan.shortfall > 0}
              onclick={() => {
                pending = offer.id;
                onpull(offer);
              }}
            >
              {offer.label}
            </Button>
          {/each}
        {/if}
      </div>
      {#if !settling && !affordable && blockedNote}
        <p class="pull-blocked">{blockedNote}</p>
      {/if}
    </div>
  {/snippet}

  <p
    class="sr-only"
    aria-live="polite"
    aria-atomic="true"
  >
    {#key announcementSeq}{announcement}{/key}
  </p>
</Dialog>

<style>
  @import './gacha-results.css';
  @import './gacha-pull-dialog.css';
</style>
