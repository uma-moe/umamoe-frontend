<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import TextField from '@/components/TextField.svelte';
  import PageFrame from '@/layouts/PageFrame.svelte';
  import { monteCarloBody } from './sample-race';
  import { readApiKey, writeApiKey } from './simulator-key';
  import { simulatorRepository, type MonteCarloResult, type SimulatorRun } from './simulator-repository';
  import MonteCarloResultPanel from './MonteCarloResultPanel.svelte';

  let apiKey = $state(readApiKey());
  let bodyText = $state(JSON.stringify(monteCarloBody, null, 2));
  let run = $state<SimulatorRun<MonteCarloResult> | null>(null);
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    writeApiKey(apiKey);
  });

  function resetBody(): void {
    bodyText = JSON.stringify(monteCarloBody, null, 2);
  }

  async function send(): Promise<void> {
    if (busy) return;
    error = '';
    run = null;

    if (!apiKey.trim()) {
      error = 'Add your uma.moe API key before sending.';
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      error = 'The request body is not valid JSON.';
      return;
    }

    busy = true;
    try {
      run = await simulatorRepository.monteCarlo({ key: apiKey.trim(), body });
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The request failed.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Simulator debug · uma.moe</title><meta name="robots" content="noindex, nofollow"/></svelte:head>

<PageFrame routeId="simulator-debug" pageTitle="Simulator debug" width="wide" adsEnabled={false} labelledby="simulator-debug-title">
  <main>
    <header class="intro">
      <div>
        <h1 id="simulator-debug-title">Simulator debug <span class="tag">internal</span></h1>
        <p>Runs the private simulator through the uma.moe backend proxy. Requests carry your own API key, which stays in this browser.</p>
      </div>
    </header>

    {#if error}
      <Banner title="Request failed" tone="danger" reportable={false}>{error}</Banner>
    {/if}

    <div class="workspace">
      <section class="panel" aria-labelledby="sim-request-title">
        <h2 id="sim-request-title">Request</h2>

        <TextField
          id="sim-api-key"
          type="password"
          label="uma.moe API key"
          help="Create one in Settings → API keys. Stored in this browser only."
          autocomplete="off"
          bind:value={apiKey}
        />

        <div class="field">
          <label for="sim-body">Monte Carlo body (JSON)</label>
          <textarea id="sim-body" bind:value={bodyText} spellcheck="false"></textarea>
          <span class="help">JSON only for now; MessagePack responses are not decoded.</span>
        </div>

        <div class="actions">
          <Button onclick={send} loading={busy} disabled={!apiKey.trim()}>Send</Button>
          <Button variant="secondary" onclick={resetBody} disabled={busy}>Reset body</Button>
        </div>
      </section>

      <section class="panel" aria-labelledby="sim-result-title">
        <h2 id="sim-result-title">Result</h2>
        {#if run}
          <MonteCarloResultPanel result={run.result} raw={run.raw} />
        {:else}
          <EmptyState
            icon="tools"
            title="No run yet"
            description="Send the request to see win counts and the raw response."
          />
        {/if}
      </section>
    </div>
  </main>
</PageFrame>

<style>
  .intro { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-end; justify-content: space-between; margin-bottom: var(--space-4); }
  h1 { margin: 0; font-size: var(--font-lg); }
  .tag { margin-left: var(--space-2); padding: 2px 8px; border-radius: var(--radius-pill); background: var(--color-accent-soft); color: var(--color-accent); font-size: var(--font-xs); font-weight: 700; vertical-align: middle; }
  .intro p { max-width: 65ch; margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-sm); }
  .workspace { display: grid; gap: var(--space-4); align-items: start; }
  @media (min-width: 1100px) { .workspace { grid-template-columns: minmax(320px, 440px) minmax(0, 1fr); } }
  .panel { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); }
  .panel h2 { margin: 0; font-size: var(--font-md); }
  .field { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .field label { color: var(--color-text); font-size: var(--font-sm); font-weight: 600; }
  textarea { min-height: 320px; padding: var(--space-3); border: 1px solid var(--factor-field-border); border-radius: var(--radius-md); background: var(--factor-field-bg); color: var(--factor-field-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--font-xs); line-height: 1.5; resize: vertical; }
  textarea:focus-visible { border-color: var(--factor-field-focus-border); outline: none; }
  .help { color: var(--color-text-muted); font-size: var(--font-xs); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
