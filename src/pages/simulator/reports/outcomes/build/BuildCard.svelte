<script lang="ts">
  import { skillImage } from '@/lib/game-data/skills/skills';
  import type { OptimizeEstimate } from '../../../simulator-repository';
  import { amount, type HeldSkill, type StatCell } from './build-result';

  /** A build that came close to the best: what it gains her, how she races with it, and what it swaps. */
  interface Props {
    title: string;
    spCost: number;
    gain?: OptimizeEstimate;
    /** The best build's gain, which this one trails. */
    bestGain?: OptimizeEstimate;
    /** Gains are runners beaten in real CM fields, not seconds. */
    field: boolean;
    stats: StatCell[];
    /** What it buys that the best build does not, and what it drops. */
    changes: { added: HeldSkill[]; dropped: HeldSkill[] };
  }

  let { title, spCost, gain, bestGain, field, stats, changes }: Props = $props();

  const behind = $derived(
    gain && bestGain && bestGain.mean !== gain.mean ? gain.mean - bestGain.mean : undefined
  );
</script>

{#snippet chips(skills: HeldSkill[], added: boolean)}
  {#each skills as skill (skill.key)}
    <li
      class="chip"
      class:added
    >
      <span class="sign">{added ? '+' : '−'}</span>
      <img
        src={skillImage(skill.offer.skill.icon)}
        alt=""
        width="16"
        height="16"
      />
      <span class="chip-name">{skill.offer.skill.name}</span>
      <span class="sr-only">{added ? ', bought instead' : ', dropped'}</span>
    </li>
  {/each}
{/snippet}

<article
  class="card"
  aria-label={title}
>
  <header>
    <h4>{title}</h4>
    <span class="sp">{spCost.toLocaleString('en-US')} SP</span>
  </header>

  {#if gain}
    <p class="gain">
      <strong>{amount(gain.mean, field)}</strong>
      {#if behind !== undefined}
        <span>{amount(behind, field)} vs best</span>
      {/if}
    </p>
  {/if}

  {#if changes.added.length || changes.dropped.length}
    <ul
      class="swaps"
      aria-label="Swaps from the best build"
    >
      {@render chips(changes.added, true)}
      {@render chips(changes.dropped, false)}
    </ul>
  {/if}

  {#if stats.length}
    <dl class="stats">
      {#each stats as stat (stat.label)}
        <div class:top={stat.top}>
          <dt>{stat.label}</dt>
          <dd>{stat.text}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</article>

<style>
  @import './build-card.css';
</style>
