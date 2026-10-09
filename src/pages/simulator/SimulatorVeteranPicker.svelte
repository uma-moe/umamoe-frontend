<script lang="ts">
  import { getAuthToken } from '@/services/auth/auth-token';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import { deviceVeteranParents } from '@/pages/veterans/veteran-library';
  import { profileRepository, type ProfileVeteran } from '@/pages/profile/profile-repository';
  import { loadCharacterCatalog, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { mergeVeterans } from '@/lib/veterans/veteran-profile';
  import RunnerSummary from '@/pages/competitive/RunnerSummary.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import { simulatorUmaFromVeteran, simulatorUmaSummary, type SimulatorUma } from './simulator-uma';
  import { selectedCourse } from './simulator-session.svelte';

  let { open = $bindable(false), onselect, onselectMany }: { open?: boolean; onselect: (uma: SimulatorUma) => void; onselectMany?: (umas:SimulatorUma[]) => void } = $props();
  let accountId = $state(''), query = $state(''), error = $state(''), loading = $state(false);
  let veterans = $state.raw<ProfileVeteran[]>([]), characters = $state.raw<Map<number, CharacterCatalogEntry>>(new Map());
  const uid = $props.id();
  $effect(() => { if (open) { accountId = $activeWorkspace.accountId ?? ''; query = ''; } });
  $effect(() => {
    if (!open || !$authReady) return;
    const id = accountId, token = getAuthToken(); $authUser;
    let active = true; loading = true; error = ''; veterans = [];
    void Promise.all([
      deviceVeteranParents(),
      id ? profileRepository.load(id) : Promise.resolve(undefined),
      loadCharacterCatalog()
    ]).then(([local, remote, catalog]) => {
      if (!active || token !== getAuthToken()) return;
      characters = catalog;
      veterans = mergeVeterans(remote?.veterans ?? [], local.filter(veteran => (veteran.trainer_id ?? '') === id));
    }).catch(reason => { if (active) error = reason instanceof Error ? reason.message : 'Could not load veterans.'; })
      .finally(() => { if (active) loading = false; });
    return () => { active = false; };
  });
  const available = $derived(veterans.filter(veteran => [veteran.speed, veteran.stamina, veteran.power, veteran.guts, veteran.wiz].every(value => value != null)));
  const matches = $derived(available.filter(veteran =>
    `${characters.get(veteran.card_id ?? 0)?.name ?? ''} ${veteran.id}`.toLowerCase().includes(query.toLowerCase())));
  function choose(veteran: ProfileVeteran) {
    try { onselect(simulatorUmaFromVeteran(veteran, characters.get(veteran.card_id ?? 0)?.name ?? 'Veteran')); open = false; }
    catch (reason) { error = (reason as Error).message; }
  }
</script>

<Dialog bind:open title="Import a veteran" icon="veterans" maxWidth="780px" maxHeight="88dvh">
  <div class="filters">
    <SelectField id="{uid}-account" label="Collection" value={accountId} onchange={value => accountId = value}
      options={$workspaces.map(workspace => ({ value: workspace.accountId ?? '', label: workspace.label }))}/>
    <TextField id="{uid}-search" label="Search veterans" hideLabel placeholder="Search by name…" bind:value={query}/>
  </div>
  {#if veterans.length > available.length}<p class="hint">{veterans.length - available.length} records lack trained stats and cannot be simulated.</p>{/if}
  {#if loading}<Spinner centered label="Loading veterans…"/>
  {:else if error}<p role="alert">{error}</p>
  {:else if !matches.length}<p class="hint">{veterans.length ? 'No veterans match your search.' : 'No veterans in this collection yet. Import a game export on the Veterans page.'}</p>
  {:else}
    <div class="veterans">
      {#each matches.slice(0, 100) as veteran (veteran.id)}
        <button class="veteran" onclick={() => choose(veteran)} aria-label={'Import '+(characters.get(veteran.card_id ?? 0)?.name ?? 'veteran')}>
          <RunnerSummary runner={simulatorUmaSummary(simulatorUmaFromVeteran(veteran, characters.get(veteran.card_id ?? 0)?.name ?? 'Veteran'), 0, selectedCourse())}
            layout="row" labelStats={false} showScore={false}/><span class="add">+</span>
        </button>
      {/each}
    </div>
    {#if matches.length > 100}<p class="hint">Showing the first 100 matches. Search to narrow the collection.</p>{/if}
  {/if}
  {#snippet actions()}{#if onselectMany}<Button disabled={loading || !available.length} onclick={() => { try { onselectMany?.(available.map(veteran => simulatorUmaFromVeteran(veteran,characters.get(veteran.card_id ?? 0)?.name ?? 'Veteran'))); open=false; } catch(reason) { error=(reason as Error).message; } }}>Use entire collection ({available.length})</Button>{/if}<Button href="/veterans" variant="secondary">Manage veterans</Button><Button variant="secondary" onclick={() => open = false}>Close</Button>{/snippet}
</Dialog>
<style>
  .filters{display:grid;grid-template-columns:180px minmax(0,1fr);align-items:end;gap:12px;margin-bottom:12px}.veterans{display:grid;min-width:0}
  .veteran{display:flex;align-items:center;gap:12px;min-width:0;container-type:inline-size;width:100%;padding:8px 0;border:0;border-bottom:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}
  .veteran:last-child{border-bottom:0}.veteran:hover{background:var(--surface-2)}.veteran:focus-visible{outline:2px solid var(--accent-primary)}.add{color:var(--accent-primary);font-size:22px}.hint{font-size:12px;color:var(--text-secondary)}
  @media(max-width:500px){.filters{grid-template-columns:1fr}}
</style>
