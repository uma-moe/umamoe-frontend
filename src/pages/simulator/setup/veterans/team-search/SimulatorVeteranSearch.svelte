<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace } from '@/lib/workspaces/workspace-state';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import { simulatorRoster } from '../../../simulator-roster.svelte';
  import type { CmBenchmark } from '../../../courses/cm-benchmark';
  import type { RaceSetupInput } from '../../../requests/stamina-request';
  import { loadVeteranEntries, type VeteranEntry } from '../veteran-entries';
  import { veteranTeamCount, pairingSeeds, benchmarkFields } from './veteran-pairings';
  import { TeamSearch } from './team-search.svelte';
  import VeteranSearchPool from './VeteranSearchPool.svelte';
  import VeteranSearchOpponents from './VeteranSearchOpponents.svelte';
  import VeteranSearchRun from './VeteranSearchRun.svelte';
  import VeteranSearchResults from './VeteranSearchResults.svelte';
  import DialogStatus from '../../../shell/DialogStatus.svelte';

  /**
   * Find my best team: every team of three from the Veterans picked, raced against the same opponents, seeds and gates,
   * ranked by how often one of the three wins. The answer comes first, with the teams close behind it.
   */
  let {
    open = $bindable(false),
    course,
    setup,
    seed,
    initialSnapshot = ''
  }: {
    open?: boolean;
    course?: RaceCourse;
    setup: RaceSetupInput;
    seed: number;
    initialSnapshot?: string;
  } = $props();

  const uid = $props.id();

  // Your Veterans: every one with trained stats is picked to start with.
  let accountId = $state(''),
    entries = $state.raw<VeteranEntry[]>([]),
    picked = $state<string[]>([]),
    poolLoading = $state(false),
    poolError = $state('');

  $effect(() => {
    if (open) accountId = $activeWorkspace.accountId ?? '';
  });

  $effect(() => {
    if (!open || !$authReady) return;
    const id = accountId;
    $authUser;
    let active = true;
    poolLoading = true;
    poolError = '';
    void loadVeteranEntries(id)
      .then((result) => {
        if (!active) return;
        entries = result.entries;
        picked = result.entries.map((entry) => entry.key);
      })
      .catch((reason) => {
        if (active)
          poolError = reason instanceof Error ? reason.message : 'Couldn’t load Veterans.';
      })
      .finally(() => {
        if (active) poolLoading = false;
      });

    return () => {
      active = false;
    };
  });

  const candidates = $derived.by(() => {
    const keys = new Set(picked);
    return entries.filter((entry) => keys.has(entry.key)).map((entry) => entry.uma);
  });

  const teams = $derived(veteranTeamCount(candidates));

  // Opponents: the leading teams of a CM dataset, or six runners from the race field.
  let opponentSource = $state(''),
    snapshotId = $state(''),
    benchmark = $state.raw<CmBenchmark>(),
    benchmarkLoading = $state(false),
    opponentIds = $state<string[]>([]);

  $effect(() => {
    if (open && !opponentSource)
      opponentSource =
        initialSnapshot || !simulatorRoster.configured || simulatorRoster.umas.length < 6
          ? 'cm'
          : 'field';
  });

  $effect(() => {
    if (open && !opponentIds.length && simulatorRoster.umas.length >= 6)
      opponentIds = simulatorRoster.umas.slice(-6).map((uma) => uma.id);
  });

  const opponents = $derived(
    opponentIds.flatMap((id) => simulatorRoster.umas.filter((uma) => uma.id === id))
  );

  /** The course the teams race on: the dataset's, or the race's. */
  const raceCourse = $derived(opponentSource === 'cm' ? benchmark?.course : course);

  // The run.
  const teamSearch = new TeamSearch();
  let samples = $state('100');
  $effect(() => {
    if (!open) teamSearch.stop = true;
  });

  const validSamples = $derived(
    /^\d+$/.test(String(samples)) && Number(samples) >= 1 && Number(samples) <= 1000
  );

  const races = $derived(validSamples ? teams * Number(samples) : 0);
  const blocked = $derived.by(() => {
    if (poolLoading) {
      return 'Loading your Veterans…';
    }

    if (!teams) {
      if (candidates.length < 3) {
        return 'Pick at least three Veterans.';
      }

      return 'Pick three different characters. Variants of one character can’t race together.';
    }

    if (!validSamples) {
      return 'Races per team must be 1 to 1,000.';
    }

    if (!(Number.isInteger(seed) && seed >= -2147483648 && seed <= 2147483647)) {
      return 'Fix the race seed first.';
    }

    if (opponentSource === 'cm') {
      if (benchmarkLoading) {
        return 'Loading the CM teams…';
      }

      if (!benchmark) {
        return 'Choose a CM dataset that loads, or race the field.';
      }

      return '';
    }

    if (!course) {
      return 'Pick a course first.';
    }

    if (opponents.length !== 6) {
      return 'Pick six opponents.';
    }

    return '';
  });

  const progressText = $derived.by(() => {
    const counted =
      teamSearch.completed.toLocaleString('en-US') +
      ' of ' +
      teamSearch.total.toLocaleString('en-US') +
      ' races';
    if (teamSearch.busy) return counted;

    return counted + (teamSearch.completed < teamSearch.total ? ', stopped' : ' done');
  });

  const inputKey = $derived(
    JSON.stringify([picked, opponentSource, snapshotId, opponentIds, samples, seed])
  );

  const stale = $derived(
    Boolean(teamSearch.top.length) && !teamSearch.busy && teamSearch.key !== inputKey
  );

  async function search() {
    if (blocked || teamSearch.busy) return;
    const cm = opponentSource === 'cm' ? benchmark : undefined;
    const target = structuredClone($state.snapshot(cm?.course ?? course!)),
      raceSetup = structuredClone($state.snapshot(cm?.setup ?? setup));

    const pool = structuredClone($state.snapshot(candidates)),
      sampleCount = Number(samples),
      seeds = pairingSeeds(seed, sampleCount);

    if (cm) for (const uma of pool) uma.trainee.motivation = String(cm.motivation);
    const fields = cm
      ? benchmarkFields(structuredClone(cm.teams.map((team) => team.umas)))
      : [
          structuredClone($state.snapshot(opponents)).map((uma, index) => ({
            ...uma,
            teamId: index < 3 ? 2 : 3,
            frameOrder: undefined
          }))
        ];

    await teamSearch.run({
      target,
      raceSetup,
      pool,
      fields,
      seeds,
      sampleCount,
      total: teams * sampleCount,
      key: inputKey,
      description: cm
        ? `${cm.snapshot.label}, ${cm.teams.length} leading teams and ${Math.min(fields.length, sampleCount)} opponent pairings.`
        : 'Six opponents from the race field.'
    });
  }
