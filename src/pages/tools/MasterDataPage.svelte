<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Badge from '@/components/Badge.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import { copyText } from '@/lib/clipboard';
  import MasterDataEditor from './master-data/MasterDataEditor.svelte';
  import MasterDataResults from './master-data/MasterDataResults.svelte';
  import MasterDataSidebar from './master-data/MasterDataSidebar.svelte';
  import { masterDataSearch, readMasterDataLink } from './master-data/master-data-link';
  import { browseTableSql, firstQueriedTable } from './master-data/master-data-results';
  import { MasterDataSession } from './master-data/master-data-session.svelte';

  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  // Every name, title and description in the game resolves through text_data.
  const STARTING_TABLE = 'text_data';

  const session = new MasterDataSession();
  const link = readMasterDataLink(location.search);

  let sql = $state(link.sql);
  let executedSql = $state(link.sql);
  let filter = $state(link.filter);
  let importOpen = $state(false);
  let fileError = $state('');
  let linkCopied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const loaded = $derived(session.database !== undefined);
  const activeTable = $derived(firstQueriedTable(executedSql, session.tables));
  const totalRows = $derived(session.tables.reduce((sum, table) => sum + table.rows, 0));

  const sourceDetails = $derived.by(() => {
    if (session.opening) return 'Downloading and opening the database…';
    if (!loaded) return 'Not loaded';

    const size = `${session.tables.length.toLocaleString()} tables · ${totalRows.toLocaleString()} rows`;
    if (session.database?.kind !== 'published') return size;
    return `Global ${session.database.marker.replace(':', ' · resource ')} · ${size}`;
  });

  function execute(statement: string) {
    if (!statement.trim()) return;

    sql = statement;
    executedSql = statement;
    void session.run(statement);
  }

  function runEditor() {
    if (!loaded) return;
    execute(sql);
  }

  function browse(table: string) {
    filter = '';
    execute(browseTableSql(table));
  }

  function browseStartingTable() {
    const table =
      session.tables.find((candidate) => candidate.name === STARTING_TABLE) ??
      session.tables.find((candidate) => candidate.rows > 0);

    if (table) browse(table.name);
  }

  async function openPublished() {
    if (!(await session.openPublished())) return;

    // A shared link opens on its own query; otherwise start somewhere useful.
    if (executedSql.trim()) execute(executedSql);
    else browseStartingTable();
  }

  async function switchToPublished() {
    if (await session.openPublished()) browseStartingTable();
  }

  async function openFile(files: FileList) {
    const file = files[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      fileError = 'Database files must be smaller than 150 MB.';
      return;
    }

    fileError = '';
    importOpen = false;
    if (await session.openFile(file)) browseStartingTable();
  }

  async function copyLink() {
    const url =
      location.origin + location.pathname + masterDataSearch({ sql: executedSql, filter });
    if (!(await copyText(url))) return;

    linkCopied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (linkCopied = false), 2000);
  }

  // The address always reopens the rows on screen, like Hakuraku's shared links.
  $effect(() => {
    const search = masterDataSearch({ sql: executedSql, filter });
    untrack(() => history.replaceState(history.state, '', location.pathname + search));
  });

  onMount(() => {
    void openPublished();

    return () => {
      session.destroy();
      clearTimeout(copiedTimer);
    };
  });
</script>

<svelte:head>
  <title>Master Data · uma.moe</title>
  <meta
    name="description"
    content="Browse every table in the game's master database and run SQLite queries locally."
  />
</svelte:head>
<AppPage
  routeId="master-data"
  title="Master Data"
  description="Every table in the game’s master database. Pick a table, filter its rows, or write SQL."
  width="wide"
>
  {#snippet actions()}
    <Button
      variant="secondary"
      icon="upload"
      onclick={() => (importOpen = true)}
    >
      Open a database file
    </Button>
  {/snippet}
  <section
    class="source-bar"
    aria-label="Open database"
  >
    <Icon
      name="database"
      size={20}
    />
    <div class="source-name">
      <strong>
        {#if session.database?.kind === 'file'}
          {session.database.name}
          <Badge tone="warning">Your file</Badge>
        {:else}
          Game master database
        {/if}
      </strong>
      <span>{sourceDetails}</span>
    </div>
    {#if session.database?.kind === 'file'}
      <Button
        variant="ghost"
        size="sm"
        icon="refresh"
        disabled={session.opening}
        onclick={switchToPublished}
      >
        Use the game database
      </Button>
    {/if}
  </section>
  {#if session.loadError}
    <Banner
      title="The database could not be opened"
      tone="danger"
    >
      <p>{session.loadError}</p>
      {#if loaded}
        <p>The database you had open is still loaded.</p>
      {:else}
        <Button
          size="sm"
          variant="secondary"
          icon="refresh"
          disabled={session.opening}
          onclick={openPublished}
        >
          Try again
        </Button>
      {/if}
    </Banner>
  {/if}
  <div class="workbench">
    <MasterDataSidebar
      tables={session.tables}
      active={activeTable}
      loading={session.opening}
      onbrowse={browse}
    />
    <div class="workspace">
      <MasterDataEditor
        id="master-sql"
        bind:value={sql}
        tables={session.tables}
        onrun={runEditor}
      />
      <div class="query-actions">
        <Button
          size="sm"
          disabled={!loaded || session.opening || !sql.trim()}
          onclick={runEditor}
        >
          {session.querying ? 'Running…' : 'Run query'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={linkCopied ? 'check' : 'share'}
          disabled={!executedSql.trim()}
          onclick={copyLink}
        >
          {linkCopied ? 'Link copied' : 'Copy link'}
        </Button>
        <span>Runs the first statement · up to 100,000 rows</span>
      </div>
      <MasterDataResults
        result={session.result}
        tables={session.tables}
        {activeTable}
        bind:filter
        pending={session.pending}
        error={session.queryError}
        onbrowse={browse}
      />
    </div>
  </div>
</AppPage>
<Dialog
  bind:open={importOpen}
  title="Open a database file"
  description="Any SQLite master.mdb, plain or gzip-compressed. It is read in your browser and never uploaded."
  maxWidth="640px"
>
  <FileDrop
    id="master-upload"
    label="Drop a database file"
    description="SQLite .mdb, .db, .sqlite or .gz · Up to 150 MB"
    accept=".mdb,.db,.sqlite,.gz"
    disabled={session.opening}
    onfiles={openFile}
  />
  {#if fileError}
    <div
      class="file-error"
      role="alert"
    >
      <Banner
        title="File not opened"
        tone="warning"
      >
        <p>{fileError}</p>
      </Banner>
    </div>
  {/if}
</Dialog>

<style>
  @import './master-data-page.css';
</style>
