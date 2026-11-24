<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Badge from '@/components/Badge.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import { copyText } from '@/lib/clipboard';
  import MasterDataEditor from './master-data/MasterDataEditor.svelte';
  import MasterDataResults from './master-data/MasterDataResults.svelte';
  import MasterDataSidebar from './master-data/MasterDataSidebar.svelte';
  import MasterDataHistory from './master-data/history/MasterDataHistory.svelte';
  import {
    masterHistorySearch,
    readMasterHistoryLink
  } from './master-data/history/master-history-link';
  import { masterDataSearch, readMasterDataLink } from './master-data/master-data-link';
  import { browseTableSql, firstQueriedTable } from './master-data/master-data-results';
  import { MasterDataSession } from './master-data/master-data-session.svelte';

  type MasterDataView = 'browser' | 'history';

  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  // Every name, title and description in the game resolves through text_data.
  const STARTING_TABLE = 'text_data';
  const VIEWS: TabItem[] = [
    { id: 'browser', label: 'Table browser', icon: 'database' },
    { id: 'history', label: 'Version history', icon: 'calendar' }
  ];

  const session = new MasterDataSession();
  const link = readMasterDataLink(location.search);
  const historyLink = readMasterHistoryLink(location.search);

  let view = $state<MasterDataView>(historyLink ? 'history' : 'browser');
  let historyRelease = $state(historyLink?.release ?? '');
  let historyTable = $state(historyLink?.table ?? '');
  // The database download starts the first time the table browser is shown.
  let browserStarted = false;
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
  const activeSource = $derived(
    session.database?.kind === 'preliminary' ? 'preliminary' : 'published'
  );

  const sourceDetails = $derived.by(() => {
    if (session.opening) return 'Downloading and opening the database…';
    if (!loaded) return 'Not loaded';

    const size = `${session.tables.length.toLocaleString()} tables, ${totalRows.toLocaleString()} rows`;
    if (session.database?.kind === 'preliminary') {
      return `Unreleased CDN resource ${session.database.resourceVersion} (subject to change), ${size}`;
    }

    if (session.database?.kind !== 'published') return size;
    return `Global ${session.database.marker.replace(':', ', resource ')}, ${size}`;
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

  async function openPreliminary() {
    if (!(await session.openPreliminary())) return;

    if (executedSql.trim()) execute(executedSql);
    else browseStartingTable();
  }

  async function startInitialDatabase() {
    if (link.source === 'preliminary') {
      const preliminary = await session.checkPreliminary();
      if (preliminary) {
        await openPreliminary();
        return;
      }
    }

    await openPublished();
  }

  function startBrowser() {
    if (browserStarted) return;

    browserStarted = true;
    void startInitialDatabase();
  }

  function selectView(id: string) {
    view = id === 'history' ? 'history' : 'browser';
    if (view === 'browser') startBrowser();
  }

  async function openPreliminaryFromHistory() {
    view = 'browser';
    browserStarted = true;
    await openPreliminary();
  }

  async function selectDatabaseSource(next: string) {
    if (next === 'preliminary') await openPreliminary();
    else await openPublished();
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
    const source = session.database?.kind === 'preliminary' ? 'preliminary' : undefined;
    const url =
      location.origin + location.pathname + masterDataSearch({ sql: executedSql, filter, source });
    if (!(await copyText(url))) return;

    linkCopied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (linkCopied = false), 2000);
  }

  // The address always reopens the rows or diff on screen, like Hakuraku's shared links.
  $effect(() => {
    const source = session.database?.kind === 'preliminary' ? 'preliminary' : undefined;
    const search =
      view === 'history'
        ? masterHistorySearch({ release: historyRelease, table: historyTable })
        : masterDataSearch({ sql: executedSql, filter, source });
    untrack(() => history.replaceState(history.state, '', location.pathname + search));
  });

  onMount(() => {
    if (view === 'browser') startBrowser();

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
  description="Browse the game’s master database, query it with SQL, or see what each release changed."
  width="wide"
>
  {#snippet actions()}
    {#if view === 'browser'}
      <Button
        variant="secondary"
        icon="upload"
        onclick={() => (importOpen = true)}
      >
        Open a database file
      </Button>
    {/if}
  {/snippet}
  <Tabs
    compact
    variant="pills"
    items={VIEWS}
    value={view}
    label="Master data views"
    controls="master-data-view"
    onchange={selectView}
  />
  <div
    id="master-data-view"
    class="view"
    role="tabpanel"
    aria-label={view === 'history' ? 'Version history' : 'Table browser'}
  >
    {#if view === 'history'}
      <MasterDataHistory
        bind:release={historyRelease}
        bind:table={historyTable}
        onbrowsepreliminary={openPreliminaryFromHistory}
      />
    {:else}
      <section
        class="source-bar"
        class:preliminary={session.database?.kind === 'preliminary'}
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
            {:else if session.database?.kind === 'preliminary'}
              Preliminary master database
              <Badge tone="warning">Preliminary CDN</Badge>
            {:else}
              Game master database
            {/if}
          </strong>
          <span>{sourceDetails}</span>
        </div>
        {#if session.database?.kind !== 'file' && session.preliminaryAvailable}
          <div class="source-switch">
            <SegmentedControl
              label="Master database source"
              options={[
                { value: 'published', label: 'Live' },
                {
                  value: 'preliminary',
                  label: `Preliminary (${session.preliminaryAvailable.resourceVersion})`
                }
              ]}
              value={activeSource}
              onchange={selectDatabaseSource}
            />
          </div>
        {/if}
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
            <span>Runs the first statement, up to 100,000 rows</span>
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
    {/if}
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
    description="SQLite .mdb, .db, .sqlite or .gz up to 150 MB"
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
