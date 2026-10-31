<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import { importVeteranFiles } from '@/pages/veterans/collection/veteran-library';
  import { selectWorkspace } from '@/lib/workspaces/workspace-state';
  import { veteranDatabaseUrl } from '@/lib/veterans/records/veteran-links';

  let open = $state(false),
    loading = $state(false),
    error = $state('');

  async function preview() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/demo/veterans.json');
      if (!response.ok) throw new Error('Sample veterans could not be loaded.');
      await importVeteranFiles([
        new File([await response.text()], 'demo-veterans.json', { type: 'application/json' })
      ]);

      selectWorkspace('local');
      open = true;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Preview could not be opened.';
    } finally {
      loading = false;
    }
  }
</script>

<aside>
  <span role="status">Demo preview with sample data</span>
  <a href="/profile/123456789012">Demo profile</a>
  <a href="/veterans">Veteran browser</a>
  <Button
    size="sm"
    variant="secondary"
    {loading}
    onclick={preview}
  >
    Try legacy selector
  </Button>
  {#if error}
    <span role="alert">{error}</span>
  {/if}
</aside>
{#if open}
  <ParentPickerDialog
    bind:open
    targetId={101301}
    onselect={(parent) => {
      const url = veteranDatabaseUrl(parent, '', 101301);
      if (url) location.assign(url);
    }}
  />
{/if}

<style>
  aside {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 16px;
    padding: 6px 12px;
    background: #664600;
    color: white;
    font-size: 12px;
  }
  a {
    color: inherit;
  }
</style>
