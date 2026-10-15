<script lang="ts">
  import type { ActivitySort } from '@/lib/activity/activity-types';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { dayOptions, scoreOptions, sortOptions } from './activity-query';

  interface Props {
    search: string;
    committedSearch: string;
    sortBy: ActivitySort;
    minDays: string;
    minScore: string;
    onsearch: () => void;
    onapply: () => void;
    onclear: () => void;
  }

  let {
    search = $bindable(),
    committedSearch,
    sortBy = $bindable(),
    minDays = $bindable(),
    minScore = $bindable(),
    onsearch,
    onapply,
    onclear
  }: Props = $props();
</script>

<section class="filters">
  <TextField
    id="activity-search"
    label="Search by Trainer Name or Viewer ID"
    hideLabel
    prefixIcon="search"
    type="search"
    placeholder="Search by Trainer Name or Viewer ID"
    bind:value={search}
    oninput={onsearch}
  />
  <div>
    <SelectField
      id="activity-sort"
      label="Sort by"
      prefixIcon="sort"
      hideLabel
      options={sortOptions}
      bind:value={sortBy}
      onchange={onapply}
    /><SelectField
      id="activity-days"
      label="Minimum observed"
      prefixIcon="calendar"
      hideLabel
      options={dayOptions}
      bind:value={minDays}
      onchange={onapply}
    /><SelectField
      id="activity-score"
      label="Minimum score"
      prefixIcon="gauge"
      hideLabel
      options={scoreOptions}
      bind:value={minScore}
      onchange={onapply}
    />{#if committedSearch || sortBy !== 'score' || minDays !== '1' || minScore !== '0'}
      <Button
        variant="ghost"
        icon="close"
        onclick={onclear}
      >
        Clear
      </Button>
    {/if}
  </div>
</section>

<style>
  .filters {
    display: grid;
    gap: 10px;
  }
  .filters > div {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .filters > div > :global(*) {
    width: 190px;
  }
  .filters > div > :global(*:first-child) {
    width: 230px;
  }
  @media (max-width: 680px) {
    .filters {
      padding: 0;
    }
    .filters > div {
      display: grid;
      grid-template-columns: 1fr;
    }
    .filters > div > :global(*),
    .filters > div > :global(*:first-child) {
      width: 100%;
    }
  }
</style>
