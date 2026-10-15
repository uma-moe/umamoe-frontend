<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import PlannerGoalsPreview from './PlannerGoalsPreview.svelte';
  import DemoBlock from './DemoBlock.svelte';
  import ShowcaseControls from './showcase/ShowcaseControls.svelte';
  import ShowcaseNavigation from './showcase/ShowcaseNavigation.svelte';
  import ShowcaseFeedback from './showcase/ShowcaseFeedback.svelte';
  import ShowcasePickers from './showcase/ShowcasePickers.svelte';
  import ShowcaseGameDisplays from './showcase/ShowcaseGameDisplays.svelte';

  let { ids }: { ids: string[] } = $props();

  let dialogOpen = $state(false);
  let toasts = $state<Toast[]>([]);

  function notify(message = 'Preview saved') {
    toasts = [{ id: String(Date.now()), title: message, tone: 'success' }];
  }
</script>

<ShowcaseControls
  {ids}
  onnotify={notify}
/>
<ShowcaseNavigation
  {ids}
  onnotify={notify}
/>
<ShowcaseFeedback
  {ids}
  onnotify={notify}
  ontoast={(toast) => (toasts = [toast])}
  onopendialog={() => (dialogOpen = true)}
/>
<ShowcasePickers {ids} />
<ShowcaseGameDisplays
  {ids}
  onnotify={notify}
/>
{#if ids.includes('planner-goals')}
  <DemoBlock id="planner-goals">
    <PlannerGoalsPreview />
  </DemoBlock>
{/if}
{#if ids.includes('page-layout')}
  <DemoBlock id="page-layout">
    <div class="preview-stack">
      <div>
        <Button
          href="/ui?example=page-layout"
          target="_blank"
          variant="secondary"
          icon="external"
        >
          Open full-size layout preview
        </Button>
      </div>
      <iframe
        class="layout-preview"
        title="Shared page layout preview"
        src="/ui?example=page-layout"
        loading="lazy"
      ></iframe>
    </div>
  </DemoBlock>
{/if}
<Dialog
  id="preview-dialog"
  title="Preview dialog"
  description="The same dialog used throughout the site."
  bind:open={dialogOpen}
>
  <p>Tab stays inside the dialog. Press Escape to close.</p>
  {#snippet actions()}
    <Button
      variant="ghost"
      onclick={() => (dialogOpen = false)}
    >
      Cancel
    </Button><Button
      onclick={() => {
        dialogOpen = false;
        notify();
      }}
    >
      Save
    </Button>
  {/snippet}
</Dialog>
<ToastRegion
  {toasts}
  ondismiss={(id) => (toasts = toasts.filter((item) => item.id !== id))}
/>

<style>
  .layout-preview {
    display: block;
    width: 100%;
    height: 560px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
  }
</style>
