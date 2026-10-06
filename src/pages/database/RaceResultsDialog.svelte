<script lang="ts">
  import { onMount } from 'svelte';
  import Artwork from '@/components/Artwork.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import RaceBadge from '@/components/RaceBadge.svelte';
  import RaceSchedule from '@/components/RaceSchedule.svelte';
  import { loadRaceHistory, raceHistorySchedule, type RaceHistoryEntry } from '@/lib/catalog/race-catalog';

  interface Props { open?: boolean; charId: number; charName: string; charImage?: string; winSaddleIds: number[]; runRaceIds: number[]; }
  let { open = $bindable(false), charId, charName, charImage, winSaddleIds, runRaceIds }: Props = $props();
  let viewMode = $state<'grid' | 'list'>('grid');
  let entries = $state<RaceHistoryEntry[]>([]);
  let loading = $state(false);
  let error = $state('');
  let retry = $state(0);
  const schedule = $derived(raceHistorySchedule(entries));

  onMount(() => { if (matchMedia('(max-width: 768px)').matches) viewMode = 'list'; });
  $effect(() => {
    void retry;
    if (!open) return;
    let current = true;
    loading = true; error = '';
    void loadRaceHistory(winSaddleIds, runRaceIds)
      .then((value) => { if (current) entries = value; })
      .catch(() => { if (current) error = 'Race data could not be loaded. Your Veteran has not been changed.'; })
      .finally(() => { if (current) loading = false; });
    return () => { current = false; };
  });
  function exportHistory(): void {
    const payload = entries.map((entry) => ({ raceName: entry.name, grade: entry.grade, year: entry.yearLabel, turn: `${String(entry.month).padStart(2, '0')}_${String(entry.half).padStart(2, '0')}`, position: entry.position }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `race-history-${charName.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
</script>

<div class="race-history-dialog">
<Dialog bind:open title="Race History" maxWidth="1180px" contentPadding="8px 16px">
  {#snippet headerIdentity(titleId)}
    <div class="character"><Artwork src={charImage} alt={charName || `Character ${charId}`} shape="circle" size="sm"/><span><h2 id={titleId}>Race History</h2><small>{charName} &middot; {entries.length} recorded race{entries.length === 1 ? '' : 's'}</small></span></div>
  {/snippet}
  {#snippet headerActions()}
    <Button variant={viewMode==='grid' ? 'primary' : 'secondary'} size="sm" icon="calendar" ariaLabel="Schedule view" ariaPressed={viewMode==='grid'} onclick={()=>viewMode='grid'}/>
    <Button variant={viewMode==='list' ? 'primary' : 'secondary'} size="sm" icon="menu" ariaLabel="List view" ariaPressed={viewMode==='list'} onclick={()=>viewMode='list'}/>
    <Button variant="secondary" size="sm" icon="download" ariaLabel="Export race history" onclick={exportHistory} disabled={!entries.length}>Export</Button>
  {/snippet}
  {#if open}{#if loading}<p class="state">Loading race history…</p>
  {:else if error}<Banner title="Race history unavailable" tone="danger"><p>{error}</p><Button variant="secondary" size="sm" onclick={() => retry++}>Retry race history</Button></Banner>
  {:else if !entries.length}<p class="state">No race history is available for this Veteran.</p>
  {:else if viewMode === 'grid'}<div class="calendar"><RaceSchedule years={schedule} label={`${charName} race history`}/></div>
  {:else}<div class="race-list">{#each entries as entry (`${entry.year}:${entry.month}:${entry.half}:${entry.raceInstanceId}`)}<article><time>{entry.yearLabel}<small>{entry.turnLabel}</small></time><span class:won={entry.won} class:second={entry.position === 2} class:third={entry.position === 3} class="position"><Icon name="trophy" size={14}/>{entry.position}{entry.position === 1 ? 'st' : entry.position === 2 ? 'nd' : entry.position === 3 ? 'rd' : 'th'}</span><RaceBadge race={entry} compact/><strong>{entry.name}</strong></article>{/each}</div>{/if}
  {/if}
</Dialog>
</div>

<style>
  .race-history-dialog :global(.dialog-panel>header){min-height:56px;padding:8px 12px;align-items:center}.character{min-width:0;display:flex;align-items:center;gap:8px}.character>span{min-width:0;display:grid}.character h2{margin:0;font-size:14px}.character small{color:var(--text-secondary);font-size:10px}.race-history-dialog :global(.header-actions){gap:4px}
  .calendar{max-height:65dvh;overflow:auto}.race-list{display:grid}.race-list article{min-width:0;min-height:42px;display:grid;grid-template-columns:106px 45px 100px minmax(0,1fr);align-items:center;gap:7px;padding:5px;border-bottom:1px solid var(--border-subtle)}.race-list time{display:grid;color:var(--text-secondary);font-size:9px}.race-list time small{font-size:8px}.position{display:flex;align-items:center;gap:3px;color:var(--text-secondary);font-size:9px;font-weight:800}.position.won{color:#ffd54f}.position.second{color:#c7d0d9}.position.third{color:#cd8b62}.race-list strong{overflow:hidden;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.state{padding:20px;color:var(--text-secondary);text-align:center}
  @media(max-width:600px){.race-list article{grid-template-columns:78px 39px 82px minmax(0,1fr);gap:4px;padding-inline:2px}.race-list strong{font-size:9px}}
  @media(max-width:600px){.race-history-dialog :global(.dialog-panel>header){flex-wrap:wrap}.race-history-dialog :global(.header-identity){flex-basis:calc(100% - 50px)}.race-history-dialog :global(.header-actions){order:2;width:100%;justify-content:flex-start}}
</style>
