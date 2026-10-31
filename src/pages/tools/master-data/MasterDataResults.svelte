<script lang="ts">
  import type { SqlValue } from 'sql.js';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import { downloadResult, type ExportFormat } from './master-data-export';
  import {
    columnPosition,
    matchingRows,
    resultColumns,
    resultRows,
    rowSearchText,
    tablesWithColumn,
    timestampLabel
  } from './master-data-results';
  import type { MasterTable, QueryResult } from './master-data-types';

  interface Props {
    result: QueryResult | undefined;
    tables: MasterTable[];
    activeTable: string;
    filter: string;
    /** Work that will replace the rows on screen. */
    pending: 'opening' | 'querying' | undefined;
    error: string;
    onbrowse: (table: string) => void;
  }

  let {
    result,
    tables,
    activeTable,
    filter = $bindable(),
    pending,
    error,
    onbrowse
  }: Props = $props();

  let crossReference = $state('');

  const rowCount = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const pendingMessages = {
    opening: 'Opening the database…',
    querying: 'Running query…'
  } as const;

  const columns = $derived(result ? resultColumns(result) : []);
  const rows = $derived(result ? resultRows(result) : []);
  const searchText = $derived(result ? rowSearchText(result) : []);
  const shown = $derived(matchingRows(rows, searchText, filter));
  const references = $derived(crossReference ? tablesWithColumn(tables, crossReference) : []);

  const summary = $derived.by(() => {
    if (pending) return pendingMessages[pending];
    if (!result) return '';

    const total = rows.length.toLocaleString();
    const count = filter.trim()
      ? `${shown.length.toLocaleString()} of ${total} rows`
      : `${total} rows`;
    const limit = result.truncated ? ', stopped at the row limit' : '';
    return `${count} in ${result.elapsedMs} ms${limit}`;
  });

  function cellValue(row: Record<string, string | number>, column: TableColumn): SqlValue {
    const index = row.index;
    if (typeof index !== 'number') return null;
    return result?.values[index]?.[columnPosition(column.key)] ?? null;
  }

  function download(format: ExportFormat) {
    if (!result) return;

    const values = shown.map((row) => result.values[row.index] ?? []);
    downloadResult(result.columns, values, format);
  }

  function toggleReferences(column: string) {
    crossReference = crossReference === column ? '' : column;
  }
</script>

<section
  class="results"
  aria-labelledby="master-results-heading"
  aria-busy={pending !== undefined}
>
  <header class="results-heading">
    <div class="results-title">
      <h2 id="master-results-heading">Results</h2>
      <p role="status">{summary}</p>
    </div>
    <div class="results-tools">
      <div class="result-filter">
        <TextField
          id="master-row-search"
          label="Filter results"
          hideLabel
          type="search"
          prefixIcon="filter"
          placeholder="Filter rows…"
          bind:value={filter}
        />
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon="download"
        ariaLabel="Export CSV"
        disabled={!shown.length}
        onclick={() => download('csv')}
      >
        CSV
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon="download"
        ariaLabel="Export JSON"
        disabled={!shown.length}
        onclick={() => download('json')}
      >
        JSON
      </Button>
    </div>
  </header>

  {#if crossReference}
    <div
      class="references"
      role="region"
      aria-label="Tables with {crossReference}"
    >
      <p>
        <Icon
          name="connect"
          size={14}
        />
        <code>{crossReference}</code>
        appears in {references.length}
        {references.length === 1 ? 'table' : 'tables'}
      </p>
      <div class="reference-list">
        {#each references as table (table.name)}
          <button
            class:current={table.name === activeTable}
            onclick={() => onbrowse(table.name)}
          >
            {table.name}
            <small>{rowCount.format(table.rows)}</small>
          </button>
        {/each}
      </div>
      <IconButton
        icon="close"
        label="Close column references"
        size="sm"
        onclick={() => (crossReference = '')}
      />
    </div>
  {/if}

  {#if error}
    <div
      class="query-error"
      role="alert"
    >
      <Banner
        title="Query failed"
        tone="danger"
        reportable={false}
      >
        <p>{error}</p>
      </Banner>
    </div>
  {:else if !result && pending}
    <div class="results-empty">
      <Spinner
        centered
        label={pendingMessages[pending]}
      />
    </div>
  {:else if !result}
    <div class="results-empty">
      <EmptyState
        icon="database"
        title="No table open"
        description="Choose a table or run a query to see rows."
      />
    </div>
  {:else if !result.columns.length}
    <div class="results-empty">
      <EmptyState
        icon="check"
        title="Statement complete"
        description="The statement ran and returned no rows."
      />
    </div>
  {:else}
    {#key result}
      <DataTable
        plain
        compact
        fill
        caption="SQL query results"
        {columns}
        rows={shown}
        emptyMessage={filter.trim()
          ? `No rows match “${filter.trim()}”.`
          : 'The query returned no rows.'}
      >
        {#snippet columnHeader(column)}
          <button
            class="reference-toggle"
            class:active={crossReference === column.label}
            aria-pressed={crossReference === column.label}
            aria-label="Find tables with {column.label}"
            title="Find tables with a {column.label} column"
            onclick={() => toggleReferences(column.label)}
          >
            <Icon
              name="connect"
              size={12}
            />
          </button>
        {/snippet}
        {#snippet cell(row, column)}
          {@const value = cellValue(row, column)}
          {@const timestamp = timestampLabel(column.label, value)}
          {#if value === null}
            <span class="null">NULL</span>
          {:else if timestamp}
            {row[column.key]}
            <small class="timestamp">{timestamp}</small>
          {:else if typeof value === 'string'}
            <span class="text">{value}</span>
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
    {/key}
  {/if}
</section>

<style>
  @import './master-data-cells.css';
  @import './master-data-results.css';
</style>
