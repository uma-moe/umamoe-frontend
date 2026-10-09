<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import RunnerSummary from '@/pages/competitive/RunnerSummary.svelte';
  import SimulatorUmaEditor from '../SimulatorUmaEditor.svelte';
  import { simulatorUmaSummary } from '../simulator-uma';
  import { simulatorRoster, ensureSimulatorRoster } from '../simulator-roster.svelte';
  import { ensureSimulatorCatalog, selectedCourse, simulatorSession } from '../simulator-session.svelte';
  import type { SimulatorMode, SimulatorPanel } from './types';

  let { mode, panels = [], showUma = true, children }: {
    mode: SimulatorMode; panels?: SimulatorPanel[]; showUma?: boolean; children: Snippet;
  } = $props();
  let panelId = $state(''), umaOpen = $state(false);
  const panel = $derived(panels.find(item => item.id === panelId));
  const course = $derived(selectedCourse());
  const uma = $derived(simulatorRoster.umas.find(item => item.id === simulatorSession.umaId) ?? simulatorRoster.umas[0]!);
  const modes = [
    { mode: 'race', label: 'Race sim', href: '/simulator/race', icon: 'race' },
    { mode: 'stamina', label: 'HP calculator', href: '/simulator', icon: 'battery' },
    { mode: 'build', label: 'Build search', href: '/simulator/build', icon: 'tune' }
  ];
  onMount(() => {
    void ensureSimulatorCatalog();
    void ensureSimulatorRoster().catch(() => { /* Manual runners remain editable if character resources are unavailable. */ });
    try { localStorage.removeItem('uma.simulator.api-key'); } catch { /* Storage may be disabled. */ }
  });
</script>

<div class="workspace">
  <div class="workspace-head">
    <nav aria-label="Simulator mode">
      {#each modes as item}<a href={item.href} class:active={item.mode === mode} aria-current={item.mode === mode ? 'page' : undefined}><Icon name={item.icon as IconName} size={17}/>{item.label}</a>{/each}
    </nav>
    <div class="setup-actions">
      {#each panels as item}<Button size="sm" variant="secondary" icon={item.icon} onclick={() => panelId = item.id}>{item.label}{#if item.badge} *{/if}</Button>{/each}
    </div>
  </div>
  {#if showUma}
    <div class="uma-row">
      {#if simulatorRoster.umas.length > 1}<div class="uma-picker"><SelectField id="calculator-uma" label="Uma" hideLabel value={uma.id} onchange={value => simulatorSession.umaId = value} options={simulatorRoster.umas.map(uma => ({value:uma.id,label:uma.name}))}/></div>{/if}
      <RunnerSummary runner={simulatorUmaSummary(uma, 0, course)} layout="row" showScore={false} labelStats={false}/>
      <Button size="sm" variant="secondary" onclick={async () => { await ensureSimulatorRoster().catch(() => {}); umaOpen = true; }}>Edit Uma</Button>
    </div>
  {/if}
  {@render children()}
</div>
<SimulatorUmaEditor {uma} bind:open={umaOpen} onsave={value => { simulatorRoster.umas = simulatorRoster.umas.map(item => item.id === value.id ? value : item); simulatorRoster.configured = true; }}/>
<Dialog open={!!panel} title={panel?.label ?? 'Setup'} maxWidth="900px" maxHeight="90dvh" onclose={() => panelId = ''}>
  {#if panel}{@render panel.content()}{/if}
  {#snippet actions()}<Button onclick={() => panelId = ''}>Done</Button>{/snippet}
</Dialog>

<style>
  .uma-picker{width:160px;max-width:100%}
  .workspace{display:grid;gap:12px;min-width:0}.workspace-head,.setup-actions,.uma-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.workspace-head{justify-content:space-between;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)}
  nav{display:flex;gap:4px;min-width:0}nav a{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:var(--radius-md);color:var(--text-secondary);text-decoration:none;font-size:12px;font-weight:600;white-space:nowrap}nav a:hover{background:var(--surface-3);color:var(--text-primary)}nav a.active{background:var(--color-accent-soft);color:var(--accent-primary)}
  .uma-row{padding:14px 18px;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);container-type:inline-size}.uma-row :global(.runner-summary){flex:1;min-width:240px}.uma-row :global(.runner-summary.row){grid-template-columns:minmax(0,1fr) 270px}.uma-row :global(.runner-summary .portrait){height:76px}.uma-row :global(.runner-summary .veteran-identity){grid-template-columns:64px minmax(0,1fr) auto}.uma-row :global(.runner-summary .identity h3){font-size:16px}.uma-row :global(.values.compact dd){font-size:13px}.uma-row :global(.values.compact img){width:14px;height:14px}
  @media(max-width:900px){.uma-row :global(.runner-summary.row){grid-template-columns:minmax(0,1fr)}.uma-row :global(.summary-build){margin-left:72px}.uma-row :global(.race-aptitudes){justify-content:flex-start}}
  @media(max-width:500px){.workspace{gap:14px}nav{width:100%;gap:3px}nav a{justify-content:center;flex:1;padding:9px 7px;font-size:11px;gap:5px}.uma-row{padding:10px}.uma-row :global(.runner-summary){flex-basis:100%;min-width:0}}
</style>
