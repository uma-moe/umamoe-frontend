<script lang="ts">
  import type { Snippet } from 'svelte';
  import BuildColumnHead from './BuildColumnHead.svelte';
  import BuildSkillRow from './BuildSkillRow.svelte';
  import { checkText, racedGap, type TheorizedBuild } from './build-result';

  /**
   * The builds the theory found as cards of their skills, side by side, the most worth first: the pick. Where races in
   * her real fields ranked them, the most worth is the highest win rate there. Each card lists its own skills by what
   * each adds to it; a skill the pick does not buy is outlined, and what a build skips of the pick's is named under its
   * list.
   */
  interface Props {
    /** The most worth first: by her win rate in races when races ranked them. */
    builds: TheorizedBuild[];
    /** The largest worth shown, a full bar. */
    scale: number;
    phaseBounds: number[];
    /** The check races measured runners beaten in real CM fields, not seconds. */
    field: boolean;
    /** Races each finalist was checked in. */
    checkRaces: number;
    /** What else the result offers, at the end of the builds' header: how it was found, its raw data. */
    tools?: Snippet;
  }

  let { builds, scale, phaseBounds, field, checkRaces, tools }: Props = $props();

  const ordinal = (rank: number) => rank + (['st', 'nd', 'rd'][rank - 1] ?? 'th');
  const estimatesWin = $derived(builds[0]?.win !== undefined);
  /** Races in her real fields ranked the builds, so their win rates there order them, not the theory. */
  const racesRank = $derived(builds[0]?.raced !== undefined);

  /** Estimated win points the pick is ahead of `build`, when both carry the estimate. */
  function winBehind(build: TheorizedBuild): number | undefined {
    const pickWin = builds[0]?.win;
    if (pickWin === undefined || build.win === undefined) return undefined;
    return pickWin - build.win;
  }

  /** How far `build` trails the pick in the races that ranked them, when both were raced. */
  function racedBehind(build: TheorizedBuild) {
    const pickRaced = builds[0]?.raced;
    if (pickRaced === undefined || build.raced === undefined) return undefined;
    return racedGap(pickRaced, build.raced);
  }
</script>

<section
  class="builds"
  aria-labelledby="build-options"
>
  <header>
    <h3 id="build-options">
      Builds <span>{builds.length}</span>
    </h3>
    <ul
      class="key"
      aria-label="What the bars show"
    >
      <li
        title="Lengths (2.5 m each) a skill gains her in the build: the build against the build without it, theorized from where it fires on this course and what it does there"
      >
        Lengths gained
      </li>
      {#if estimatesWin}
        <li
          title={'Win rate a skill’s lengths are worth in a CM field, by a model learned from what skills added to real runners in their recorded CM10–19 rooms.' +
            (racesRank ? '' : ' Near-tied builds are ordered by it.')}
        >
          ≈ Win estimate
        </li>
      {/if}
      <li>
        <span class="swatch helps"></span>
        Helps
      </li>
      <li
        title="It adds nothing here: she has the HP to spare, another skill does the same, or it rarely fires"
      >
        <span class="swatch"></span>
        Adds nothing
      </li>
      <li>
        <span class="swatch loss"></span>
        Costs her
      </li>
    </ul>
    {#if tools}
      <div class="tools">{@render tools()}</div>
    {/if}
  </header>

  <div
    class="columns"
    style:--builds={builds.length}
  >
    {#each builds as build, index (build.finalist)}
      {@const title = ordinal(index + 1)}
      <article
        class="column"
        class:pick={index === 0}
        aria-label={title}
      >
        <BuildColumnHead
          {title}
          pick={index === 0}
          spCost={build.finalist.sp_cost}
          count={build.count}
          lengths={build.lengths}
          behind={index > 0 ? builds[0]!.lengths - build.lengths : undefined}
          behindWin={index > 0 ? winBehind(build) : undefined}
          winRate={build.raced?.win_rate}
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
                lengths={cell.lengths}
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
    {/each}
  </div>
</section>

<style>
  @import './build-columns.css';
</style>
