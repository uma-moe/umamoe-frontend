<script lang="ts">
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import { onMount, untrack } from 'svelte';
  import { watchFactors, factorOptions } from '@/lib/game-data/factors/factors';
  import {
    calculatePlannerAffinity,
    canPlacePlannerCharacter,
    plannerCharacterAffinity,
    plannerAffinityBreakdown,
    plannerAffinityFlows,
    plannerSkillSparks,
    type PlannerPosition
  } from '@/lib/lineage/planner';
  import { VeteranAffinityEngine } from '@/lib/veterans/affinity/affinity-engine';
  import { veteranAffinityRepository } from '@/lib/veterans/affinity/affinity-repository';
  import { parentCharacter } from '@/lib/veterans/parents/parent-picker';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import RaceWinPickerDialog from '@/components/parent-picker/RaceWinPickerDialog.svelte';
  import RaceResultsDialog from '@/pages/database/results/RaceResultsDialog.svelte';
  import OptimalRacesDialog from '@/pages/database/results/OptimalRacesDialog.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import type { CharacterPickerOption } from '@/components/pickers/picker-types';
  import type { ProfileVeteran, SuccessionChara } from '@/pages/profile/profile-repository';
  import {
    loadG1SaddleGroups,
    loadOptimalRaceRecommendations,
    type OptimalRaceRecommendation
  } from '@/lib/game-data/racing/races';
  import LineagePlannerNode from './tree/LineagePlannerNode.svelte';
  import LazyContent from '@/components/LazyContent.svelte';
  import LineageSparkOdds from './LineageSparkOdds.svelte';
  import LineageInheritance from './tree/LineageInheritance.svelte';
  import LineageTree from './tree/LineageTree.svelte';
  import LineageSaves from './LineageSaves.svelte';
  import { loadSkills, skillImage } from '@/lib/game-data/skills/skills';
  import { characterImage } from './lineage-planner-nodes';
  import { LineagePlannerTree } from './lineage-planner-tree.svelte';

  onMount(watchFactors);

  const tree = new LineagePlannerTree();

  let affinityEngine = $state<VeteranAffinityEngine>();
  let raceGroups = $state.raw(new Map<number, number>());
  let loadError = $state('');
  let activePosition = $state<PlannerPosition>('target');
  let pickerOpen = $state(false);
  let parentPickerOpen = $state(false);
  let pickerSort = $state<'default' | 'name' | 'affinity'>('affinity');
  let savesDialog = $state<LineageSaves>();
  let raceOpen = $state(false);
  let optimalOpen = $state(false);
  let optimalRaces = $state<OptimalRaceRecommendation[]>([]);
  let optimalError = $state('');
  let optimalRetry = $state(0);
  let oddsTab = $state('base');
  let inheritanceOpen = $state(false);
  let skillIcons = $state(new Map<string, string>());

  $effect(() => {
    if ((oddsTab !== 'skills' && !inheritanceOpen) || skillIcons.size) return;
    let current = true;
    void loadSkills()
      .then((catalog) => {
        if (!current) return;
        const icons = new Map<string, string>();
        for (const skill of catalog.values())
          if (skill.icon && !icons.has(skill.name)) icons.set(skill.name, skillImage(skill.icon)!);
        skillIcons = icons;
      })
      .catch(() => {
        if (current)
          notify(
            'Skill icons unavailable',
            'warning',
            'The odds remain available. Reopen this tab to retry.'
          );
      });

    return () => {
      current = false;
    };
  });

  let perRun = $state(false);
  let toasts = $state<Toast[]>([]);

  const characterChoices = $derived<CharacterPickerOption[]>(
    tree.selectableCharacters
      .filter((entry) => canPlacePlannerCharacter(tree.nodes, activePosition, Number(entry.id)))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        image: characterImage(entry),
        affinity: plannerCharacterAffinity(
          affinityEngine,
          tree.nodes,
          activePosition,
          Number(entry.id),
          raceGroups
        )
      }))
  );

  const activeNode = $derived(tree.nodes[activePosition]);
  const affinity = $derived(calculatePlannerAffinity(affinityEngine, tree.nodes, raceGroups));
  const flows = $derived(plannerAffinityFlows(affinity));
  const skillSparks = $derived(plannerSkillSparks(tree.nodes));
  const parentWins = $derived(
    JSON.stringify([tree.nodes.p1.winSaddleIds, tree.nodes.p2.winSaddleIds])
  );

  $effect(() => {
    void optimalRetry;
    const [p1, p2]: number[][] = JSON.parse(parentWins);
    optimalRaces = [];
    optimalError = '';
    if (!p1!.length && !p2!.length) return;
    let current = true;
    void loadOptimalRaceRecommendations(p1!, p2!)
      .then((races) => {
        if (current) optimalRaces = races;
      })
      .catch(() => {
        if (current) optimalError = 'Optimal races could not be loaded.';
      });

    return () => {
      current = false;
    };
  });

  const raceHistory = $derived.by(() => {
    const veteran = activeNode.veteran as ProfileVeteran | undefined;
    const succession = activeNode.succession as SuccessionChara | undefined;
    const wins = veteran?.win_saddle_id_array ?? succession?.win_saddle_id_array;
    return Array.isArray(wins) && wins.length
      ? { wins, runs: Array.isArray(veteran?.race_results) ? veteran.race_results : [] }
      : undefined;
  });

  $effect(() => {
    if (factorOptions().length)
      untrack(() => {
        tree.hydrate();
      });
  });

  function notify(title: string, tone: Toast['tone'] = 'info', message?: string): void {
    toasts = [...toasts, { id: `${Date.now()}-${Math.random()}`, title, tone, message }].slice(-4);
  }

  function clearAll(): void {
    tree.clear();
    activePosition = 'target';
    tree.persist();
    notify('Planner cleared');
  }

  function openPicker(position: PlannerPosition, tab = 'characters'): void {
    activePosition = position;
    pickerSort = 'affinity';
    if (tab === 'veterans') parentPickerOpen = true;
    else pickerOpen = true;
  }

  function validatePlacement(id: number): boolean {
    if (canPlacePlannerCharacter(tree.nodes, activePosition, id)) return true;
    notify('This slot cannot use the same character as a conflicting slot.', 'danger');
    return false;
  }

  function selectCharacter(selected: string[]): void {
    const id = Number(selected[0]);
    const entry = tree.selectableCharacters.find((entry) => Number(entry.id) === id);
    if (!entry || !validatePlacement(id)) return;
    tree.placeCharacter(activePosition, entry);
    pickerOpen = false;
  }

  function selectVeteran(veteran: ProfileVeteran): void {
    const currentCharacters = new Map(
      tree.selectableCharacters.map((character) => [Number(character.id), character])
    );

    const id =
      parentCharacter(veteran, currentCharacters).cardId ??
      parentCharacter(veteran, tree.characters).cardId;

    if (id == null || !validatePlacement(id)) return;
    const entry = currentCharacters.get(id) ?? tree.characters.get(id);
    tree.placeVeteran(activePosition, id, entry, veteran);
    pickerOpen = false;
    parentPickerOpen = false;
  }

  function openRaces(position: PlannerPosition): void {
    activePosition = position;
    raceOpen = true;
  }

  onMount(() => {
    try {
      tree.restore((message) => notify(message, 'warning'));
    } catch {
      loadError = 'The saved tree could not be loaded.';
    }

    void tree.loadCharacters();
    let current = true;
    void Promise.all([
      veteranAffinityRepository.load().catch(() => undefined),
      loadG1SaddleGroups().catch(() => {
        if (current) loadError = 'Race data could not be loaded. Reload to retry.';
        return new Map<number, number>();
      })
    ]).then(([affinityData, groups]) => {
      if (!current) return;
      raceGroups = groups;
      if (affinityData) affinityEngine = new VeteranAffinityEngine(affinityData);
    });

    return () => {
      current = false;
      tree.dispose();
    };
  });
