<script lang="ts">
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import { describeCourse, trackName, type RaceCourse } from '@/lib/game-data/racing/courses';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import DialogStatus from '../../shell/DialogStatus.svelte';
  import SimulatorRunnerFace from '../../reports/SimulatorRunnerFace.svelte';
  import type { SimulatorUma } from '../../simulator-uma';
  import { selectedCourse } from '../../simulator-session.svelte';
  import VeteranList from './VeteranList.svelte';
  import { loadVeteranEntries, placeVeteran, type VeteranEntry } from './veteran-entries';

  /**
   * Choose from Veterans: one build for a single runner, or several ticked at once when the page takes more (the race
   * field). Sorted by how well each one suits the course, with her stats and course aptitudes beside her name.
   */
  let {
    open = $bindable(false),
    course,
    onselect,
    onselectMany,
    room = 18
  }: {
    open?: boolean;
    course?: RaceCourse;
    onselect?: (uma: SimulatorUma) => void;
    /** Takes several at once; the dialog then ticks instead of choosing on click. */
    onselectMany?: (umas: SimulatorUma[]) => void;
    /** How many the page can still take. */
    room?: number;
  } = $props();

  const uid = $props.id();
  let accountId = $state(''),
    error = $state(''),
    loading = $state(false),
    missing = $state(0),
    selected = $state<string[]>([]);

  let entries = $state.raw<VeteranEntry[]>([]);
  const multi = $derived(Boolean(onselectMany));
  const ticked = $derived.by(() => {
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    return selected.flatMap((key) => byKey.get(key) ?? []);
  });
  const fitCourse = $derived(course ?? selectedCourse());

  $effect(() => {
    if (open) {
      accountId = $activeWorkspace.accountId ?? '';
      selected = [];
    }
  });

  $effect(() => {
    if (!open || !$authReady) return;
    const id = accountId;
    $authUser;
    let active = true;
    loading = true;
    error = '';
    void loadVeteranEntries(id)
      .then((result) => {
        if (!active) return;
        entries = result.entries;
        missing = result.missing;
      })
      .catch((reason) => {
        if (active) error = reason instanceof Error ? reason.message : 'Couldn’t load Veterans.';
      })
      .finally(() => {
        if (active) loading = false;
      });

    return () => {
      active = false;
    };
  });

  /** How many more runners the field takes once the ticked ones are in. */
  const roomLine = $derived.by(() => {
    const left = room - ticked.length;
    const runners = left === 1 ? ' runner' : ' runners';
    return ticked.length ? left + runners + ' left in the field' : 'Room for ' + room + runners;
  });

  function choose(entry: VeteranEntry) {
    onselect?.(placeVeteran(entry));
    open = false;
  }

  function addSelected() {
    onselectMany?.(ticked.map(placeVeteran));
    open = false;
  }
</script>

<Dialog
  bind:open
  title="Choose from Veterans"
  description={fitCourse
    ? 'Best suited to ' +
      trackName(fitCourse.race_track_id) +
      ' · ' +
      describeCourse(fitCourse) +
      ' first'
    : undefined}
  icon="veterans"
  maxWidth="860px"
  maxHeight="88dvh"
  height={entries.length > 8 ? 'min(760px, 88dvh)' : undefined}
  mobileFill
  compact
  mobileMaxHeight="96dvh"
>
  {#snippet headerActions()}
    <span class="manage">
      <Button
        href="/veterans"
        variant="ghost"
        size="sm"
        icon="veterans"
      >
        Manage veterans
      </Button>
    </span>
  {/snippet}
  {#if $workspaces.length > 1}
    <div class="collection">
      <SelectFieldSlim
        id="{uid}-account"
        label="Collection"
        value={accountId}
        onchange={(value) => (accountId = value)}
        options={$workspaces.map((workspace) => ({
          value: workspace.accountId ?? '',
          label: workspace.label
        }))}
      />
    </div>
  {/if}
  {#if loading}
    <Spinner
      centered
      label="Loading Veterans…"
    />
  {:else if error}
    <div
      class="state"
      role="alert"
    >
      <strong>Couldn’t load your Veterans</strong>
      <p class="bad">{error}</p>
    </div>
  {:else if !entries.length}
    <div class="state">
      <Icon
        name="veterans"
        size={28}
      />
      <strong>{missing ? 'No Veterans can race yet' : 'No Veterans here yet'}</strong>
      <p>
        {missing
          ? 'None of these Veterans have trained stats, so they can’t race. Records from a game export have them.'
          : 'Upload your game export on the Veterans page, and every trained Uma can race here.'}
      </p>
      <Button
        href="/veterans"
        variant="secondary"
        size="sm"
      >
        Go to Veterans
      </Button>
    </div>
  {:else}
    <VeteranList
      {entries}
      course={fitCourse}
      mode={multi ? 'multi' : 'single'}
      bind:selected
      max={room}
      onchoose={choose}
    />
    {#if missing}
      <p class="note">
        {missing}
        {missing === 1 ? 'record has' : 'records have'} no trained stats and can’t race.
      </p>
    {/if}
  {/if}
  {#snippet actions()}
    <DialogStatus>
      {#if multi}
        {#if ticked.length}
          <span
            class="faces"
            aria-hidden="true"
          >
            {#each ticked.slice(0, 6) as entry (entry.key)}
              <SimulatorRunnerFace
                cardId={entry.uma.cardId}
                size={24}
              />
            {/each}
          </span>
          <strong>{ticked.length} ticked</strong>
        {/if}
        {#if room <= 0}
          <span class="blocked">The race field is full.</span>
        {:else}
          <span>{roomLine}</span>
        {/if}
      {:else if entries.length}
        <span>Choose one to use her build.</span>
      {/if}
    </DialogStatus>
    <Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      {multi ? 'Cancel' : 'Close'}
    </Button>
    {#if multi}
      <Button
        icon="add"
        disabled={!selected.length}
        onclick={addSelected}
      >
        {selected.length ? 'Add ' + selected.length + ' to the field' : 'Add to the field'}
      </Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .manage {
    display: flex;
    flex: none;
    white-space: nowrap;
  }
  /* A phone: the link keeps its name for assistive tech and shows only its icon. */
  @media (max-width: 520px) {
    .manage :global(.ui-button > span) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .collection {
    max-width: 260px;
    margin-bottom: 8px;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  /* Nothing to list yet: what is missing and where to fix it, in the middle of the dialog. */
  .state {
    display: grid;
    justify-items: center;
    gap: 6px;
    max-width: 46ch;
    margin: 0 auto;
    padding: 32px 12px;
    color: var(--text-secondary);
    text-align: center;
  }
  .state strong {
    font-size: 14px;
    font-weight: 650;
    color: var(--text-primary);
  }
  .state p {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.5;
  }
  .state .bad {
    color: var(--accent-error);
  }
  .faces {
    display: inline-flex;
  }
  .faces > :global(*) {
    margin-left: -6px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--dialog-surface-bg);
  }
  .faces > :global(:first-child) {
    margin-left: 0;
  }
</style>
