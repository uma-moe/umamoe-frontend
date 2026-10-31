<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import { skillImage } from '@/lib/game-data/skills/skills';
  import type { TheoryFire, V5PurchaseValue } from '../../../simulator-repository';
  import { skillTier, type PricedOffer } from '../../../setup/build/skill-offers';
  import { fireText, valueText, winText, worthState, type SkillUnit } from './build-result';
  import SkillPoints from '@/components/game/SkillPoints.svelte';

  /** A compact skill row with its relative contribution drawn behind the text. */
  interface Props {
    offer: PricedOffer;
    /** The skills it builds on that are bought with it. */
    via: PricedOffer[];
    cost: number;
    /** Lengths it gains her, in the build or on her own. */
    value: number | undefined;
    unit?: SkillUnit;
    measurement?: V5PurchaseValue['measured'];
    /** The same as estimated win points (0–1), when the service sends them. */
    win?: number;
    fire: TheoryFire & { races?: number };
    /** `prior`: valued from recorded CM races, as it acts on the field. */
    source: 'physics' | 'prior' | V5PurchaseValue['source'] | 'races' | 'unknown';
    countGated: boolean;
    locked?: boolean;
    /** The largest contribution in this build or skill list, represented by a full background bar. */
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
    value,
    unit = 'lengths',
    measurement,
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

  const state = $derived(value === undefined ? undefined : worthState(value, unit));
  const never = $derived(fire.races !== 0 && fire.rate <= 0);
  /** Bar width is relative to this build; the color and signed number show gain or loss. */
  const fill = $derived(scale > 0 ? Math.min(100, (Math.abs(value ?? 0) / scale) * 100) : 0);
  const valuedBy = $derived(
    {
      physics: 'raced alone through her whole race',
      prior: 'its field value from recorded CM races',
      v5: 'V5 skill model',
      ranker: 'V5 with trained move ranker',
      posterior: 'V5 with paired race feedback',
      recovery_races: 'paired recovery race estimate',
      races: 'measured in races, paired over her build as it is',
      unknown: 'No individual score reported'
    }[source]
  );
  const breakdown = $derived(
    valueText(value, unit) +
      ' ' +
      context +
      (win === undefined
        ? ''
        : ' (model win-rate change: ≈ ' +
          winText(win).replace('%', ' pp') +
          '; internal comparison only)') +
      ' · ' +
      fireText({ fire, phaseBounds, countGated }) +
      ' · ' +
      valuedBy +
      (measurement
        ? ' · Exact paired gain ' +
          valueText(measurement.gain, 'score') +
          ' ± ' +
          measurement.standard_error.toFixed(2) +
          ' SE'
        : '') +
      (fire.races === undefined
        ? ''
        : ' · ' + fire.races.toLocaleString('en-US') + ' timing observations')
  );
  const viaText = $derived(
    via.length ? 'with ' + via.map((base) => base.skill.name).join(', ') : ''
  );
  /** The whole name on hover, for a line too narrow for it. */
  const fullName = $derived(offer.skill.name + (viaText ? ' ' + viaText : ''));
</script>

<div
  class="skill-row tier-{skillTier(offer.skill)}"
  class:helps={state === 'helps'}
  class:loss={state === 'costs'}
  class:nothing={state === 'nothing'}
  class:never
  class:unscored={value === undefined}
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
    <SkillPoints value={cost} />
  </span>
  <span
    class="value"
    title={breakdown}
  >
    {valueText(value, unit, 2, false)}
    <span class="sr-only">{unit}</span>
  </span>
</div>

<style>
  @import './build-skill-row.css';
  @import '../../../setup/build/skill-tier.css';
</style>
