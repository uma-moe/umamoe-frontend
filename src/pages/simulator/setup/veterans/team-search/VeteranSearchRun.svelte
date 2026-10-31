<script lang="ts">
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import SimSection from '../../../shell/SimSection.svelte';
  import type { TeamSearch } from './team-search.svelte';

  /**
   * How long the search runs: races per team, and what that comes to across every team. The run itself starts from the
   * dialog's footer, where its progress shows; failures and errors from a run are listed here.
   */
  interface Props {
    search: TeamSearch;
    samplesFieldId: string;
    samples: string;
    teams: number;
    races: number;
  }

  let { search, samplesFieldId, samples = $bindable(), teams, races }: Props = $props();

  const failedRaces = $derived(
    search.failures + (search.failures === 1 ? ' race failed' : ' races failed')
  );

  /** Beyond this the search takes minutes rather than seconds. */
  const SLOW_RACES = 200000;
</script>

<SimSection
  number={3}
  title="Races"
>
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
      × {teams.toLocaleString('en-US')}
      {teams === 1 ? 'team' : 'teams'} =
      <strong>{races.toLocaleString('en-US')}</strong>
      races
      {#if races > SLOW_RACES}
        <span class="warn">That takes a while. Pick fewer Veterans or races.</span>
      {/if}
    </p>
  </div>
  {#if search.error}
    <div
      class="search-error"
      role="alert"
    >
      <Banner
        title="Team search stopped"
        tone="danger"
        reportable={false}
      >
        <p>{search.error}</p>
      </Banner>
    </div>
  {/if}
  {#if search.failures}
    <div class="failures">
      <Disclosure
        id="{samplesFieldId}-failures"
        compact
        icon="warning"
        title={failedRaces}
        description="Those teams are left out of the ranking."
      >
        {#each search.failedMessages as message}
          <p>{message}</p>
        {/each}
      </Disclosure>
    </div>
  {/if}
</SimSection>

<style>
  .search-error {
    margin-top: 8px;
  }

  .run {
    --control-height: 36px;
    display: flex;
    align-items: end;
    gap: 12px;
  }
  .samples {
    width: 128px;
  }
  .samples :global(label) {
    font-size: 12px;
  }
  .cost {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
    margin: 0 0 9px;
    font-size: 12px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .cost strong {
    font-size: 14px;
    font-weight: 650;
    color: var(--text-primary);
  }
  .warn {
    flex-basis: 100%;
    color: var(--accent-warning);
  }
  .run {
    --control-height: 32px;
    gap: 8px;
  }
  .samples {
    width: 104px;
  }
  .samples :global(label) {
    font-size: 11px;
  }
  .cost {
    margin-bottom: 7px;
    font-size: 11px;
  }
  .cost strong {
    font-size: 13px;
  }
  .failures {
    color: var(--accent-warning);
  }
  .failures p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
