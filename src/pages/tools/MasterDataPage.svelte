<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import MasterWorker from './master-data.worker?worker';
  import MasterDataSidebar from './master-data/MasterDataSidebar.svelte';
  import MasterDataQuery from './master-data/MasterDataQuery.svelte';
  import MasterDataSchema from './master-data/MasterDataSchema.svelte';
  import MasterDataVersions from './master-data/MasterDataVersions.svelte';
  import type { MasterDataRow } from './master-data/master-data-export';
  import type { MasterDataAction, MasterDataResponse } from './master-data/master-data-types';

  const bundledSource = 'Bundled Hakuraku game data';

  let importOpen = $state(false),
    elapsed = $state(0),
    started = 0,
    history = $state<string[]>([]);

  let worker: Worker | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined,
    request = 0;

  let pendingSource = bundledSource;

  let tab = $state('browser'),
    filter = $state(''),
    table = $state(''),
    sql = $state('SELECT * FROM "chara" LIMIT 100'),
    error = $state(''),
    busy = $state(false),
    loaded = $state(false),
    source = $state(bundledSource);

  let schema = $state<Record<string, string[]>>({}),
    columns = $state<string[]>([]),
    rows = $state<MasterDataRow[]>([]),
    truncated = $state(false),
    crossReference = $state('');

  function start() {
    worker ??= new MasterWorker();
    worker.onmessage = (event: MessageEvent<MasterDataResponse>) => {
      const result = event.data;
      if (result.id !== request) return;
      clearTimeout(timeout);
      busy = false;
      elapsed = Math.round(performance.now() - started);
      if (result.kind === 'error') {
        error = result.error;
        return;
      }

      if (result.kind === 'schema') {
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
        rows = result.values.map((values) =>
          Object.fromEntries(
            columns.map((name, index) => {
              const value = values[index];
              return [name, value ?? 'NULL'];
            })
          )
        );

        truncated = result.truncated;
      }
    };

    worker.onerror = () => {
      clearTimeout(timeout);
      busy = false;
      loaded = false;
      error =
        'The SQL engine could not be loaded. Reload the bundled data or reopen your database.';
      worker?.terminate();
      worker = undefined;
    };

    return worker;
  }

  function send(message: MasterDataAction) {
    const activeWorker = start();
    error = '';
    busy = true;
    started = performance.now();
    activeWorker.postMessage({ ...message, id: ++request });
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

  function loadBundledData() {
    pendingSource = bundledSource;
    send({ kind: 'bundled' });
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

  onMount(loadBundledData);

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
      {source === bundledSource ? 'BUNDLED GAME DATA' : 'IMPORTED DATABASE'}
    </span>
    <Button
      variant="ghost"
      icon="refresh"
      size="sm"
      disabled={busy}
      onclick={loadBundledData}
    >
      Reload bundled data
    </Button>
  </section>
  <div class="workbench">
    <MasterDataSidebar
      {schema}
      {table}
      {busy}
      onselect={select}
    />
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
          <MasterDataQuery
            bind:sql
            bind:filter
            {table}
            {loaded}
            {busy}
            {elapsed}
            {truncated}
            {history}
            {columns}
            {rows}
            onrun={run}
          />
        {:else if tab === 'schema'}
          <MasterDataSchema
            {schema}
            bind:table
            bind:crossReference
            onbrowse={() => {
              tab = 'browser';
              select(table);
            }}
          />
        {:else}
          <MasterDataVersions />
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
    The bundled Hakuraku game data contains selected tables. Open a complete master.mdb or
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
