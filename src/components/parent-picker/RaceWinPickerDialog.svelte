<script lang="ts">
  import { onMount } from 'svelte';
  import { assignRaceWinSlots, loadRaceSaddleIndex, loadRaceSchedule } from '@/lib/catalog/race-catalog';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import RaceSchedule from '@/components/RaceSchedule.svelte';
  import TextField from '@/components/TextField.svelte';
  import type { RaceScheduleYear } from '@/components/race-types';
  interface Props { open?: boolean; charName?: string; winSaddleIds: number[]; onconfirm: (wins: number[]) => void; }
  let { open = $bindable(false), charName, winSaddleIds, onconfirm }: Props = $props();
  const id = $props.id();
  let draft = $state<number[]>([]);
  let query = $state('');
  let races = $state.raw<RaceScheduleYear[]>([]);
  let saddles = $state(new Map<number, number[]>());
  let loading = $state(false);
  let error = $state('');
  const selected = $derived(assignRaceWinSlots(races, saddles, draft));
  const selectedKeys = $derived(selected.map(entry => entry.key));
  const choices = $derived(races.map(year => ({...year,slots:year.slots.map(slot => ({...slot,races:slot.races.filter(race => selectedKeys.includes(`${slot.id}:${race.id}`) || race.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))}))})));
  async function load(): Promise<void> {
    if (loading) return;
    loading = true; error = '';
    try { [races,saddles] = await Promise.all([loadRaceSchedule(),loadRaceSaddleIndex()]); }
    catch { error = 'Race data could not be loaded. Your selection has not been changed.'; }
    finally { loading = false; }
  }
  onMount(() => { draft = [...winSaddleIds]; void load(); });
</script>

<Dialog mobileFill bind:open title="Select Race Wins" description={charName} maxWidth="1100px" maxHeight="85dvh" mobileInset="16px">
  <TextField id={`${id}-search`} label="Search races" bind:value={query} type="search"/>
  {#if loading}<p>Loading races…</p>{:else if error}<Banner tone="danger" title="Race data unavailable"><p>{error}</p><Button onclick={load}>Retry</Button></Banner>{:else}
    <div class="race-calendar"><RaceSchedule years={choices} selectable {selectedKeys} onselect={(race, slotId) => {
      const entry = selected.find(entry => entry.key === `${slotId}:${race.id}`);
      if (entry) draft = draft.filter((_, index) => index !== entry.winIndex);
      else {
        const saddleId = saddles.get(Number(race.id))?.[0];
        if (saddleId !== undefined) draft = [...draft, saddleId];
      }
    }}/></div>
  {/if}
  {#snippet actions()}<span>{selected.length} race{selected.length === 1 ? '' : 's'} selected</span><Button disabled={loading || !!error} icon="check" onclick={() => { onconfirm([...draft]); open = false; }}>Confirm</Button>{/snippet}
</Dialog>

<style>
  .race-calendar{min-width:0;margin-top:10px}p{color:var(--text-muted)}
</style>
