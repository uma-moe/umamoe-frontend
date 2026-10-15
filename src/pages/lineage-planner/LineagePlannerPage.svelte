<script lang="ts">
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import { copyText } from '@/lib/clipboard';
  import { onMount, untrack } from 'svelte';
  import { watchFactorCatalog, factorOptions, factorMetadata } from '@/lib/catalog/factor-catalog';
  import {
    characterImagePath,
    loadCharacterCatalog,
    loadReleasedCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import {
    applyPlannerPayload,
    BTREE_ORDER,
    buildPlannerPayload,
    buildShareState,
    calculatePlannerAffinity,
    decodeShareState,
    emptyPlannerNodes,
    encodeShareState,
    LINEAGE_SAVES_KEY,
    LINEAGE_STORAGE_KEY,
    canPlacePlannerCharacter,
    plannerCharacterAffinity,
    parsePlannerPayload,
    parsePlannerTransfer,
    plannerAffinityBreakdown,
    plannerAffinityFlows,
    plannerSkillSparks,
    type PlannerNode,
    type PlannerPayloadNode,
    type PlannerPosition,
    type PlannerSpark
  } from '@/lib/lineage/planner';
  import { resolveVeteranFactors } from '@/lib/profile/profile-veterans';
  import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
  import { parentCharacter } from '@/lib/veterans/parent-picker';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import RaceWinPickerDialog from '@/components/parent-picker/RaceWinPickerDialog.svelte';
  import RaceResultsDialog from '@/pages/database/results/RaceResultsDialog.svelte';
  import OptimalRacesDialog from '@/pages/database/results/OptimalRacesDialog.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import type { CharacterPickerOption } from '@/components/pickers/picker-types';
  import type { ProfileVeteran, SuccessionChara } from '@/pages/profile/profile-repository';
  import {
    loadG1SaddleGroups,
    loadOptimalRaceRecommendations,
    type OptimalRaceRecommendation
  } from '@/lib/catalog/race-catalog';
  import LineagePlannerNode from './LineagePlannerNode.svelte';
  import LazyContent from '@/components/LazyContent.svelte';
  import LineageSparkOdds from './LineageSparkOdds.svelte';
  import LineageSkillCreation from './LineageSkillCreation.svelte';
  import { loadSkillCatalog, skillImage } from '@/lib/catalog/skill-catalog';

  onMount(watchFactorCatalog);

  const parentBranches = [
    {
      parent: 'p1',
      gps: [
        { gp: 'p1-1', greats: ['p1-1-1', 'p1-1-2'] },
        { gp: 'p1-2', greats: ['p1-2-1', 'p1-2-2'] }
      ]
    },
    {
      parent: 'p2',
      gps: [
        { gp: 'p2-1', greats: ['p2-1-1', 'p2-1-2'] },
        { gp: 'p2-2', greats: ['p2-2-1', 'p2-2-2'] }
      ]
    }
  ] as const;

  let nodes = $state(emptyPlannerNodes());

  const legacyCardIds = new Set<number>();
  let disposed = false;

  let characters = $state(new Map<number, CharacterCatalogEntry>());
  let selectableCharacters = $state<CharacterCatalogEntry[]>([]);
  let charactersLoading = $state(false);
  let charactersError = $state('');
  let affinityEngine = $state<VeteranAffinityEngine>();
  let raceGroups = $state.raw(new Map<number, number>());
  let loadError = $state('');
  let activePosition = $state<PlannerPosition>('target');
  let pickerOpen = $state(false);
  let parentPickerOpen = $state(false);
  let pickerSort = $state<'default' | 'name' | 'affinity'>('affinity');
  let savesOpen = $state(false);
  let saves = $state<Record<string, PlannerPayloadNode[]>>({});
  let saveName = $state('');
  let savesError = $state('');
  let saveAction = $state<{ kind: 'overwrite' | 'delete'; name: string } | null>(null);
  let importInput = $state<HTMLInputElement>();
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
    void loadSkillCatalog()
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
  let expandedGPs = $state(new Set<string>());
  let toasts = $state<Toast[]>([]);

  const characterChoices = $derived<CharacterPickerOption[]>(
    selectableCharacters
      .filter((entry) => canPlacePlannerCharacter(nodes, activePosition, Number(entry.id)))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        image: characterImage(entry),
        affinity: plannerCharacterAffinity(
          affinityEngine,
          nodes,
          activePosition,
          Number(entry.id),
          raceGroups
        )
      }))
  );
  const activeNode = $derived(nodes[activePosition]);
  const affinity = $derived(calculatePlannerAffinity(affinityEngine, nodes, raceGroups));
  const flows = $derived(plannerAffinityFlows(affinity));
  const skillSparks = $derived(plannerSkillSparks(nodes));
  const filledCount = $derived(
    BTREE_ORDER.filter((position) => nodes[position].characterId != null).length
  );
  const parentWins = $derived(JSON.stringify([nodes.p1.winSaddleIds, nodes.p2.winSaddleIds]));

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

  function characterImage(entry: CharacterCatalogEntry | undefined): string | undefined {
    return entry ? characterImagePath(Number(entry.id)) : undefined;
  }

  function characterEntry(id: number | null): [number, CharacterCatalogEntry] | undefined {
    if (id == null) return undefined;
    const exact = characters.get(id);
    if (exact) return [id, exact];
    return [...characters.entries()].find(([cardId]) => Math.floor(cardId / 100) === id);
  }

  function hydrate(
    input: Record<PlannerPosition, PlannerNode>
  ): Record<PlannerPosition, PlannerNode> {
    return Object.fromEntries(
      BTREE_ORDER.map((position) => {
        const node = input[position];
        const resolved = characterEntry(node.characterId);
        const entry = resolved?.[1];
        if (characters.size && node.characterId && legacyCardIds.has(node.characterId) && !entry)
          return [position, emptyPlannerNodes()[position]];
        const sparks = node.sparks.map((spark) => {
          const metadata = factorMetadata(spark.factorId);
          return metadata ? { ...spark, name: metadata.text, type: metadata.type } : spark;
        });
        return [
          position,
          {
            ...node,
            sparks,
            characterId: resolved?.[0] ?? node.characterId,
            name:
              entry?.name ??
              node.name ??
              (node.characterId ? `Character ${node.characterId}` : undefined),
            image: characterImage(entry) ?? node.image
          }
        ];
      })
    ) as Record<PlannerPosition, PlannerNode>;
  }

  $effect(() => {
    if (factorOptions().length)
      untrack(() => {
        nodes = hydrate(nodes);
      });
  });

  function notify(title: string, tone: Toast['tone'] = 'info', message?: string): void {
    toasts = [...toasts, { id: `${Date.now()}-${Math.random()}`, title, tone, message }].slice(-4);
  }

  function readSaves(): boolean {
    savesError = '';
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LINEAGE_SAVES_KEY) ?? '{}');
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        Object.values(parsed).some(
          (payload) => !Array.isArray(payload) || !parsePlannerPayload(payload)
        )
      )
        throw new Error();
      saves = parsed as Record<string, PlannerPayloadNode[]>;
      return true;
    } catch {
      savesError = 'Saved trees could not be read. Your browser data has not been replaced.';
      return false;
    }
  }

  function openSaves(): void {
    saveName = '';
    readSaves();
    savesOpen = true;
  }

  function writeSaves(next: Record<string, PlannerPayloadNode[]>): boolean {
    try {
      localStorage.setItem(LINEAGE_SAVES_KEY, JSON.stringify(next));
      saves = next;
      return true;
    } catch {
      savesError =
        'Changes could not be saved. Browser storage is unavailable or full; your saved trees have not changed.';
      savesOpen = true;
      return false;
    }
  }

  function persist(): void {
    const payload = buildPlannerPayload(nodes);
    try {
      if (payload.length) localStorage.setItem(LINEAGE_STORAGE_KEY, JSON.stringify(payload));
      else localStorage.removeItem(LINEAGE_STORAGE_KEY);
    } catch {
      /* storage can be unavailable */
    }
    const url = new URL(window.location.href);
    const share = buildShareState(nodes);
    if (share) url.searchParams.set('tree', encodeShareState(share));
    else url.searchParams.delete('tree');
    url.searchParams.delete('cards');
    url.searchParams.delete('from');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function updateNode(
    position: PlannerPosition,
    patch: Partial<PlannerNode>,
    shouldPersist = true
  ): void {
    nodes = { ...nodes, [position]: { ...nodes[position], ...patch } };
    if (shouldPersist) persist();
  }

  function applyPayload(payload: PlannerPayloadNode[]): void {
    nodes = hydrate(applyPlannerPayload(payload));
    persist();
  }

  function clearAll(): void {
    nodes = emptyPlannerNodes();
    activePosition = 'target';
    persist();
    notify('Planner cleared');
  }

  function clearNode(position: PlannerPosition): void {
    nodes = { ...nodes, [position]: emptyPlannerNodes()[position] };
    persist();
  }

  function openPicker(position: PlannerPosition, tab = 'characters'): void {
    activePosition = position;
    pickerSort = 'affinity';
    if (tab === 'veterans') parentPickerOpen = true;
    else pickerOpen = true;
  }

  function validatePlacement(id: number): boolean {
    if (canPlacePlannerCharacter(nodes, activePosition, id)) return true;
    notify('This slot cannot use the same character as a conflicting slot.', 'danger');
    return false;
  }

  async function loadSelectableCharacters(): Promise<void> {
    if (charactersLoading) return;
    charactersLoading = true;
    charactersError = '';
    try {
      selectableCharacters = await loadReleasedCharacterCatalog();
      characters = await loadCharacterCatalog();
      if (disposed) return;
      nodes = hydrate(nodes);
      if (legacyCardIds.size) {
        legacyCardIds.clear();
        persist();
      }
    } catch (error) {
      charactersError =
        error instanceof Error ? error.message : 'The character catalog could not be loaded.';
    } finally {
      charactersLoading = false;
    }
  }

  function selectCharacter(selected: string[]): void {
    const id = Number(selected[0]);
    const entry = selectableCharacters.find((entry) => Number(entry.id) === id);
    if (!entry || !validatePlacement(id)) return;
    updateNode(activePosition, {
      characterId: id,
      name: entry.name,
      image: characterImage(entry),
      sparks: [],
      winSaddleIds: [],
      veteran: undefined,
      succession: undefined
    });
    pickerOpen = false;
  }

  function sparksFrom(source: ProfileVeteran | SuccessionChara): PlannerSpark[] {
    const resolved = resolveVeteranFactors(source);
    return resolved.map((factor) => ({
      factorId: factor.id,
      name: factor.name,
      type: factor.type,
      level: factor.level
    }));
  }

  function successionMap(parent: PlannerPosition): Partial<Record<number, PlannerPosition>> {
    if (parent === 'target')
      return { 10: 'p1', 20: 'p2', 11: 'p1-1', 12: 'p1-2', 21: 'p2-1', 22: 'p2-2' };
    if (parent === 'p1')
      return { 10: 'p1-1', 20: 'p1-2', 11: 'p1-1-1', 12: 'p1-1-2', 21: 'p1-2-1', 22: 'p1-2-2' };
    if (parent === 'p2')
      return { 10: 'p2-1', 20: 'p2-2', 11: 'p2-1-1', 12: 'p2-1-2', 21: 'p2-2-1', 22: 'p2-2-2' };
    if (parent === 'p1-1') return { 10: 'p1-1-1', 20: 'p1-1-2' };
    if (parent === 'p1-2') return { 10: 'p1-2-1', 20: 'p1-2-2' };
    if (parent === 'p2-1') return { 10: 'p2-1-1', 20: 'p2-1-2' };
    if (parent === 'p2-2') return { 10: 'p2-2-1', 20: 'p2-2-2' };
    return {};
  }

  function applySuccession(parent: PlannerPosition, succession: SuccessionChara[]): void {
    const mapping = successionMap(parent);
    const next = { ...nodes };
    for (const item of succession) {
      const position = mapping[item.position_id];
      if (!position) continue;
      const entry = characters.get(item.card_id);
      next[position] = {
        ...next[position],
        characterId: item.card_id,
        name: entry?.name ?? `Character ${item.card_id}`,
        image: characterImage(entry),
        sparks: sparksFrom(item),
        winSaddleIds: item.win_saddle_id_array ?? [],
        succession: item,
        veteran: undefined
      };
    }
    nodes = next;
  }

  function selectVeteran(veteran: ProfileVeteran): void {
    const currentCharacters = new Map(
      selectableCharacters.map((character) => [Number(character.id), character])
    );
    const id =
      parentCharacter(veteran, currentCharacters).cardId ??
      parentCharacter(veteran, characters).cardId;
    if (id == null || !validatePlacement(id)) return;
    const entry = currentCharacters.get(id) ?? characters.get(id);
    updateNode(
      activePosition,
      {
        characterId: id,
        name: entry?.name ?? `Character ${id}`,
        image: characterImage(entry),
        sparks: sparksFrom(veteran),
        winSaddleIds: veteran.win_saddle_id_array ?? veteran.race_results ?? [],
        veteran,
        succession: undefined
      },
      false
    );
    applySuccession(activePosition, veteran.succession_chara_array ?? []);
    persist();
    pickerOpen = false;
    parentPickerOpen = false;
  }

  function openRaces(position: PlannerPosition): void {
    activePosition = position;
    raceOpen = true;
  }

  function toggleGreats(position: string): void {
    const next = new Set(expandedGPs);
    next.has(position) ? next.delete(position) : next.add(position);
    expandedGPs = next;
  }

  function saveCurrent(): void {
    const name = saveName.trim();
    const payload = buildPlannerPayload(nodes);
    if (!name || !payload.length) return;
    if (!readSaves()) return;
    if (Object.hasOwn(saves, name)) {
      savesOpen = false;
      saveAction = { kind: 'overwrite', name };
      return;
    }
    if (writeSaves({ ...saves, [name]: payload })) {
      savesOpen = false;
      saveName = '';
      notify(`Saved “${name}”`, 'success');
    }
  }

  function loadSave(name: string): void {
    if (!readSaves()) return;
    const payload = Object.hasOwn(saves, name) ? parsePlannerPayload(saves[name]) : null;
    if (!payload) {
      savesError = `Save “${name}” could not be loaded. The current tree has not changed.`;
      return;
    }
    applyPayload(payload);
    savesOpen = false;
    notify(`Loaded “${name}”`, 'success');
  }

  function confirmSaveAction(): void {
    const action = saveAction;
    saveAction = null;
    if (!action) return;
    if (!readSaves()) {
      savesOpen = true;
      return;
    }
    const next =
      action.kind === 'overwrite'
        ? { ...saves, [action.name]: buildPlannerPayload(nodes) }
        : { ...saves };
    if (action.kind === 'delete') delete next[action.name];
    if (!writeSaves(next)) return;
    notify(`${action.kind === 'delete' ? 'Deleted' : 'Saved'} “${action.name}”`, 'success');
    if (action.kind === 'delete') openSaves();
    else saveName = '';
  }

  function cancelSaveAction(): void {
    saveAction = null;
    openSaves();
  }

  function exportText(): string | null {
    const payload = buildPlannerPayload(nodes);
    return payload.length
      ? JSON.stringify(
          { version: 1, type: 'lineage-planner', exportedAt: new Date().toISOString(), payload },
          null,
          2
        )
      : null;
  }

  async function copyTree(): Promise<void> {
    savesOpen = false;
    const value = exportText();
    if (!value) return notify('Nothing to export', 'warning');
    if (await copyText(value)) notify('Copied tree to clipboard', 'success');
    else notify('Clipboard access was blocked', 'danger', 'Use “Download .json” instead.');
  }

  async function importClipboard(): Promise<void> {
    savesOpen = false;
    try {
      importRaw(await navigator.clipboard.readText());
    } catch {
      notify('Clipboard access was blocked', 'danger', 'Use “Import .json” instead.');
    }
  }

  function downloadTree(): void {
    const value = exportText();
    if (!value) return notify('Nothing to export', 'warning');
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    const anchor = document.createElement('a');
    savesOpen = false;
    anchor.href = url;
    anchor.download = `lineage-tree-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importRaw(raw: string): void {
    try {
      const payload = parsePlannerPayload(JSON.parse(raw));
      if (!payload) throw new Error();
      applyPayload(payload);
      savesOpen = false;
      notify('Imported tree', 'success');
    } catch {
      notify(
        'Invalid tree data',
        'danger',
        'The file does not contain a compatible lineage planner payload.'
      );
    }
  }

  async function importFiles(files: FileList | null): Promise<void> {
    const file = files?.item(0);
    if (!file) return;
    savesOpen = false;
    try {
      importRaw(await file.text());
    } catch {
      notify(
        'Failed to read file',
        'danger',
        'The current tree has not changed. Try importing the file again.'
      );
    }
  }

  function restoreTree(): void {
    try {
      const query = new URLSearchParams(location.search);
      let payload: PlannerPayloadNode[] | null = null;
      const shared = query.get('tree');
      if (shared) {
        payload = decodeShareState(shared);
        if (!payload) notify('Invalid lineage planner URL state.', 'warning');
      }
      const from = query.get('from');
      if (!payload && (from === 'db' || from === 'profile')) {
        let rawTransfer: unknown = null;
        try {
          rawTransfer = JSON.parse(localStorage.getItem('planner_transfer') ?? 'null');
        } catch {
          rawTransfer = null;
        } finally {
          try {
            localStorage.removeItem('planner_transfer');
          } catch {
            /* legacy one-shot storage may be unavailable */
          }
        }
        payload =
          parsePlannerTransfer(rawTransfer, from === 'profile' ? 'profile' : 'database')?.payload ??
          null;
      }
      if (!payload && from !== 'db' && from !== 'profile') {
        const cards = query.get('cards');
        if (cards) {
          const ids = cards.split(',').map((value) => parseInt(value, 10));
          if (ids.length < 5) return;
          const initial = emptyPlannerNodes();
          ids.slice(0, BTREE_ORDER.length).forEach((id, index) => {
            const position = BTREE_ORDER[index];
            const entry = id ? characterEntry(id) : undefined;
            if (position && Number.isSafeInteger(id) && id > 0 && (entry || !characters.size)) {
              initial[position].characterId = entry?.[0] ?? id;
              legacyCardIds.add(id);
            }
          });
          payload = buildPlannerPayload(initial);
        }
      }
      if (!payload) {
        try {
          payload = parsePlannerPayload(
            JSON.parse(localStorage.getItem(LINEAGE_STORAGE_KEY) ?? 'null')
          );
        } catch {
          payload = null;
        }
      }
      if (payload) {
        nodes = hydrate(applyPlannerPayload(payload));
        persist();
      }
    } catch {
      loadError = 'The saved tree could not be loaded.';
    }
  }

  onMount(() => {
    restoreTree();
    void loadSelectableCharacters();
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
      disposed = true;
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
    node={nodes[position]}
    breakdown={plannerAffinityBreakdown(affinity, position)}
    flows={position === 'target' ? flows : null}
    active={activePosition === position && (pickerOpen || parentPickerOpen || raceOpen)}
    {perRun}
    onmodechange={() => (perRun = !perRun)}
    onsparkschange={(sparks) => updateNode(position, { sparks })}
    onclick={() => openPicker(position)}
    onveteran={() => openPicker(position, 'veterans')}
    onraces={() => openRaces(position)}
    onclear={() => clearNode(position)}
  >
    {#if position === 'target' && skillSparks.length}
      <div class="inheritance">
        <InspectPopover
          label="Potential Inheritance"
          onopenchange={(open) => (inheritanceOpen = open)}
        >
          {#snippet trigger()}
            <span class="inheritance-trigger">
              <Icon
                name="star"
                size={14}
              />Potential Inheritance ({skillSparks.length})
            </span>
          {/snippet}
          <header class="inheritance-header">
            <Icon
              name="star"
              size={14}
            />
            <strong>Potential Inheritance</strong>
            <small>When skill is learned during training</small>
          </header>
          <LineageSkillCreation
            skills={skillSparks}
            {skillIcons}
            compact
          />
        </InspectPopover>
      </div>
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
      onclick={openSaves}
    >
      Save / Load
    </Button>
    <Button
      variant="secondary"
      size="sm"
      icon="trash"
      disabled={!filledCount}
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
        <div class="tree-canvas">
          <div class="target-row">
            <div class="root-node">{@render plannerNode('target')}</div>
            {#if !nodes.p1.characterId || !nodes.p2.characterId}
              <p class="planner-guide">
                Pick a veteran to import their lineage, or choose an Uma to plan your own.
              </p>
            {/if}
          </div>
          <div
            class="parent-connections"
            aria-label="Affinity flowing to target"
          >
            <span
              class="target-arrow"
              aria-hidden="true"
            ></span>
            {#each parentBranches as branch, branchIndex}
              <div class="parent-flow">
                <span
                  class="flow-value"
                  aria-label={`Parent ${branchIndex + 1} contribution to target`}
                >
                  <span>P{branchIndex + 1}</span>
                  <Icon
                    name="heart"
                    size={12}
                  />
                  <b>{flows ? (branch.parent === 'p1' ? flows.p1 : flows.p2) : '-'}</b>
                </span>
              </div>
            {/each}
            <span
              class="shared-flow"
              title="Shared parent affinity and race bonus, counted once in the target total."
              aria-label="Shared contribution to target"
            >
              <Icon
                name="connect"
                size={13}
              />Shared
              <b>{flows?.shared ?? '-'}</b>
            </span>
          </div>
          <div class="parents">
            {#each parentBranches as branch, branchIndex}
              <section
                class="parent-branch"
                aria-label={`Parent ${branchIndex + 1} lineage`}
              >
                <header class="branch-heading">
                  <div>
                    <span class="branch-number">P{branchIndex + 1}</span>
                    <h2>Parent {branchIndex + 1} lineage</h2>
                  </div>
                  <span class="branch-affinity">
                    <span aria-hidden="true">↑</span>
                    <small>Target</small>
                    <Icon
                      name="heart"
                      size={14}
                    />{flows ? (branch.parent === 'p1' ? flows.p1 : flows.p2) : '-'}
                  </span>
                </header>
                <LazyContent
                  height={380}
                  eager={branchIndex === 0}
                >
                  <div class="branch-node">{@render plannerNode(branch.parent)}</div>
                  <div class="grandparents">
                    <LazyContent height={220}>
                      {#each branch.gps as item}
                        {@const contribution = plannerAffinityBreakdown(affinity, item.gp)}
                        <section class="gp-branch">
                          <span
                            class="gp-flow"
                            aria-label={`${nodes[item.gp].label} affinity connection`}
                            title={contribution
                              ? `${contribution.base} base + ${contribution.race} race bonus`
                              : 'Choose this lineage to calculate affinity'}
                          >
                            <span aria-hidden="true">↑</span>
                            <Icon
                              name="heart"
                              size={11}
                            />
                            <b>{contribution?.total ?? '-'}</b>
                          </span>
                          <div class="branch-node">{@render plannerNode(item.gp)}</div>
                          <button
                            class="great-toggle"
                            class:expanded={expandedGPs.has(item.gp)}
                            aria-label="Great-Grandparents"
                            aria-expanded={expandedGPs.has(item.gp)}
                            aria-controls={'greats-' + item.gp}
                            onclick={() => toggleGreats(item.gp)}
                          >
                            <Icon
                              name="lineage"
                              size={13}
                            />Great-grandparents
                            <span>
                              {item.greats.filter((position) => nodes[position].characterId)
                                .length}/2
                            </span>
                            <Icon
                              name="chevron"
                              size={13}
                            />
                          </button>
                          <div
                            class="greats"
                            id={'greats-' + item.gp}
                            hidden={!expandedGPs.has(item.gp)}
                          >
                            {#if expandedGPs.has(item.gp)}
                              {#each item.greats as position}
                                {@render plannerNode(position)}
                              {/each}
                            {/if}
                          </div>
                        </section>
                      {/each}
                    </LazyContent>
                  </div>
                </LazyContent>
              </section>
            {/each}
          </div>
        </div>
        <ContentAd routeId="lineage-planner" />
        <LazyContent height={240}>
          <LineageSparkOdds
            {nodes}
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
    loading={charactersLoading}
    error={charactersError}
    onretry={loadSelectableCharacters}
    bind:sort={pickerSort}
    onselect={selectCharacter}
  />
{/if}

{#if parentPickerOpen}
  <ParentPickerDialog
    bind:open={parentPickerOpen}
    targetId={nodes.target.characterId ? Math.floor(nodes.target.characterId / 100) : undefined}
    sessionScope="lineage-planner"
    onselect={selectVeteran}
  />
{/if}

{#if savesOpen}
  <div class="lineage-saves-surface">
    <Dialog
      id="lineage-saves"
      bind:open={savesOpen}
      title="Lineage Trees"
      icon="lineage"
      maxWidth="560px"
      maxHeight="85dvh"
      mobileInset="16px"
      contentPadding="16px"
      mobileContentPadding="16px"
    >
      <div class="saves-dialog">
        {#if savesError}
          <Banner
            tone="danger"
            title="Saved trees unavailable"
          >
            <p>{savesError}</p>
            <Button
              variant="secondary"
              size="sm"
              onclick={readSaves}
            >
              Retry saved trees
            </Button>
          </Banner>
        {/if}
        <section aria-labelledby="lineage-save-heading">
          <h3 id="lineage-save-heading">
            <Icon
              name="save"
              size={14}
            />Save current tree
          </h3>
          <form
            class="save-row"
            onsubmit={(event) => {
              event.preventDefault();
              saveCurrent();
            }}
          >
            <TextField
              id="lineage-save-name"
              label="Tree name"
              hideLabel
              placeholder="Tree name"
              maxlength={60}
              bind:value={saveName}
            />
            <Button
              type="submit"
              size="sm"
              icon="save"
              disabled={!saveName.trim() || !filledCount || Boolean(savesError)}
            >
              Save
            </Button>
          </form>
          {#if !filledCount}
            <p class="save-hint">Tree is empty - nothing to save yet.</p>
          {/if}
          {#if Object.hasOwn(saves, saveName.trim())}
            <p class="save-hint">A save with this name already exists. It will be overwritten.</p>
          {/if}
        </section>
        <section aria-labelledby="lineage-saved-heading">
          <h3 id="lineage-saved-heading">
            <Icon
              name="folder-open"
              size={14}
            />Saved trees ({Object.keys(saves).length})
          </h3>
          {#if !savesError}
            <div class="save-list">
              {#each Object.entries(saves).sort( ([a], [b]) => a.localeCompare(b) ) as [name, payload]}
                <div class="save-item">
                  <Button
                    variant="ghost"
                    size="sm"
                    ariaLabel={`Load ${name}`}
                    onclick={() => loadSave(name)}
                  >
                    <span class="save-meta">
                      <Icon
                        name="lineage"
                        size={18}
                      />
                      <span>
                        <strong>{name}</strong>
                        <small>{payload.length} node{payload.length === 1 ? '' : 's'}</small>
                      </span>
                    </span>
                  </Button>
                  <IconButton
                    icon="trash"
                    label={`Delete ${name}`}
                    size="sm"
                    onclick={() => {
                      savesOpen = false;
                      saveAction = { kind: 'delete', name };
                    }}
                  />
                </div>
              {:else}
                <p class="saves-empty">No saved trees yet.</p>
              {/each}
            </div>
          {/if}
        </section>
        <section aria-labelledby="lineage-transfer-heading">
          <h3 id="lineage-transfer-heading">
            <Icon
              name="share"
              size={14}
            />Share &amp; transfer
          </h3>
          <div class="transfer-actions">
            <Button
              variant="secondary"
              disabled={!filledCount}
              onclick={copyTree}
            >
              <span class="transfer-content">
                <Icon
                  name="copy"
                  size={18}
                />
                <strong>Copy share string</strong>
                <small>Send via chat or notes</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              disabled={!filledCount}
              onclick={downloadTree}
            >
              <span class="transfer-content">
                <Icon
                  name="download"
                  size={18}
                />
                <strong>Download .json</strong>
                <small>Save as a file</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              onclick={importClipboard}
            >
              <span class="transfer-content">
                <Icon
                  name="clipboard"
                  size={18}
                />
                <strong>Paste share string</strong>
                <small>Replaces current tree</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              onclick={() => {
                if (importInput) {
                  importInput.value = '';
                  importInput.click();
                }
              }}
            >
              <span class="transfer-content">
                <Icon
                  name="upload"
                  size={18}
                />
                <strong>Import .json</strong>
                <small>Load a file</small>
              </span>
            </Button>
          </div>
          <input
            bind:this={importInput}
            type="file"
            aria-label="Import lineage tree"
            accept=".json,application/json"
            hidden
            onchange={(event) => importFiles(event.currentTarget.files)}
          />
        </section>
      </div>
    </Dialog>
  </div>
{/if}

{#if saveAction}
  <Dialog
    id="lineage-save-confirm"
    open
    title={saveAction.kind === 'delete' ? 'Delete saved tree?' : 'Overwrite save?'}
    maxWidth="420px"
    mobileInset="16px"
    onclose={cancelSaveAction}
  >
    <p class="confirmation-message">
      {saveAction.kind === 'delete'
        ? `“${saveAction.name}” will be permanently removed from your browser.`
        : `A saved tree named “${saveAction.name}” already exists. Replace it with the current tree?`}
    </p>
    {#snippet actions()}
      <Button
        variant="secondary"
        onclick={cancelSaveAction}
      >
        Cancel
      </Button>
      <Button
        variant={saveAction?.kind === 'delete' ? 'danger' : 'primary'}
        onclick={confirmSaveAction}
      >
        {saveAction?.kind === 'delete' ? 'Delete' : 'Overwrite'}
      </Button>
    {/snippet}
  </Dialog>
{/if}

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
      onconfirm={(wins) => updateNode(activePosition, { winSaddleIds: wins })}
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
  @import './lineage-planner-page.css';
</style>
