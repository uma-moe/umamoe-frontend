<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import BuildColumnHead from './BuildColumnHead.svelte';
  import BuildSkillRow from './BuildSkillRow.svelte';
  import {
    checkText,
    contributionScale,
    racedGap,
    type SkillUnit,
    type TheorizedBuild
  } from './build-result';
  import {
    nextSkillSort,
    SHOP_ORDER,
    sortSkills,
    type SkillSort,
    type SkillSortKey
  } from './skill-sort';

  /** Equivalent build cards, kept visible in the server's original order. */
  interface Props {
    builds: TheorizedBuild[];
    skillUnit?: SkillUnit;
    phaseBounds: number[];
    field: boolean;
    checkRaces: number;
    tools?: Snippet;
    onrace?: (build: TheorizedBuild) => void;
    onraceall?: () => void;
    /** Indices into `builds` already in the field. */
    raced?: number[];
    onopenrace?: () => void;
    raceError?: string;
    raceBlocked?: string;
  }

  let {
    builds,
    skillUnit = 'lengths',
    phaseBounds,
    field,
    checkRaces,
    tools,
    onrace,
    onraceall,
    raced = [],
    onopenrace,
    raceError = '',
    raceBlocked = ''
  }: Props = $props();

  const UNIT_TITLE: Record<SkillUnit, string> = {
    lengths: 'Lengths gained',
    score: 'Skill score',
    seconds: 'Seconds saved'
  };
  const UNIT_HEADING: Record<SkillUnit, string> = {
    lengths: 'Gain',
    score: 'Score',
    seconds: 'Saved'
  };
  const ordinal = (rank: number) => rank + (['st', 'nd', 'rd'][rank - 1] ?? 'th');

  /** One order for every build, so their lists compare line by line. */
  let skillSort = $state<SkillSort>(SHOP_ORDER);

  /** How far a build trails the pick in the optimizer's comparison races. */
  function racedBehind(build: TheorizedBuild) {
    const pickRaced = builds[0]?.raced;
    if (pickRaced === undefined || build.raced === undefined) return undefined;
    return racedGap(pickRaced, build.raced);
  }

  function sortArrow(key: SkillSortKey): string {
    if (skillSort.key !== key) return '↕';
    return skillSort.direction === 'ascending' ? '↑' : '↓';
  }
</script>

{#snippet sortButton(key: SkillSortKey, label: string, description: string)}
  <button
    type="button"
    class="sort {key}"
    class:active={skillSort.key === key}
    title={'Sort ' + description}
    onclick={() => (skillSort = nextSkillSort(skillSort, key))}
  >
    {label}
    <span
      class="sort-arrow"
      aria-hidden="true"
    >
      {sortArrow(key)}
    </span>
    {#if skillSort.key === key}
      <span class="sr-only">, sorted {skillSort.direction}</span>
    {/if}
  </button>
{/snippet}

{#snippet buildCard(build: TheorizedBuild, index: number)}
  {@const title = ordinal(index + 1)}
  {@const scale = contributionScale(build.cells)}
  <!-- A sorted copy: `build.cells` keeps the optimizer's order, which its purchase indices refer to. -->
  {@const sortedCells = sortSkills(build.cells, skillSort, (cell) => ({
    skill: cell.skill.offer.skill,
    cost: cell.skill.cost,
    value: cell.value
  }))}
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
      pickGap={build.pickGap}
      teamTrialsScore={build.teamTrialsScore}
      racedBehind={index > 0 ? racedBehind(build) : undefined}
      check={checkText(build.finalist, field, checkRaces)}
    />
    {#if build.cells.length > 1}
      <div
        class="sort-header"
        role="group"
        aria-label="Sort skills"
      >
        {@render sortButton('shop', 'Skill', 'in the skill shop’s order')}
        {@render sortButton('cost', 'SP', 'by SP cost')}
        {@render sortButton(
          'value',
          UNIT_HEADING[skillUnit],
          'by ' + UNIT_TITLE[skillUnit].toLowerCase()
        )}
      </div>
    {/if}
    <ul
      class="cells"
      aria-label={index === 0 ? 'Skills to buy' : 'Skills in the ' + title + ' build'}
    >
      {#each sortedCells as cell (cell.skill.key)}
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
    {#if onrace}
      <div class="card-actions">
        <Button
          size="sm"
          variant="secondary"
          icon="stopwatch"
          disabled={Boolean(raceBlocked) || raced.includes(index)}
          title={raced.includes(index)
            ? 'Already in the Race sim field'
            : raceBlocked || 'Add her to the Race sim field with these skills'}
          onclick={() => onrace(build)}
        >
          {raced.includes(index) ? 'In the Race sim' : 'Add to Race sim'}
        </Button>
      </div>
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
      title="A full bar marks the largest skill contribution within that build. Each build has its own scale, so bar width does not show build strength or win probability."
    >
      {UNIT_TITLE[skillUnit]}
    </span>
    <div class="header-actions">
      {#if onraceall && builds.length > 1}
        <Button
          size="sm"
          variant="secondary"
          icon="stopwatch"
          disabled={Boolean(raceBlocked)}
          title={raceBlocked || 'Add both builds to the Race sim field, so they race each other'}
          onclick={onraceall}
        >
          Race both builds
        </Button>
      {/if}
      {#if tools}<div class="tools">{@render tools()}</div>{/if}
    </div>
  </header>

  <div class="columns">
    {#each builds as build, index (build.finalist)}
      {@render buildCard(build, index)}
    {/each}
  </div>
  {#if raceError}
    <p
      class="race-error"
      role="status"
    >
      {raceError}
    </p>
  {:else if raced.length && onopenrace}
    <p
      class="race-added"
      role="status"
    >
      <span>
        {raced.length === 1 ? 'She is' : 'Both builds are'} in the Race sim field.
      </span>
      <Button
        size="sm"
        variant="primary"
        icon="stopwatch"
        onclick={onopenrace}
      >
        Open Race sim
      </Button>
    </p>
  {/if}
</section>

<style>
  @import './build-columns.css';
</style>
