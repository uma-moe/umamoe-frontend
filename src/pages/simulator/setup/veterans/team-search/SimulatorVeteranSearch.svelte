<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace } from '@/lib/workspaces/workspace-state';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
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
    course?: CourseCatalogEntry;
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
  const blocked = $derived(
    poolLoading
      ? 'Loading your Veterans…'
      : !teams
        ? candidates.length < 3
          ? 'Pick at least three Veterans.'
          : 'Pick three different characters; variants of one can’t race together.'
        : !validSamples
          ? 'Races per team must be 1 to 1,000.'
          : !(Number.isInteger(seed) && seed >= -2147483648 && seed <= 2147483647)
            ? 'Fix the race seed first.'
            : opponentSource === 'cm'
              ? benchmarkLoading
                ? 'Loading the CM teams…'
                : !benchmark
                  ? 'Choose a CM dataset that loads, or race the field.'
                  : ''
              : !course
                ? 'Pick a course first.'
                : opponents.length !== 6
                  ? 'Pick six opponents.'
                  : ''
  );
  const inputKey = $derived(
    JSON.stringify([picked, opponentSource, snapshotId, opponentIds, samples, seed])
  );
  const stale = $derived(
    !!teamSearch.top.length && !teamSearch.busy && teamSearch.key !== inputKey
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
        ? `${cm.snapshot.label} · ${cm.teams.length} leading teams · ${Math.min(fields.length, sampleCount)} opponent pairings.`
        : 'Six opponents from the race field.'
    });
  }
</script>

<Dialog
  bind:open
  title="Find my best team"
  icon="veterans"
  maxWidth="1180px"
  maxHeight="92dvh"
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

    <div class="side">
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
        {races}
        {blocked}
        onsearch={search}
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
  </div>
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => {
        teamSearch.stop = true;
        open = false;
      }}
    >
      Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .team-search {
    display: grid;
    grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
    gap: 14px;
    align-items: start;
    min-width: 0;
  }
  .side {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  @media (max-width: 900px) {
    .team-search {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
