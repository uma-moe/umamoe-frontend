<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import { skillImage } from '@/lib/game-data/skills/skills';
  import type { TheoryFire } from '../../../simulator-repository';
  import { skillTier, type PricedOffer } from '../../../setup/build/skill-offers';
  import { fireText, lengthsText, winText, worthState } from './build-result';

  /**
   * A skill on one line of a fixed height, named in its tier's colour: what an upgrade is bought with, its SP and the
   * lengths it gains her. A data bar behind the row draws the worth from the left edge, green when it helps; a skill
   * that adds nothing is muted and one that costs her is tinted orange. How often and where it fires, and what values
   * it, show on hover.
   */
  interface Props {
    offer: PricedOffer;
    /** The skills it builds on that are bought with it. */
    via: PricedOffer[];
    cost: number;
    /** Lengths it gains her, in the build or on her own. */
    lengths: number;
    /** The same as estimated win points (0–1), when the service sends them. */
    win?: number;
    fire: TheoryFire;
    /** `prior`: valued from recorded CM races, as it acts on the field. */
    source: 'physics' | 'prior';
    countGated: boolean;
    locked?: boolean;
    /** The largest worth shown, a full bar. */
    scale: number;
    phaseBounds: number[];
    /** Said after the worth on hover: where it was valued. */
    context: string;
    /** Tinted as a skill the pick does not buy. */
    differs?: boolean;
  }

  let {
    offer,
    via,
    cost,
    lengths,
    win,
    fire,
    source,
    countGated,
    locked = false,
    scale,
    phaseBounds,
    context,
    differs = false
  }: Props = $props();

  const state = $derived(worthState(lengths));
  const never = $derived(fire.rate <= 0);
  /** The data bar behind the row: the worth's share of the largest shown, from the left edge. */
  const fill = $derived(scale > 0 ? Math.max(0, lengths / scale) * 100 : 0);
  const valuedBy = $derived(
    source === 'prior'
      ? 'its field value from recorded CM races'
      : 'raced alone through her whole race'
  );
  const breakdown = $derived(
    lengthsText(lengths) +
      ' ' +
      context +
      (win === undefined
        ? ''
        : ' (≈ ' + winText(win) + ' win in a CM field, learned from real CM rooms)') +
      ' · ' +
      fireText({ fire, phaseBounds, countGated }) +
      ' · ' +
      valuedBy
  );
  const viaText = $derived(
    via.length ? 'with ' + via.map((base) => base.skill.name).join(', ') : ''
  );
  /** The whole name on hover, for a line too narrow for it. */
  const fullName = $derived(offer.skill.name + (viaText ? ' ' + viaText : ''));
</script>

<div
  class="skill-row tier-{skillTier(offer.skill)}"
  class:with-win={win !== undefined}
  class:helps={state === 'helps'}
  class:loss={state === 'costs'}
  class:nothing={state === 'nothing'}
  class:never
  class:differs
>
  {#if fill > 0}
    <span
      class="fill"
      aria-hidden="true"
      style:width={fill + '%'}
    ></span>
  {/if}
  <img
    src={skillImage(offer.skill.icon)}
    alt=""
    width="16"
    height="16"
  />
  <span
    class="name"
    title={fullName}
  >
    <strong>{offer.skill.name}</strong>
    {#if viaText}<small>{viaText}</small>{/if}
  </span>
  <span class="cost">
    {#if locked}
      <Icon
        name="lock"
        size={11}
        label="Locked"
      />
    {/if}
    {cost.toLocaleString('en-US')}
    <span class="sr-only">SP</span>
  </span>
  <span
    class="value"
    title={breakdown}
  >
    {lengthsText(lengths, 2, false)}
    <span class="sr-only">lengths</span>
  </span>
  {#if win !== undefined}
    <span
      class="win"
      title={breakdown}
    >
      {winText(win)}
      <span class="sr-only">estimated win rate</span>
    </span>
  {/if}
</div>

<style>
  @import './build-skill-row.css';
  @import '../../../setup/build/skill-tier.css';
</style>
