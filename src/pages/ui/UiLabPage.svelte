<script lang="ts">
  import { theme, setTheme, type Theme } from '@/stores/theme';
  import PageFrame from '@/layouts/PageFrame.svelte';
  import LogoMark from '@/components/LogoMark.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { previews } from './component-previews';

  const layoutPreview = new URLSearchParams(location.search).get('example') === 'page-layout';
  const initial = previews.find((item) => item.id === location.hash.slice(1));

  let library = $state<'uma' | 'hakuraku'>(initial?.library ?? 'uma');
  let group = $state(initial?.group ?? 'Controls');
  let query = $state('');

  const groups = $derived([
    ...new Set(previews.filter((item) => item.library === library).map((item) => item.group))
  ]);

  const visible = $derived(
    previews.filter(
      (item) =>
        item.library === library &&
        (query.trim()
          ? `${item.title} ${item.components.join(' ')}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())
          : item.group === group)
    )
  );

  const count = $derived(
    new Set(previews.filter((item) => item.library === library).flatMap((item) => item.components))
      .size
  );

  const showcase = $derived(
    library === 'uma' ? import('./UmaShowcase.svelte') : import('./HakurakuLab.svelte')
  );

  function selectLibrary(value: string) {
    library = value as typeof library;
    group = library === 'uma' ? 'Controls' : 'Veterans';
    query = '';
    history.replaceState(null, '', location.pathname);
  }
</script>

<svelte:head>
  <title>UI components · uma.moe</title>
  <meta
    name="robots"
    content="noindex, nofollow"
  />
</svelte:head>

{#if layoutPreview}
  {#await import('./PageLayoutPreview.svelte')}
    <Spinner />
  {:then module}
    <module.default />
  {:catch}
    <p role="alert">Could not load the layout preview.</p>
  {/await}
{:else}
  <div data-ui-lab-shell>
    <header class="toolbar">
      <a
        href="/"
        aria-label="Back to uma.moe"
      >
        <LogoMark size={26} />
        <strong>
          uma.moe <span>/ UI</span>
        </strong>
      </a>
      <SegmentedControl
        label="Theme"
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' }
        ]}
        value={$theme}
        onchange={(value) => setTheme(value as Theme)}
      />
    </header>
    <PageFrame
      routeId="ui-lab"
      featureId="ui-system"
      pageTitle="UI components"
      width="wide"
      adsEnabled={false}
      labelledby="ui-title"
    >
      <main>
        <div class="intro">
          <div>
            <h1 id="ui-title">UI components</h1>
            <p>
              Current app components, with sample data. Changes here come from the same files used
              across the site.
            </p>
          </div>
          <span>{count} components</span>
        </div>
        <div class="libraries">
          <Tabs
            variant="pills"
            id="library-tabs"
            label="Component library"
            controls="library-content"
            value={library}
            onchange={selectLibrary}
            items={[
              { id: 'uma', label: 'uma.moe' },
              { id: 'hakuraku', label: 'Hakuraku' }
            ]}
          />
        </div>
        <div class="layout">
          <aside>
            <TextField
              id="component-search"
              type="search"
              label="Find a component"
              placeholder="Search components…"
              bind:value={query}
            />
            <nav aria-label="Component groups">
              {#each groups as name}
                <button
                  class:active={!query && group === name}
                  aria-current={!query && group === name ? 'page' : undefined}
                  onclick={() => {
                    group = name;
                    query = '';
                  }}
                >
                  {name}
                  <span>
                    {previews.filter((item) => item.library === library && item.group === name)
                      .length}
                  </span>
                </button>
              {/each}
            </nav>
            <p>
              {library === 'hakuraku'
                ? 'Veterans and statistics now share the Svelte components used in uma.moe.'
                : 'Shared controls, feedback, and game displays.'}
            </p>
          </aside>
          <div
            id="library-content"
            role="tabpanel"
            aria-labelledby={`library-tabs-${library}`}
          >
            {#await showcase}
              <div class="loading">
                <Spinner /> Loading previews…
              </div>
            {:then module}
              <module.default ids={visible.map((item) => item.id)} />
            {:catch}
              <p role="alert">
                Could not load the previews. <a href={location.pathname}>Reload</a>
              </p>
            {/await}
            {#if !visible.length}
              <p class="no-results">No components match “{query}”.</p>
            {/if}
          </div>
        </div>
      </main>
    </PageFrame>
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 24px;
    border-bottom: 1px solid var(--border-primary);
    background: var(--surface-1);
  }
  .toolbar > a {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-primary);
    text-decoration: none;
  }
  .toolbar strong {
    font-size: 14px;
  }
  .toolbar strong span {
    color: var(--text-muted);
    font-weight: 400;
  }
  main {
    padding-block: 30px;
  }
  .intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 28px;
  }
  .intro p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
  .intro > span {
    white-space: nowrap;
    font-size: 12px;
    color: var(--text-muted);
  }
  .libraries {
    max-width: 320px;
    margin-bottom: 24px;
  }
  .layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 40px;
  }
  .layout > aside {
    align-self: start;
    position: sticky;
    top: 20px;
  }
  .layout > aside > p {
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-muted);
    margin-top: 20px;
  }
  nav {
    display: grid;
    gap: 4px;
    margin-top: 16px;
  }
  nav button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
    padding: 11px 12px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
  }
  nav button:hover {
    background: var(--surface-2);
  }
  nav button.active {
    background: rgb(var(--accent-primary-rgb) / 0.1);
    border-color: rgb(var(--accent-primary-rgb) / 0.25);
    color: var(--accent-primary);
  }
  nav span {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 0;
    color: var(--text-muted);
    font-size: 12px;
  }
  .no-results {
    color: var(--text-muted);
    font-size: 13px;
  }
  .layout > aside,
  #library-content {
    min-width: 0;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .layout > aside {
      position: static;
    }
    .layout > aside > p {
      display: none;
    }
    nav {
      display: flex;
      overflow-x: auto;
    }
    nav button {
      white-space: nowrap;
      flex: none;
    }
    .intro > span {
      display: none;
    }
    .toolbar {
      padding: 12px 16px;
    }
    .intro {
      margin-bottom: 18px;
    }
    main {
      padding-block: 20px;
    }
    .libraries {
      margin-bottom: 20px;
    }
    h1 {
      font-size: 24px;
    }
  }
</style>
