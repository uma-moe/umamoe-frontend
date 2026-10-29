<script lang="ts">
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { workspaces } from '@/lib/workspaces/workspace-state';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import SimSection from '../../../shell/SimSection.svelte';
  import VeteranList from '../VeteranList.svelte';
  import type { VeteranEntry } from '../veteran-entries';

  interface Props {
    accountFieldId: string;
    accountId: string;
    entries: VeteranEntry[];
    picked: string[];
    loading: boolean;
    error: string;
    teams: number;
    course?: RaceCourse;
    disabled: boolean;
  }

  let {
    accountFieldId,
    accountId = $bindable(),
    entries,
    picked = $bindable(),
    loading,
    error,
    teams,
    course,
    disabled
  }: Props = $props();
</script>

<SimSection
  number={1}
  title="Your Veterans"
  note="{picked.length} picked · {teams.toLocaleString('en-US')} {teams === 1 ? 'team' : 'teams'}"
>
  {#snippet actions()}
    {#if $workspaces.length > 1}
      <div class="collection">
        <SelectFieldSlim
          id={accountFieldId}
          label="Collection"
          hideLabel
          value={accountId}
          {disabled}
          onchange={(value) => (accountId = value)}
          options={$workspaces.map((workspace) => ({
            value: workspace.accountId ?? '',
            label: workspace.label
          }))}
        />
      </div>
    {/if}
  {/snippet}
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
      No Veterans with trained stats here yet.
      <a href="/veterans">Upload your game export</a>
      to race them.
    </p>
  {:else}
    <div class="pool-list">
      <VeteranList
        {entries}
        {course}
        mode="multi"
        compact
        bind:selected={picked}
      />
    </div>
  {/if}
</SimSection>

<style>
  @import './veteran-search-panel.css';

  .note.bad {
    color: var(--accent-error);
  }

  .collection {
    min-width: 160px;
  }
  /* The list scrolls inside the column, its search and filters held at the top. */
  .pool-list {
    --veteran-list-sticky-top: 0;
    max-height: min(40dvh, 360px);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
</style>
