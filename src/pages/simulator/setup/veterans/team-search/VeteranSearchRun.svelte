<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { TeamSearch } from './team-search.svelte';

  interface Props {
    search: TeamSearch;
    samplesFieldId: string;
    samples: string;
    races: number;
    blocked: string;
    onsearch: () => void;
  }

  let { search, samplesFieldId, samples = $bindable(), races, blocked, onsearch }: Props = $props();
</script>

<div class="run">
  <div class="samples">
    <TextField
      id={samplesFieldId}
      label="Races per team"
      type="number"
      min={1}
      max={1000}
      bind:value={samples}
      disabled={search.busy}
    />
  </div>
  <p class="cost">
    <strong>{races.toLocaleString()}</strong>
    races
    {#if races > 200000}<span class="warn">
        · that takes a while; pick fewer Veterans or races
      </span>{/if}
  </p>
  {#if search.busy}
    <Button
      variant="secondary"
      onclick={() => (search.stop = true)}
      disabled={search.stop}
    >
      {search.stop ? 'Stopping…' : 'Stop'}
    </Button>
  {:else}
    <Button
      icon="chart"
      disabled={!!blocked}
      onclick={onsearch}
    >
      Find the best team
    </Button>
  {/if}
</div>
{#if blocked && !search.busy}<p class="blocked">{blocked}</p>{/if}
{#if search.busy || search.completed}
  <div
    class="progress"
    role="status"
  >
    <progress
      max={search.total || 1}
      value={search.completed}
    ></progress>
    <span>
      {search.completed.toLocaleString()} of {search.total.toLocaleString()} races{search.busy
        ? ''
        : search.completed < search.total
          ? ' · stopped'
          : ' · done'}
    </span>
  </div>
{/if}
{#if search.error}<p
    class="note bad"
    role="alert"
  >
    {search.error}
  </p>{/if}
{#if search.failures}
  <details class="failures">
    <summary>
      {search.failures}
      {search.failures === 1 ? 'race' : 'races'} failed; those teams are left out of the ranking
    </summary>
    {#each search.failedMessages as message}<p>{message}</p>{/each}
  </details>
{/if}

<style>
  .run {
    --control-height: 38px;
    display: flex;
    align-items: end;
    gap: 10px;
  }
  .samples {
    width: 120px;
  }
  .samples :global(label) {
    font-size: 12px;
  }
  .cost {
    flex: 1;
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .cost strong {
    color: var(--text-primary);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .warn {
    color: var(--accent-warning);
  }
  .run :global(.ui-button) {
    min-height: 38px;
  }
  .blocked {
    margin: -4px 0 0;
    font-size: 12px;
    color: var(--accent-warning);
    text-align: right;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .progress progress {
    flex: 1;
    height: 8px;
    accent-color: var(--accent-primary);
  }
  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .note.bad {
    color: var(--accent-error);
  }
  .failures {
    font-size: 12px;
    color: var(--accent-warning);
  }
  .failures summary {
    cursor: pointer;
  }
  .failures p {
    margin: 4px 0 0;
    color: var(--text-secondary);
  }
  @media (max-width: 560px) {
    .run {
      flex-wrap: wrap;
    }
    .cost {
      margin-bottom: 12px;
    }
    .run :global(.ui-button) {
      width: 100%;
      min-height: 44px;
    }
  }
</style>
