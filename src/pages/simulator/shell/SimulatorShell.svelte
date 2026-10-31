<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerSummary from '@/pages/competitive/runners/RunnerSummary.svelte';
  import SimulatorUmaEditor from '../setup/runner/editor/SimulatorUmaEditor.svelte';
  import { simulatorUmaSummary } from '../simulator-uma';
  import {
    simulatorRoster,
    ensureSimulatorRoster,
    saveSimulatorField
  } from '../simulator-roster.svelte';
  import {
    courseDataErrorVisible,
    dismissCourseDataError,
    ensureSimulatorCourses,
    selectedCourse,
    simulatorCourseData,
    simulatorSession
  } from '../simulator-session.svelte';
  import type { SimulatorMode, SimulatorPanel } from './types';

  let {
    mode,
    panels = [],
    showUma = true,
    children
  }: {
    mode: SimulatorMode;
    panels?: SimulatorPanel[];
    showUma?: boolean;
    children: Snippet;
  } = $props();

  let panelId = $state(''),
    umaOpen = $state(false);

  const panel = $derived(panels.find((item) => item.id === panelId));
  const course = $derived(selectedCourse());
  /** Undefined while the field is empty, as a cleared field leaves it. */
  const uma = $derived(
    simulatorRoster.umas.find((item) => item.id === simulatorSession.umaId) ??
      simulatorRoster.umas[0]
  );

  // Keep the field this browser last raced, from every simulator page that changes it.
  $effect(saveSimulatorField);

  onMount(() => {
    void ensureSimulatorCourses();
    void ensureSimulatorRoster().catch(() => {
      /* Manual runners remain editable if character resources are unavailable. */
    });

    try {
      localStorage.removeItem('uma.simulator.api-key');
    } catch {
      /* Storage may be disabled. */
    }
  });
</script>

{#if courseDataErrorVisible()}
  <Banner
    title="Race data unavailable"
    tone="danger"
    reportable={false}
    dismissible
    ondismiss={dismissCourseDataError}
  >
    {simulatorCourseData.error}
  </Banner>
{/if}
<div class="workspace">
  {#if panels.length}
    <div class="setup-actions">
      {#each panels as item}
        <Button
          size="sm"
          variant="secondary"
          icon={item.icon}
          onclick={() => (panelId = item.id)}
        >
          {item.label}{#if item.badge}
            *
          {/if}
        </Button>
      {/each}
    </div>
  {/if}
  {#if showUma && uma}
    <div class="uma-row">
      {#if simulatorRoster.umas.length > 1}
        <div class="uma-picker">
          <SelectField
            id="calculator-uma"
            label="Uma"
            hideLabel
            value={uma.id}
            onchange={(value) => (simulatorSession.umaId = value)}
            options={simulatorRoster.umas.map((uma) => ({ value: uma.id, label: uma.name }))}
          />
        </div>
      {/if}
      <RunnerSummary
        runner={simulatorUmaSummary(uma, 0, course)}
        layout="row"
        showScore={false}
        labelStats={false}
      />
      <Button
        size="sm"
        variant="secondary"
        onclick={async () => {
          await ensureSimulatorRoster().catch(() => {});
          umaOpen = true;
        }}
      >
        Edit Uma
      </Button>
    </div>
  {/if}
  {@render children()}
</div>
{#if uma}
  <SimulatorUmaEditor
    {uma}
    bind:open={umaOpen}
    onsave={(value) => {
      simulatorRoster.umas = simulatorRoster.umas.map((item) =>
        item.id === value.id ? value : item
      );
      simulatorRoster.configured = true;
    }}
  />
{/if}
<Dialog
  open={!!panel}
  title={panel?.label ?? 'Setup'}
  maxWidth="900px"
  maxHeight="90dvh"
  onclose={() => (panelId = '')}
>
  {#if panel}
    {@render panel.content()}
  {/if}
  {#snippet actions()}
    <Button onclick={() => (panelId = '')}>Done</Button>
  {/snippet}
</Dialog>

<style>
  .uma-picker {
    width: 160px;
    max-width: 100%;
  }
  .workspace {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .setup-actions,
  .uma-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .uma-row {
    padding: 14px 18px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    container-type: inline-size;
  }
  .uma-row :global(.runner-summary) {
    flex: 1;
    min-width: 240px;
  }
  .uma-row :global(.runner-summary.row) {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
  .uma-row :global(.runner-summary .portrait) {
    height: 76px;
  }
  .uma-row :global(.runner-summary .veteran-identity) {
    grid-template-columns: 64px minmax(0, 1fr) auto;
  }
  .uma-row :global(.runner-summary .identity h3) {
    font-size: 16px;
  }
  .uma-row :global(.values.compact dd) {
    font-size: 13px;
  }
  .uma-row :global(.values.compact img) {
    width: 14px;
    height: 14px;
  }
  @media (max-width: 900px) {
    .uma-row :global(.runner-summary.row) {
      grid-template-columns: minmax(0, 1fr);
    }
    .uma-row :global(.summary-build) {
      margin-left: 72px;
    }
    .uma-row :global(.race-aptitudes) {
      justify-content: flex-start;
    }
  }
  @media (max-width: 500px) {
    .workspace {
      gap: 14px;
    }
    .uma-row {
      padding: 10px;
    }
    .uma-row :global(.runner-summary) {
      flex-basis: 100%;
      min-width: 0;
    }
  }
</style>
