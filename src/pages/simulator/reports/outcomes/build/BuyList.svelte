<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import { skillImage } from '@/lib/game-data/skills/skills';
  import { skillTier } from '../../../setup/build/skill-offers';
  import {
    barShape,
    clearOfZero,
    signed,
    spread,
    surelyWorse,
    type SkillRow,
    type ValueScale
  } from './build-result';

  /**
   * The skills to buy as the game lists them, tinted by tier, the most useful first. Under each name a bar shows what it
   * adds to the build, on the scale every skill row shares: green when the races are sure it helps, grey when they are
   * not sure either way (the search still buys such a skill, as unspent SP is lost), orange when it surely costs her.
   */
  interface Props {
    rows: SkillRow[];
    scale: ValueScale;
    /** Values are runners beaten in real CM fields, not seconds. */
    field: boolean;
  }

  let { rows, scale, field }: Props = $props();
</script>

<ul
  class="buy-list"
  aria-label="Skills to buy"
>
  {#each rows as row (row.key)}
    {@const value = row.value}
    <li
      class="skill tier-{skillTier(row.offer.skill)}"
      class:helps={value !== undefined && value.mean > 0 && clearOfZero(value)}
      class:loss={value !== undefined && surelyWorse(value)}
    >
      <img
        src={skillImage(row.offer.skill.icon)}
        alt=""
        width="32"
        height="32"
      />
      <span class="name">
        <strong>{row.offer.skill.name}</strong>
        {#if row.via.length}
          <small>with {row.via.map((offer) => offer.skill.name).join(', ')}</small>
        {/if}
      </span>
      <span class="cost">
        {#if row.locked}
          <Icon
            name="lock"
            size={12}
            label="Locked"
          />
        {/if}
        {row.cost} SP
      </span>
      {#if value}
        {@const shape = barShape(scale, value.mean)}
        <span
          class="bar"
          aria-hidden="true"
        >
          <span
            class="zero"
            style:left={shape.zero + '%'}
          ></span>
          <span
            class="fill"
            style:left={shape.left + '%'}
            style:width={shape.width + '%'}
          ></span>
        </span>
        <span
          class="value"
          title={spread(value)}
        >
          {signed(value.mean)}{field ? '' : ' s'}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  @import './buy-list.css';
  @import '../../../setup/build/skill-tier.css';
</style>