</script>

<Dialog
  bind:open
  title="Find my best team"
  description="Every team of three from your Veterans, raced against the same opponents, seeds and gates."
  maxWidth="640px"
  maxHeight="92dvh"
  mobileMaxHeight="96dvh"
  mobileFill
  compact
>
  <div class="team-search">
    <VeteranSearchPool
      accountFieldId="{uid}-account"
      bind:accountId
      {entries}
      bind:picked
      loading={poolLoading}
      error={poolError}
      {teams}
      course={raceCourse}
      disabled={teamSearch.busy}
    />

    <VeteranSearchOpponents
      bind:source={opponentSource}
      bind:snapshotId
      bind:benchmark
      bind:benchmarkLoading
      bind:opponentIds
      opponentCount={opponents.length}
      {initialSnapshot}
      disabled={teamSearch.busy}
    />

    <VeteranSearchRun
      search={teamSearch}
      samplesFieldId="{uid}-samples"
      bind:samples
      {teams}
      {races}
    />

    <VeteranSearchResults
      top={teamSearch.top}
      busy={teamSearch.busy}
      {stale}
      {blocked}
      onuse={(team) => {
        teamSearch.useTeam(team);
        open = false;
      }}
      onsearch={search}
    />
  </div>
  {#snippet actions()}
    <DialogStatus>
      {#if teamSearch.busy || (teamSearch.completed && teamSearch.key === inputKey)}
        <progress
          max={teamSearch.total || 1}
          value={teamSearch.completed}
          aria-hidden="true"
        ></progress>
        <span class="progress-text">{progressText}</span>
      {:else if blocked}
        <span class="blocked">{blocked}</span>
      {:else}
        <strong>{races.toLocaleString('en-US')} races</strong>
        <span>{teams.toLocaleString('en-US')} {teams === 1 ? 'team' : 'teams'} × {samples}</span>
      {/if}
    </DialogStatus>
    <Button
      variant="secondary"
      onclick={() => {
        teamSearch.stop = true;
        open = false;
      }}
    >
      Close
    </Button>
    {#if teamSearch.busy}
      <Button
        variant="secondary"
        onclick={() => (teamSearch.stop = true)}
        disabled={teamSearch.stop}
      >
        {teamSearch.stop ? 'Stopping…' : 'Stop'}
      </Button>
    {:else}
      <Button
        icon="chart"
        disabled={Boolean(blocked)}
        onclick={search}
      >
        Find the best team
      </Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  /* One dense column: the Veterans, who they race, how many races, then the answer. */
  .team-search {
    --control-height: 32px;
    --setup-control-height: 32px;
    display: grid;
    min-width: 0;
  }
  progress {
    width: 96px;
    height: 6px;
    accent-color: var(--accent-primary);
  }
  .progress-text {
    color: var(--text-primary);
  }
</style>
