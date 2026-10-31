<script lang="ts">
  import type { Snippet } from 'svelte';
  import BuildColumnHead from './BuildColumnHead.svelte';
  import BuildSkillRow from './BuildSkillRow.svelte';
  import {
    checkText,
    contributionScale,
    racedGap,
    type SkillUnit,
    type TheorizedBuild
  } from './build-result';

  /** Equivalent build cards, kept visible in the server's original order. */
  interface Props {
    builds: TheorizedBuild[];
    skillUnit?: SkillUnit;
    phaseBounds: number[];
    field: boolean;
    checkRaces: number;
    tools?: Snippet;
  }

  let { builds, skillUnit = 'lengths', phaseBounds, field, checkRaces, tools }: Props = $props();

  const UNIT_TITLE: Record<SkillUnit, string> = {
    lengths: 'Lengths gained',
    score: 'Skill score',
    seconds: 'Seconds saved'
  };
  const ordinal = (rank: number) => rank + (['st', 'nd', 'rd'][rank - 1] ?? 'th');

  /** How far a build trails the pick in the optimizer's comparison races. */
  function racedBehind(build: TheorizedBuild) {
    const pickRaced = builds[0]?.raced;
    if (pickRaced === undefined || build.raced === undefined) return undefined;
    return racedGap(pickRaced, build.raced);
  }
</script>

{#snippet buildCard(build: TheorizedBuild, index: number)}
  {@const title = ordinal(index + 1)}
  {@const scale = contributionScale(build.cells)}
  <article
    class="column"
    class:pick={index === 0}
    aria-label={title}
  >
    <BuildColumnHead
      title={index === 0 ? 'Recommended build' : 'Runner-up'}
      spCost={build.finalist.sp_cost}
      count={build.count}
      value={build.value}
      unit={build.unit}
      behind={index > 0 && builds[0]?.value !== undefined && build.value !== undefined
        ? builds[0]!.value! - build.value
        : undefined}
      winRate={build.winRate ?? build.raced?.win_rate}
      racedBehind={index > 0 ? racedBehind(build) : undefined}
      check={checkText(build.finalist, field, checkRaces)}
    />
    <ul
      class="cells"
      aria-label={index === 0 ? 'Skills to buy' : 'Skills in the ' + title + ' build'}
    >
      {#each build.cells as cell (cell.skill.key)}
        <li>
          <BuildSkillRow
            offer={cell.skill.offer}
            via={cell.skill.via}
            cost={cell.skill.cost}
            value={cell.value}
            unit={skillUnit}
            measurement={cell.measurement}
            win={cell.win}
            fire={cell.fire}
            source={cell.valuation.source}
            countGated={cell.valuation.countGated}
            locked={cell.locked}
            differs={cell.differs}
            {scale}
            {phaseBounds}
            context="in this build"
          />
        </li>
      {/each}
    </ul>
    {#if build.skipped.length}
      <p class="skips">
        <span>Skips</span>
        {build.skipped.join(', ')}
      </p>
    {/if}
  </article>
{/snippet}

<section
  class="builds"
  aria-labelledby="build-options"
>
  <header>
    <h3 id="build-options">Build options</h3>
    <span
      class="key"
      title="A full bar marks the largest skill contribution within that build. Each build has its own scale; bar width does not show build strength or win probability."
    >
      {UNIT_TITLE[skillUnit]} · bars scaled within each build
    </span>
    {#if tools}<div class="tools">{@render tools()}</div>{/if}
  </header>

  <div class="columns">
    {#each builds as build, index (build.finalist)}
      {@render buildCard(build, index)}
    {/each}
  </div>
</section>

<style>
  @import './build-columns.css';
</style>
