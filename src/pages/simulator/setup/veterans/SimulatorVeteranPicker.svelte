<script lang="ts">
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
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
    course?: CourseCatalogEntry;
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
  const multi = $derived(!!onselectMany);
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

  function choose(entry: VeteranEntry) {
    onselect?.(placeVeteran(entry));
    open = false;
  }
  function addSelected() {
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    onselectMany?.(
      selected.flatMap((key) => {
        const entry = byKey.get(key);
        return entry ? [placeVeteran(entry)] : [];
      })
    );
    open = false;
  }
</script>

<Dialog
  bind:open
  title="Choose from Veterans"
  icon="veterans"
  maxWidth="820px"
  maxHeight="88dvh"
>
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
    <p
      class="note bad"
      role="alert"
    >
      {error}
    </p>
  {:else if !entries.length}
    <p class="note">
      {missing
        ? 'None of these Veterans have trained stats, so they can’t race.'
        : 'No Veterans here yet. Upload your game export on the Veterans page.'}
    </p>
  {:else}
    <VeteranList
      {entries}
      course={fitCourse}
      mode={multi ? 'multi' : 'single'}
      bind:selected
      max={room}
      onchoose={choose}
    />
    {#if missing}<p class="note">
        {missing}
        {missing === 1 ? 'record has' : 'records have'} no trained stats and can’t race.
      </p>{/if}
  {/if}
  {#snippet actions()}
    <Button
      href="/veterans"
      variant="ghost"
    >
      Manage veterans
    </Button><Button
      variant="secondary"
      onclick={() => (open = false)}
    >
      {multi ? 'Cancel' : 'Close'}
    </Button>{#if multi}<Button
        icon="add"
        disabled={!selected.length}
        onclick={addSelected}
      >
        {selected.length ? 'Add ' + selected.length + ' to the field' : 'Add to the field'}
      </Button>{/if}
  {/snippet}
</Dialog>

<style>
  .collection {
    max-width: 260px;
    margin-bottom: 8px;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .note.bad {
    color: var(--accent-error);
  }
</style>