</script>

<svelte:head>
  <title>Lineage Planner · uma.moe</title>
  <meta
    name="description"
    content="Plan your full Umamusume inheritance lineage tree and calculate affinity and spark inheritance odds."
  />
</svelte:head>

{#snippet plannerNode(position: PlannerPosition)}
  <LineagePlannerNode
    node={tree.nodes[position]}
    breakdown={plannerAffinityBreakdown(affinity, position)}
    flows={position === 'target' ? flows : null}
    active={activePosition === position && (pickerOpen || parentPickerOpen || raceOpen)}
    {perRun}
    onmodechange={() => (perRun = !perRun)}
    onsparkschange={(sparks) => tree.update(position, { sparks })}
    onclick={() => openPicker(position)}
    onveteran={() => openPicker(position, 'veterans')}
    onraces={() => openRaces(position)}
    onclear={() => tree.clearNode(position)}
  >
    {#if position === 'target' && skillSparks.length}
      <LineageInheritance
        skills={skillSparks}
        {skillIcons}
        bind:open={inheritanceOpen}
      />
    {/if}
  </LineagePlannerNode>
{/snippet}

<AppPage
  routeId="lineage-planner"
  title="Lineage Planner"
  description="Choose your target and build her two parent lineages."
  width="wide"
>
  {#snippet actions()}
    {#if optimalRaces.length}
      <Button
        variant="secondary"
        size="sm"
        icon="trophy"
        onclick={() => (optimalOpen = true)}
      >
        Optimal Races
      </Button>
    {/if}
    <Button
      variant="secondary"
      size="sm"
      onclick={() => savesDialog?.openSaves()}
    >
      Save / Load
    </Button>
    <Button
      variant="secondary"
      size="sm"
      icon="trash"
      disabled={!tree.filledCount}
      onclick={clearAll}
    >
      Clear All
    </Button>
  {/snippet}

  {#if loadError}
    <Banner
      title="Planner data unavailable"
      tone="danger"
    >
      <p>{loadError}</p>
    </Banner>
  {/if}
  {#if optimalError}
    <Banner
      title="Optimal races unavailable"
      tone="danger"
    >
      <p>{optimalError}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => optimalRetry++}
      >
        Retry optimal races
      </Button>
    </Banner>
  {/if}
  <section
    class="planner-shell"
    aria-label="Inheritance tree planner"
  >
    <div class="planner-scroll">
      <div class="planner-content">
        <LineageTree
          nodes={tree.nodes}
          {affinity}
          {flows}
          node={plannerNode}
        />
        <ContentAd routeId="lineage-planner" />
        <LazyContent height={240}>
          <LineageSparkOdds
            nodes={tree.nodes}
            {affinity}
            bind:perRun
            bind:tab={oddsTab}
            {skillIcons}
          />
        </LazyContent>
      </div>
    </div>
  </section>
</AppPage>

{#if pickerOpen}
  <CharacterSelectDialog
    id="lineage-picker"
    bind:open={pickerOpen}
    label={`Character for ${activeNode.label}`}
    options={characterChoices}
    loading={tree.charactersLoading}
    error={tree.charactersError}
    onretry={() => tree.loadCharacters()}
    bind:sort={pickerSort}
    onselect={selectCharacter}
  />
{/if}

{#if parentPickerOpen}
  <ParentPickerDialog
    bind:open={parentPickerOpen}
    targetId={tree.nodes.target.characterId
      ? Math.floor(tree.nodes.target.characterId / 100)
      : undefined}
    sessionScope="lineage-planner"
    onselect={selectVeteran}
  />
{/if}

<LineageSaves
  bind:this={savesDialog}
  nodes={tree.nodes}
  filledCount={tree.filledCount}
  onapply={(payload) => tree.apply(payload)}
  onnotify={notify}
/>

{#if raceOpen}
  {#if raceHistory}
    <RaceResultsDialog
      bind:open={raceOpen}
      charId={activeNode.characterId!}
      charName={activeNode.name ?? activeNode.label}
      charImage={activeNode.image}
      winSaddleIds={raceHistory.wins}
      runRaceIds={raceHistory.runs}
    />
  {:else}
    <RaceWinPickerDialog
      bind:open={raceOpen}
      charName={activeNode.name ?? activeNode.label}
      winSaddleIds={activeNode.winSaddleIds}
      onconfirm={(wins) => tree.update(activePosition, { winSaddleIds: wins })}
    />
  {/if}
{/if}

<ToastRegion
  {toasts}
  ondismiss={(id) => (toasts = toasts.filter((toast) => toast.id !== id))}
/>

{#if optimalOpen}
  <OptimalRacesDialog
    bind:open={optimalOpen}
    recommendations={optimalRaces}
  />
{/if}

<style>
  .planner-shell,
  .planner-scroll,
  .planner-content {
    min-width: 0;
    width: 100%;
  }
  .planner-shell {
    container: lineage-planner / inline-size;
  }
  .planner-content {
    display: grid;
    gap: 14px;
  }
</style>
