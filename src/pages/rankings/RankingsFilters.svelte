<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { RankingTab } from '@/pages/clubs/community-types';
  import { months } from './rankings-options';

  interface Props {
    tab: RankingTab;
    search: string;
    month: string;
    year: string;
    alltimeSort: string;
    gainsSort: string;
    years: { value: string; label: string }[];
    onsearch: () => void;
    onfilterchange: () => void;
    onclear: () => void;
  }

  let {
    tab,
    search = $bindable(),
    month = $bindable(),
    year = $bindable(),
    alltimeSort = $bindable(),
    gainsSort = $bindable(),
    years,
    onsearch,
    onfilterchange,
    onclear
  }: Props = $props();
</script>

<section class="filters">
  <div class="search">
    <TextField
      id="ranking-search"
      label="Search trainers or clubs"
      hideLabel
      type="search"
      suffixIcon="search"
      placeholder="Search by Trainer Name, Viewer ID, or Circle Name"
      bind:value={search}
      oninput={onsearch}
    />
  </div>
  <div class="period-filters">
    {#if tab === 'monthly'}
      <SelectField
        id="ranking-month"
        label="Month"
        hideLabel
        prefixIcon="calendar"
        options={months}
        bind:value={month}
        onchange={onfilterchange}
      /><SelectField
        id="ranking-year"
        label="Year"
        hideLabel
        prefixIcon="calendar"
        options={years}
        bind:value={year}
        onchange={onfilterchange}
      />
    {:else if tab === 'alltime'}
      <SelectField
        id="ranking-alltime-sort"
        label="Rank by"
        hideLabel
        prefixIcon="sort"
        options={[
          { value: 'avg_month', label: 'Avg/Month' },
          { value: 'total_fans', label: 'Total Fans' },
          { value: 'total_gain', label: 'Total Gain' },
          { value: 'avg_day', label: 'Avg/Day' },
          { value: 'avg_week', label: 'Avg/Week' }
        ]}
        bind:value={alltimeSort}
        onchange={onfilterchange}
      />
    {:else}
      <SelectField
        id="ranking-gains-sort"
        label="Rank by"
        hideLabel
        prefixIcon="sort"
        options={[
          { value: 'gain_3d', label: '3-Day Gain' },
          { value: 'gain_7d', label: '7-Day Gain' },
          { value: 'gain_30d', label: '30-Day Gain' }
        ]}
        bind:value={gainsSort}
        onchange={onfilterchange}
      />
    {/if}
  </div>
  {#if search}
    <button
      class="clear-filters-btn"
      type="button"
      onclick={onclear}
    >
      <Icon
        name="close"
        size={14}
      />Clear
    </button>
  {/if}
</section>

<style>
  .filters {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }
  .search {
    grid-column: 1/-1;
  }
  .period-filters {
    display: flex;
    gap: 8px;
  }
  .period-filters :global(.field) {
    width: 160px;
  }
  .clear-filters-btn {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: 1px solid var(--clear-filter-border);
    border-radius: 6px;
    background: transparent;
    color: var(--clear-filter-color);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .clear-filters-btn:hover {
    background: rgb(var(--accent-error-rgb) / 0.1);
    border-color: rgb(var(--accent-error-rgb) / 0.3);
    color: var(--accent-error);
  }
  @media (max-width: 768px) {
    .clear-filters-btn {
      min-height: var(--touch-target);
    }
  }
  @media (max-width: 768px) {
    .filters {
      grid-template-columns: minmax(0, 1fr);
    }
    .period-filters {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
    .period-filters :global(.field) {
      width: 100%;
    }
  }
</style>
