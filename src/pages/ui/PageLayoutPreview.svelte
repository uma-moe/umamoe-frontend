<script lang="ts">
  import AppShell from '@/layouts/AppShell.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Card from '@/components/cards/Card.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import { theme } from '@/stores/theme';

  let tab = $state('overview'),
    size = $state('728x90'),
    closed = $state(false),
    privacy = $state(false);

  const dimensions = $derived(size.split('x').map(Number));
  const ad = $derived(
    `<body style="margin:0;display:grid;place-items:center;height:100vh;background:${$theme === 'dark' ? '#182834' : '#e5f2fb'};color:${$theme === 'dark' ? '#8dcfff' : '#195579'};font:16px system-ui">Sample advertisement ${size}</body>`
  );
</script>

<AppShell>
  <AppPage
    routeId="statistics"
    title="Shared page layout"
    description="The AppPage layout used by Veterans and Statistics."
    width="wide"
  >
    {#snippet actions()}
      <Button
        variant="secondary"
        onclick={() => (privacy = true)}
      >
        Preview privacy colours
      </Button>
    {/snippet}
    <div class="sample-content">
      <Tabs
        variant="pills"
        label="Layout sections"
        items={[
          { id: 'overview', label: 'Overview', icon: 'grid' },
          { id: 'details', label: 'Details', icon: 'chart' }
        ]}
        bind:value={tab}
      />
      <Card>
        <p>
          This preview uses sample content and ad placeholders. No advertising or consent requests
          are sent.
        </p>
        <SegmentedControl
          label="Footer ad size"
          options={[
            { value: '320x50', label: '320 × 50' },
            { value: '728x90', label: '728 × 90' },
            { value: '970x250', label: '970 × 250' }
          ]}
          bind:value={size}
        />
        <p>
          Close the footer using its inside corner button. Reload this preview to show it again.
        </p>
      </Card>
      {#each [1, 2, 3, 4] as row}
        <Card>
          <h2>{tab === 'overview' ? 'Content section' : 'Detail section'} {row}</h2>
          <p>Scroll to check the centered rail and the footer placement.</p>
        </Card>
      {/each}
    </div>
  </AppPage>
</AppShell>

{#if !closed}
  <div class="publift-widget-sticky_footer-container uma-footer-ad">
    <div class="publift-widget-sticky_footer">
      <iframe
        title="Sample footer advertisement"
        width={dimensions[0]}
        height={dimensions[1]}
        srcdoc={ad}
      ></iframe>
    </div>
    <button
      type="button"
      class="footer-ad-close"
      aria-label="Close footer ad"
      onclick={() => (closed = true)}
    >
      ×
    </button>
  </div>
{/if}
<Dialog
  bind:open={privacy}
  title="Privacy colours preview"
  description="Sample publisher markup. These buttons only close the preview."
>
  <div id="qc-cmp2-ui">
    <div class="qc-cmp2-consent-info">
      <h3>Your privacy choices</h3>
      <p>The publisher's consent controls use the site's surfaces, text and accent colours.</p>
      <a
        href="/privacy"
        target="_blank"
        rel="noopener"
      >
        Privacy policy
      </a>
    </div>
    <div class="qc-cmp2-footer">
      <button
        type="button"
        {...{ mode: 'secondary' }}
        onclick={() => (privacy = false)}
      >
        Manage options
      </button>
      <button
        type="button"
        {...{ mode: 'accept' }}
        onclick={() => (privacy = false)}
      >
        Accept preview
      </button>
    </div>
  </div>
</Dialog>

<style>
  .sample-content {
    display: grid;
    gap: 16px;
  }
  .sample-content > :global(.tabs) {
    width: fit-content;
  }
  .sample-content :global(.card) {
    min-height: 180px;
  }
  .sample-content h2 {
    font-size: 18px;
  }
  .sample-content p {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
  :global([data-ad-kind='rail']) {
    position: relative;
    border: 1px dashed var(--border-primary);
    background: var(--surface-1);
  }
  :global([data-ad-kind='rail'])::after {
    content: '160 × 600 rail preview';
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: 12px;
  }
  iframe {
    border: 0;
    max-width: calc(100vw - 16px);
  }
  .qc-cmp2-consent-info {
    padding: 16px;
    border-radius: 8px;
  }
  .qc-cmp2-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 16px;
  }
  .qc-cmp2-footer button {
    padding: 10px 14px;
    border: 1px solid;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }
</style>
