<script lang="ts">
  import { Router } from 'sv-router';
  import { on } from 'svelte/events';
  import AppShell from './layouts/AppShell.svelte';
  import { router } from './routes/router';

  const isDirectUiLabRoute = /^\/ui(?:-lab)?\/?$/.test(globalThis.location?.pathname ?? '');

  // sv-router's window handler consumes modified/cancelled internal clicks.
  // Run after component handlers, without cancelling the browser's link action.
  $effect(() =>
    on(document, 'click', (event) => {
      if (
        !event.defaultPrevented &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (anchor instanceof HTMLAnchorElement && anchor.origin === location.origin)
        event.stopPropagation();
    })
  );
</script>

<svelte:boundary
  onerror={(error) => window.dispatchEvent(new CustomEvent('umamoe:app-error', { detail: error }))}
>
  {#if import.meta.env.MODE === 'demo'}
    {#await import('./pages/ui/DemoNotice.svelte') then module}
      <module.default />
    {/await}
  {/if}

  {#if isDirectUiLabRoute}
    <Router />
  {:else}
    <AppShell><Router /></AppShell>
  {/if}
</svelte:boundary>
