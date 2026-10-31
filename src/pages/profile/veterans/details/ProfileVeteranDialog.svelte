<script lang="ts">
  import type { ProfileVeteran } from '../../profile-repository';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import type { LineageBranch, LineageNodeData } from '@/components/lineage/lineage-types';
  import type { SkillData } from '@/lib/game-data/skills/skills';
  import { loadRaceHistory, type RaceHistoryEntry } from '@/lib/game-data/racing/races';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { veteranDatabaseUrl } from '@/lib/veterans/records/veteran-links';
  import ProfileVeteranIdentity from '../ProfileVeteranIdentity.svelte';
  import ProfileVeteranDetails from './ProfileVeteranDetails.svelte';
  import { simulatorUmaFromVeteran } from '@/pages/simulator/simulator-uma';
  import { openSimulatorField } from '@/pages/simulator/simulator-session.svelte';
  import RaceResultsDialog from '@/pages/database/results/RaceResultsDialog.svelte';

  let {
    veteran,
    summary,
    skillCatalog,
    family,
    accountId,
    open = $bindable(false)
  }: {
    veteran: ProfileVeteran;
    summary: VeteranUiRecord;
    skillCatalog: Map<number, SkillData>;
    family?: { root: LineageNodeData; branches: LineageBranch[] };
    accountId?: string;
    open?: boolean;
  } = $props();

  let simError = $state(''),
    simBusy = $state(false);

  async function simulate() {
    simBusy = true;
    simError = '';
    try {
      await openSimulatorField([simulatorUmaFromVeteran(veteran, summary.name)]);
      open = false;
    } catch (error) {
      simError = (error as Error).message;
    } finally {
      simBusy = false;
    }
  }

  const id = $props.id();

  const legacyUrl = $derived(veteranDatabaseUrl(veteran, accountId, summary.affinityTarget?.id));
  const lineage = $derived(
    family ?? {
      root: {
        id: summary.id,
        name: summary.name,
        image: summary.image,
        role: 'main' as const,
        roleLabel: 'Main',
        sparks: summary.sparks
      },
      branches: []
    }
  );

  let races = $state<RaceHistoryEntry[]>([]),
    raceLoading = $state(false),
    raceError = $state(''),
    scheduleOpen = $state(false);

  $effect(() => {
    if (!open) {
      scheduleOpen = false;
      return;
    }

    let active = true;
    races = [];
    raceError = '';
    raceLoading = true;
    void loadRaceHistory(veteran.win_saddle_id_array ?? [], veteran.race_results ?? [])
      .then((entries) => {
        if (active) races = entries;
      })
      .catch(() => {
        if (active) raceError = 'Race history could not be loaded.';
      })
      .finally(() => {
        if (active) raceLoading = false;
      });

    return () => {
      active = false;
    };
  });

  function openPlanner() {
    try {
      localStorage.setItem(
        'planner_transfer',
        JSON.stringify({
          veteran,
          veteranPosition: 'p1',
          targetCharaId: summary.affinityTarget?.id
        })
      );
    } catch {
      /* Legacy transfer is best effort. */
    }

    window.open('/tools/lineage-planner?from=profile', '_blank', 'noopener');
  }
</script>

<Dialog
  {id}
  bind:open
  title={summary.name}
  description={[
    summary.scenario,
    summary.detail,
    veteran.rarity ? '★'.repeat(Math.max(0, Math.min(5, veteran.rarity))) : ''
  ]
    .filter(Boolean)
    .join(', ')}
  maxWidth="800px"
  maxHeight="min(90dvh, 850px)"
  mobileMaxHeight="calc(100dvh - 32px)"
  mobileInset="16px"
  contentPadding="16px"
  mobileContentPadding="12px"
>
  {#snippet headerIdentity(titleId, descriptionId)}
    <ProfileVeteranIdentity
      {summary}
      rarity={veteran.rarity}
      score={veteran.rank_score}
      heading="h2"
      {titleId}
      {descriptionId}
    />
  {/snippet}
  {#if simError}
    <p role="alert">{simError}</p>
  {/if}
  {#if open}
    {#key veteran}
      <ProfileVeteranDetails
        {veteran}
        {summary}
        {skillCatalog}
        family={lineage}
        {races}
        {raceLoading}
        {raceError}
        onplanner={openPlanner}
        onschedule={() => (scheduleOpen = true)}
      />
    {/key}
  {/if}
  {#snippet actions()}
    <Button
      icon="race"
      variant="secondary"
      loading={simBusy}
      onclick={simulate}
    >
      Use in simulator
    </Button>{#if legacyUrl}
      <Button
        href={legacyUrl}
        icon="database"
        onclick={() => (open = false)}
      >
        Use as legacy
      </Button>
    {/if}
  {/snippet}
</Dialog>
<RaceResultsDialog
  bind:open={scheduleOpen}
  charId={veteran.card_id ?? 0}
  charName={summary.name}
  charImage={summary.image}
  winSaddleIds={veteran.win_saddle_id_array ?? []}
  runRaceIds={veteran.race_results ?? []}
/>
