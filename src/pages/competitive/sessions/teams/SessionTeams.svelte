<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import { raceRunnerKey, type MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import TextField from '@/components/controls/TextField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import SessionTeamCard from './SessionTeamCard.svelte';
  import SessionTeamDetails from './SessionTeamDetails.svelte';
  import SessionKpis from '../SessionKpis.svelte';
  import { rate } from '../../analysis-view';
  import { playerKpi, teamKpi, type SessionKpi } from '../session-kpis';
  import { isSmallSample, playerRecord, sessionBaseline, SMALL_SAMPLE } from '../session-insights';
  import {
    compositionStyles,
    isPlayerTeam,
    type SessionTeam,
    type TeamFilter
  } from '../session-statistics';

  interface Props {
    teams: SessionTeam[];
    analysis: MultiRaceAnalysis;
    captures: ParsedRaceCapture[];
    filter: TeamFilter;
    skillNames: Map<number, string>;
    onreplay?: (race: number) => void;
  }

  let { teams, analysis, captures, filter = $bindable(), skillNames, onreplay }: Props = $props();

  const PAGE_SIZE = 12;

  let search = $state(''),
    sort = $state('winrate'),
    limit = $state(PAGE_SIZE),
    skillCatalog = $state.raw<Map<number, SkillData>>(),
    inspected = $state<SessionTeam>();

  const baseline = $derived(sessionBaseline(analysis));
  const player = $derived(playerRecord(captures));
  const hasPlayerTeams = $derived(teams.some(isPlayerTeam));
  const measuredTeams = $derived(teams.filter((team) => !isSmallSample(team.appearances)));

  const kpis = $derived.by(() => {
    const list: SessionKpi[] = [];
    if (player)
      list.push(
        playerKpi(player, baseline, {
          label: 'Your teams',
          icon: 'filter',
          onselect: () => (filter = { own: true })
        })
      );

    const best = [...measuredTeams].sort(
      (a, b) => rate(b.wins, b.appearances) - rate(a.wins, a.appearances)
    )[0];
    if (best)
      list.push(
        teamKpi(best, baseline, {
          label: 'Builds',
          icon: 'eye',
          onselect: () => (inspected = best)
        })
      );

    list.push({
      id: 'measured',
      label: 'Team builds with ' + SMALL_SAMPLE + '+ races',
      value: measuredTeams.length + ' of ' + teams.length,
      detail: 'the rest are muted: too few races to judge'
    });

    return list;
  });

  const umaName = $derived(
    analysis.characters.find((uma) => uma.key === filter.uma)?.name ?? 'Selected Uma'
  );

  const compositionName = $derived(
    filter.composition
      ?.split('-')
      .map((id) => runningStyleName(Number(id), true))
      .join(' / ')
  );

  const matching = $derived(
    teams
      .filter((team) => matchesFilter(team) && matchesSearch(team))
      .sort((a, b) =>
        sort === 'appearances'
          ? b.appearances - a.appearances
          : rate(b.wins, b.appearances) - rate(a.wins, a.appearances)
      )
  );

  $effect(() => {
    teams;
    filter;
    search;
    sort;
    limit = PAGE_SIZE;
  });

  function matchesFilter(team: SessionTeam) {
    if (filter.own && !isPlayerTeam(team)) return false;
    if (filter.composition && compositionStyles(team.members).join('-') !== filter.composition)
      return false;

    return team.members.some((runner) => {
      const umaMatches = !filter.uma || raceRunnerKey(runner) === filter.uma;
      const styleMatches = !filter.style || String(runner.result?.runningStyle) === filter.style;
      return umaMatches && styleMatches;
    });
  }

  function matchesSearch(team: SessionTeam) {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    const names = team.trainer + ' ' + team.members.map((runner) => runner.name).join(' ');
    return names.toLowerCase().includes(query);
  }

  /** Replays the team's first race, leaving the dialog so the replay is in view. */
  function replayInspected() {
    const race = inspected?.races[0];
    inspected = undefined;
    if (race !== undefined) onreplay?.(race);
  }

  function clearFilters() {
    filter = {};
    search = '';
  }

  onMount(() => {
    loadSkills()
      .then((catalog) => (skillCatalog = catalog))
      .catch(() => {
        // Skill point totals are optional; the cards read the same without them.
      });
  });
</script>

<div class="teams">
  <SessionKpis
    label="Teams at a glance"
    {kpis}
  />
  <div class="toolbar">
    {#if hasPlayerTeams}
      <SegmentedControl
        compact
        label="Teams shown"
        options={[
          { value: 'all', label: 'All teams' },
          { value: 'own', label: 'Your teams' }
        ]}
        bind:value={
          () => (filter.own ? 'own' : 'all'),
          (value) => (filter = { ...filter, own: value === 'own' || undefined })
        }
      />
    {/if}
    <div class="search">
      <TextField
        id="session-team-search"
        label="Search teams"
        hideLabel
        type="search"
        prefixIcon="search"
        placeholder="Search Umas or trainers"
        bind:value={search}
      />
    </div>
    <div class="select">
      <SelectField
        id="session-team-style"
        label="Running style"
        hideLabel
        options={[
          { value: 'all', label: 'All styles' },
          ...[1, 2, 3, 4].map((id) => ({ value: String(id), label: runningStyleName(id) }))
        ]}
        bind:value={
          () => filter.style ?? 'all',
          (value) => (filter = { ...filter, style: value === 'all' ? undefined : value })
        }
      />
    </div>
    <div class="select">
      <SelectField
        id="session-team-sort"
        label="Sort teams"
        hideLabel
        options={[
          { value: 'winrate', label: 'Team win rate' },
          { value: 'appearances', label: 'Most races' }
        ]}
        bind:value={sort}
      />
    </div>
    {#if filter.uma}
      <Button
        variant="secondary"
        size="sm"
        icon="close"
        ariaLabel={'Clear the ' + umaName + ' filter'}
        onclick={() => (filter = { ...filter, uma: undefined })}
      >
        {umaName}
      </Button>
    {/if}
    {#if compositionName}
      <Button
        variant="secondary"
        size="sm"
        icon="close"
        ariaLabel={'Clear the ' + compositionName + ' filter'}
        onclick={() => (filter = { ...filter, composition: undefined })}
      >
        {compositionName}
      </Button>
    {/if}
    <span
      class="count"
      role="status"
    >
      {matching.length.toLocaleString()} of {teams.length.toLocaleString()} teams
    </span>
  </div>
  {#if matching.length}
    <div class="team-grid">
      {#each matching.slice(0, limit) as team, index (team.key)}
        <SessionTeamCard
          {team}
          {skillCatalog}
          position={index + 1}
          oninspect={() => (inspected = team)}
          onreplay={onreplay ? () => onreplay(team.races[0]!) : undefined}
        />
      {/each}
    </div>
    {#if limit < matching.length}
      <div class="more">
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (limit += PAGE_SIZE)}
        >
          Show {Math.min(PAGE_SIZE, matching.length - limit)} more teams
        </Button>
      </div>
    {/if}
  {:else}
    <EmptyState
      compact
      icon="search"
      title="No matching teams"
      description="Try another name or style, or clear the filters."
    >
      {#snippet actions()}
        <Button
          variant="secondary"
          size="sm"
          icon="close"
          onclick={clearFilters}
        >
          Clear filters
        </Button>
      {/snippet}
    </EmptyState>
  {/if}
</div>
<SessionTeamDetails
  team={inspected}
  {skillNames}
  raceDistance={inspected ? captures[inspected.races[0]!]?.raceDistance : undefined}
  onclose={() => (inspected = undefined)}
  onreplay={onreplay ? replayInspected : undefined}
/>

<style>
  @import './session-teams.css';
</style>
