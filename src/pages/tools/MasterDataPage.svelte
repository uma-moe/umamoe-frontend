<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import MasterWorker from './master-data.worker?worker';

  let importOpen = $state(false),
    elapsed = $state(0),
    started = 0,
    history = $state<string[]>([]);

  let worker: Worker | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined,
    request = 0;
  let pendingSource = 'Bundled Hakuraku catalog snapshot';

  let tab = $state('browser'),
    search = $state(''),
    filter = $state(''),
    table = $state(''),
    sql = $state('SELECT * FROM "chara" LIMIT 100'),
    error = $state(''),
    busy = $state(false),
    loaded = $state(false),
    source = $state('Bundled Hakuraku catalog snapshot');
  let schema = $state<Record<string, string[]>>({}),
    columns = $state<string[]>([]),
    rows = $state<Record<string, string | number>[]>([]),
    truncated = $state(false),
    crossReference = $state('');

  const tables = $derived(
    Object.keys(schema).filter((name) => name.toLowerCase().includes(search.toLowerCase()))
  );
  const filtered = $derived(
    rows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(filter.toLowerCase()))
    )
  );

  function start() {
    worker ??= new MasterWorker();
    worker.onmessage = (event) => {
      const result = event.data;
      if (result.id !== request) return;
      clearTimeout(timeout);
      busy = false;
      elapsed = Math.round(performance.now() - started);
      if (result.error) {
        error = result.error;
        return;
      }
      if (result.schema) {
        schema = result.schema;
        loaded = true;
        source = pendingSource;
        table = Object.keys(schema)[0] ?? '';
        sql = `SELECT * FROM "${table.replaceAll('"', '""')}" LIMIT 100`;
        if (table) run();
        else {
          rows = [];
          columns = [];
        }
      } else {
        columns = result.columns;
        rows = result.values.map((values: (string | number | null)[]) =>
          Object.fromEntries(columns.map((name, index) => [name, values[index] ?? 'NULL']))
        );
        truncated = result.truncated;
      }
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      busy = false;
      loaded = false;
      error = 'The SQL engine could not be loaded. Try loading the catalog again.';
      worker?.terminate();
      worker = undefined;
    };
  }

  function send(message: Record<string, unknown>) {
    start();
    error = '';
    busy = true;
    started = performance.now();
    worker!.postMessage({ ...message, id: ++request });
    timeout = setTimeout(() => {
      worker?.terminate();
      worker = undefined;
      busy = false;
      loaded = false;
      schema = {};
      rows = [];
      error = 'Operation exceeded 20 seconds. Reload a database and use a narrower query.';
    }, 20000);
  }

  function load() {
    pendingSource = 'Bundled Hakuraku catalog snapshot';
    send({ kind: 'catalog' });
  }

  function run() {
    history = [sql, ...history.filter((query) => query !== sql)].slice(0, 8);
    filter = '';
    crossReference = '';
    rows = [];
    columns = [];
    send({ kind: 'query', sql });
  }

  function select(name: string) {
    table = name;
    sql = `SELECT * FROM "${name.replaceAll('"', '""')}" LIMIT 100`;
    run();
  }

  async function upload(files: FileList) {
    const file = files[0];
    if (!file) return;
    if (file.size > 150 * 1024 * 1024) {
      error = 'Database files must be smaller than 150 MB.';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      pendingSource = file.name;
      importOpen = false;
      send({ kind: 'file', bytes });
    } catch {
      error = 'The database file could not be read.';
    }
  }

  function download(format: 'json' | 'csv') {
    const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
    const content =
      format === 'json'
        ? JSON.stringify(filtered, null, 2)
        : [
            columns.map(escape).join(','),
            ...filtered.map((row) => columns.map((column) => escape(row[column])).join(','))
          ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `master-data.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  onMount(load);

  onDestroy(() => {
    worker?.terminate();
    clearTimeout(timeout);
  });
</script>

<svelte:head>
  <title>Master Data · uma.moe</title>
  <meta
    name="description"
    content="Browse game master data and run SQLite queries locally."
  />
</svelte:head>
<AppPage
  routeId="master-data"
  title="Master Data"
  description="Explore the game’s tables, follow references, and query the data."
  eyebrow="Tools"
  width="wide"
>
  {#snippet actions()}
    <Button
      variant="secondary"
      icon="upload"
      onclick={() => (importOpen = true)}
    >
      Open database
    </Button>
  {/snippet}
  <section class="database-bar">
    <div class="database-icon">
      <Icon
        name="database"
        size={22}
      />
    </div>
    <div class="database-name">
      <strong>{source}</strong>
      <span>{Object.keys(schema).length} tables · SQLite · Local, read-only</span>
    </div>
    <span class="source-badge">
      {source === 'Bundled Hakuraku catalog snapshot' ? 'CATALOG SUBSET' : 'IMPORTED DATABASE'}
    </span>
    <Button
      variant="ghost"
      icon="refresh"
      size="sm"
      disabled={busy}
      onclick={load}
    >
      Reload bundled catalog
    </Button>
  </section>
  <div class="workbench">
    <aside class="table-sidebar">
      <header>
        <span>TABLES</span>
        <small>{Object.keys(schema).length}</small>
      </header>
      <div class="table-search">
        <TextField
          id="master-table-search"
          label="Find a table"
          type="search"
          placeholder="Filter tables…"
          bind:value={search}
        />
      </div>
      <nav aria-label="Database tables">
        {#each tables as name}
          <button
            class:active={table === name}
            disabled={busy}
            onclick={() => select(name)}
          >
            <Icon
              name="grid"
              size={14}
            />
            <span>{name}</span>
            <small>{schema[name]?.length}</small>
          </button>
        {/each}
      </nav>
      <div class="table-info">
        <Icon
          name="lock"
          size={14}
        />
        <p>Queries and imported files stay in your browser.</p>
      </div>
    </aside>
    <div class="database-main">
      <div class="workspace-tabs">
        <Tabs
          items={[
            { id: 'browser', label: 'SQL Browser' },
            { id: 'schema', label: 'Schema & References' },
            { id: 'versions', label: 'Version Changes' }
          ]}
          bind:value={tab}
          label="Master data views"
          controls="master-panel"
          variant="underline"
        />
      </div>
      <div
        id="master-panel"
        role="tabpanel"
        aria-label="Master data view"
      >
        {#if error}
          <div
            class="query-error"
            role="alert"
          >
            <Icon
              name="warning"
              size={16}
            />
            <strong>Query failed</strong>
            <span>{error}</span>
          </div>
        {/if}
        {#if tab === 'browser'}
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
                  run();
                }
              }}></textarea>
          </div>
          <div class="query-actions">
            <Button
              size="sm"
              disabled={!loaded || busy || !sql.trim()}
              onclick={run}
            >
              {busy ? 'Running…' : 'Run query'}
            </Button><Button
              size="sm"
              variant="ghost"
              disabled={!loaded || busy}
              onclick={() => {
                sql = 'SELECT COUNT(*) AS count FROM "' + table.replaceAll('"', '""') + '"';
                run();
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
                onclick={() => download('csv')}
              >
                Export CSV
              </Button><Button
                size="sm"
                variant="ghost"
                disabled={!filtered.length}
                onclick={() => download('json')}
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
                rows={filtered}
              />
            {:else}
              <div class="query-empty">
                <Icon
                  name="database"
                  size={28}
                />
                <p>
                  {busy
                    ? 'Loading the database…'
                    : 'Run a query or choose a table to explore its rows.'}
                </p>
              </div>
            {/if}
          </div>
        {:else if tab === 'schema'}
          <div class="schema-header">
            <div>
              <span class="eyebrow">TABLE SCHEMA</span>
              <h2>{table}</h2>
              <p>
                {schema[table]?.length ?? 0} columns · Select a field to find matching references.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onclick={() => {
                tab = 'browser';
                select(table);
              }}
            >
              Browse rows →
            </Button>
          </div>
          <div class="schema-workspace">
            <section>
              <h3>Columns</h3>
              <div class="schema-columns">
                {#each schema[table] ?? [] as column, i}
                  <button
                    class:active={crossReference === column}
                    onclick={() => (crossReference = column)}
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <code>{column}</code>
                    <Icon
                      name="connect"
                      size={14}
                    />
                  </button>
                {/each}
              </div>
            </section>
            <section class="references">
              <Icon
                name="connect"
                size={24}
              />
              <h3>{crossReference ? 'References to ' + crossReference : 'Follow a field'}</h3>
              <p>
                Find tables with a matching column name. These are potential relationships, not
                declared foreign keys.
              </p>
              {#if crossReference}
                {#each Object.keys(schema).filter( (name) => schema[name]?.includes(crossReference) ) as name}
                  <button
                    onclick={() => {
                      table = name;
                      crossReference = '';
                    }}
                  >
                    <Icon
                      name="grid"
                      size={14}
                    />
                    <span>{name}</span>
                    <Icon
                      name="arrow-right"
                      size={14}
                    />
                  </button>
                {/each}
              {/if}
            </section>
          </div>
        {:else}
          <div class="schema-header">
            <div>
              <span class="eyebrow">VERSION COMPARISON · DEMO</span>
              <h2>Changes between releases</h2>
              <p>Illustrative changes. Published master database versions are not connected.</p>
            </div>
          </div>
          <div class="diff-summary">
            <div>
              <span>Tables changed</span>
              <strong>4</strong>
            </div>
            <div class="added">
              <span>Rows added</span>
              <strong>+70</strong>
            </div>
            <div class="modified">
              <span>Rows modified</span>
              <strong>16</strong>
            </div>
            <div>
              <span>Rows removed</span>
              <strong>0</strong>
            </div>
          </div>
          <div class="diff-table">
            <DataTable
              plain
              caption="Example master data changes"
              columns={[
                { key: 'table', label: 'Table' },
                { key: 'added', label: 'Added', numeric: true },
                { key: 'removed', label: 'Removed', numeric: true },
                { key: 'modified', label: 'Modified', numeric: true }
              ]}
              rows={[
                { table: 'card_data', added: 2, removed: 0, modified: 1 },
                { table: 'skill_data', added: 14, removed: 0, modified: 3 },
                { table: 'text_data', added: 48, removed: 0, modified: 12 },
                { table: 'race_instance', added: 6, removed: 0, modified: 0 }
              ]}
            >
              {#snippet cell(row, column)}
                <span
                  class:added={column.key === 'added'}
                  class:modified={column.key === 'modified'}
                >
                  {column.key === 'added' ? '+' : ''}{row[column.key]}
                </span>
              {/snippet}
            </DataTable>
          </div>
        {/if}
      </div>
      <footer class="workbench-status">
        <span>
          <i class:busy></i>
          {busy ? 'Working…' : loaded ? 'Database ready' : 'No database loaded'}
        </span>
        <span>{table}</span>
        <span>SQLite / WASM</span>
      </footer>
    </div>
  </div>
  <p class="catalog-note">
    The bundled Hakuraku catalog contains selected game tables. Open a complete master.mdb or
    compressed database to browse the full table set.
  </p>
</AppPage>
<Dialog
  bind:open={importOpen}
  title="Open a master database"
  description="Files are processed locally and never uploaded."
  maxWidth="640px"
>
  <FileDrop
    id="master-upload"
    label="Drop a master database"
    description="SQLite .mdb, .db, .sqlite or gzip · Up to 150 MB"
    accept=".mdb,.db,.sqlite,.gz"
    disabled={busy}
    onfiles={upload}
  />
</Dialog>

<style>
  @import './master-data-page.css';
</style>
