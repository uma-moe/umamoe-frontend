<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Icon from '@/components/Icon.svelte';
  import { downloadRows, type MasterDataRow } from './master-data-export';

  interface Props {
    sql: string;
    filter: string;
    table: string;
    loaded: boolean;
    busy: boolean;
    elapsed: number;
    truncated: boolean;
    history: string[];
    columns: string[];
    rows: MasterDataRow[];
    onrun: () => void;
  }

  let {
    sql = $bindable(),
    filter = $bindable(),
    table,
    loaded,
    busy,
    elapsed,
    truncated,
    history,
    columns,
    rows,
    onrun
  }: Props = $props();

  const filtered = $derived(
    rows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(filter.toLowerCase()))
    )
  );

  const displayRows = $derived(
    filtered.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value instanceof Uint8Array ? value.toString() : value
        ])
      )
    )
  );
</script>

<div class="editor-heading">
  <div>
    <Icon
      name="edit"
      size={14}
    />
    <span>query.sql</span>
    <small>SQLite</small>
  </div>
  <span>Ctrl / ⌘ + Enter to run</span>
</div>
<div class="sql-editor">
  <div
    class="line-numbers"
    aria-hidden="true"
  >
    {#each sql.split('\n') as _, i}
      <span>{i + 1}</span>
    {/each}
  </div>
  <textarea
    id="master-sql"
    aria-label="SQL query"
    bind:value={sql}
    spellcheck="false"
    rows="6"
    onkeydown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && loaded && !busy) {
        event.preventDefault();
        onrun();
      }
    }}></textarea>
</div>
<div class="query-actions">
  <Button
    size="sm"
    disabled={!loaded || busy || !sql.trim()}
    onclick={onrun}
  >
    {busy ? 'Running…' : 'Run query'}
  </Button><Button
    size="sm"
    variant="ghost"
    disabled={!loaded || busy}
    onclick={() => {
      sql = 'SELECT COUNT(*) AS count FROM "' + table.replaceAll('"', '""') + '"';
      onrun();
    }}
  >
    Count rows
  </Button>
  <span>First statement · Up to 1,000 rows</span>
</div>
<details class="query-history">
  <summary>
    Recent queries <span>{history.length}</span>
  </summary>
  {#each history as query}
    <button onclick={() => (sql = query)}>
      <code>{query}</code>
      <Icon
        name="arrow-right"
        size={12}
      />
    </button>
  {/each}
</details>
<div class="results-heading">
  <div>
    <h2>
      Results <span>{filtered.length}</span>
    </h2>
    <p role="status">
      {busy ? 'Executing query…' : filtered.length + ' rows'}{!busy && elapsed
        ? ' · ' + elapsed + ' ms'
        : ''}{truncated ? ' · limited to 1,000' : ''}
    </p>
  </div>
  <div class="export-actions">
    <Button
      size="sm"
      variant="ghost"
      icon="download"
      disabled={!filtered.length}
      onclick={() => downloadRows(filtered, columns, 'csv')}
    >
      Export CSV
    </Button><Button
      size="sm"
      variant="ghost"
      disabled={!filtered.length}
      onclick={() => downloadRows(filtered, columns, 'json')}
    >
      Export JSON
    </Button>
  </div>
</div>
<div class="result-filter">
  <TextField
    id="master-row-search"
    label="Filter results"
    type="search"
    placeholder="Search returned values…"
    bind:value={filter}
  />
</div>
<div class="query-results">
  {#if columns.length}
    <DataTable
      plain
      caption="SQL query results"
      columns={columns.map((key) => ({ key, label: key }))}
      rows={displayRows}
    />
  {:else}
    <div class="query-empty">
      <Icon
        name="database"
        size={28}
      />
      <p>
        {busy ? 'Loading the database…' : 'Run a query or choose a table to explore its rows.'}
      </p>
    </div>
  {/if}
</div>

<style>
  @import './master-data-query.css';
</style>
