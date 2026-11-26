<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { GachaSpend } from '@/lib/gacha-simulator/gacha-budget';
  import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';
  import type { GachaPurchaseOffer } from '@/lib/gacha-simulator/gacha-purchases';
  import GachaResultCard from './GachaResultCard.svelte';
  import type { SessionResult } from './gacha-session';

  /**
   * A pull's beats: how long it sits face-down (long enough to read the rarity band on the back),
   * when the light follows, and how long the buttons stay busy. The turn is staggered by
   * --reveal-index in GachaResultCard (45ms a card, 100ms in, 480ms to turn).
   */
  const HOLD_MS = 800;
  const FLIP_MS = 900;
  const SETTLE_MS = HOLD_MS + FLIP_MS + 300;

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
  /** The timers of a reveal in flight, so Skip can end it at once. */
  let timers: number[] = [];
  /** A pull deals face-down and sits before it opens; this is that flip. */
  let revealed = $state(true);
  /** The rarity flourish waits for the cards to have turned. */
  let flourish = $state(true);
  /** True while the reveal is still playing, so the next pull cannot cut into it. */
  let settling = $state(false);

  const affordable = $derived(purchases.some(({ plan }) => plan.shortfall === 0));

  $effect(() => {
    if (!drawing) pending = null;
  });

  $effect(() => {
    const newest = results[0]?.drawIndex;
    if (newest === undefined) return;

    const still = quick || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    revealed = still;
    /* Quick pulls drop the flourish too; the rarity frame still carries the rarity. */
    flourish = !quick;
    settling = !still;
    if (still) return;

    const open = window.setTimeout(() => (revealed = true), HOLD_MS);
    const light = window.setTimeout(() => (flourish = true), HOLD_MS + FLIP_MS);
    const done = window.setTimeout(() => (settling = false), SETTLE_MS);
    timers = [open, light, done];

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers = [];
    };
  });

  /** Ends the deal and the flourish at once, landing on the finished pull. */
  function skip() {
    for (const timer of timers) window.clearTimeout(timer);
    timers = [];
    revealed = true;
    flourish = true;
    settling = false;
  }
</script>

<Dialog
  bind:open
  title={bannerName}
  icon="dice"
  maxWidth="960px"
  maxHeight="94dvh"
  mobileMaxHeight="97dvh"
  height="90dvh"
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
        class:no-motion={quick}
        aria-label={`${results.length} ${results.length === 1 ? 'card' : 'cards'} from this pull`}
      >
        {#each results as result, index (result.drawIndex)}
          <li style:--reveal-index={Math.min(index, 9)}>
            <GachaResultCard
              {result}
              {kind}
              position={result.drawIndex}
              pull
              {revealed}
              {flourish}
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
