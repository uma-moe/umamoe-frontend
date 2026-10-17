<script lang="ts">
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { workspaces } from '@/lib/workspaces/workspace-state';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
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

<section
  class="panel pool"
  aria-label="Your Veterans"
>
  <header>
    <h3>Your Veterans</h3>
    <span class="sub">
      {picked.length} picked ·
      <strong>{teams.toLocaleString('en-US')}</strong>
      {teams === 1 ? 'team' : 'teams'}
    </span>
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
  </header>
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
</section>

<style>
  @import './veteran-search-panel.css';

  .sub {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .sub strong {
    color: var(--text-primary);
  }
  .collection {
    margin-left: auto;
    min-width: 160px;
  }
  .pool-list {
    max-height: min(62dvh, 640px);
    overflow: auto;
    margin: 0 -6px;
    padding: 0 6px;
    scrollbar-gutter: stable;
  }
  .note.bad {
    color: var(--accent-error);
  }
  @media (max-width: 900px) {
    .pool-list {
      max-height: 44dvh;
    }
  }
</style>
