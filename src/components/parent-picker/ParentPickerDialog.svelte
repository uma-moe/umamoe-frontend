<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  import { onMount, untrack } from 'svelte';
  import { loadCharacterCatalog, loadReleasedCharacterCatalog, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { watchFactorCatalog, factorCatalogState } from '@/lib/catalog/factor-catalog';
  import SparkFilterDialog from './SparkFilterDialog.svelte';
  import FilterChip from '@/components/FilterChip.svelte';
  import { loadG1SaddleGroups } from '@/lib/catalog/race-catalog';
  import { accountParent, inheritanceParent, manualParent, parseManualParents, filterParents, groupParentFilters, parentAffinityDetails, parentCharacter, parentPickerSessions, MANUAL_PARENTS_KEY, type ManualParent, type ParentPickerState, type ParentFactorFilter, type SelectableParent } from '@/lib/veterans/parent-picker';
  import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace, selectWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import { mergeVeterans } from '@/lib/veterans/veteran-profile';
  import { deviceParent } from '@/lib/veterans/parent-picker';
  import { draftScope, veteranDrafts, veteranLibraryRevision } from '@/pages/veterans/veteran-library';
  import VeteranCollection from '@/pages/veterans/VeteranCollection.svelte';
  import { profileRepository } from '@/pages/profile/profile-repository';
  import { inheritanceRepository } from '@/pages/database/inheritance-repository';
  import { partnerRepository, type PartnerPhase } from './partner-repository';
  import ParentPickerRow from './ParentPickerRow.svelte';
  import ManualParentEditor from './ManualParentEditor.svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectFieldSlim from '@/components/SelectFieldSlim.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import TextField from '@/components/TextField.svelte';
  interface Props { open?: boolean; targetId?: number; selectedAccountId?: string; sessionScope?: string; onselect: (parent: SelectableParent) => void; }
  let { open = $bindable(false), targetId, selectedAccountId = '', sessionScope, onselect }: Props = $props();
  const id = $props.id();
  let sparkView = $state('combined');
  let pickerState = $state<ParentPickerState>({tab:'veterans',accountId:'',query:'',sort:'total',factors:[]});
  const factorGroups = $derived(groupParentFilters(pickerState.factors));
  const groupLabels = {blue:'Blue stats',pink:'Aptitude',green:'Unique',white:'Skill / race'};
  let factorDraft = $state<ParentFactorFilter>(), factorEditIndex = -1;
  function editFactor(index = -1) {
    factorEditIndex = index;
    factorDraft = index < 0 ? {factorId:0,scope:'combined',minLevel:1,maxLevel:9} : {...pickerState.factors[index]!};
  }
  function applyFactor(filter: ParentFactorFilter) {
    pickerState.factors = factorEditIndex < 0 ? [...pickerState.factors,filter] : pickerState.factors.map((entry,index) => index === factorEditIndex ? filter : entry);
    factorDraft = undefined;
  }
  let characters = $state.raw(new Map<number,CharacterCatalogEntry>()); let engine = $state<VeteranAffinityEngine>(); let groups = $state.raw(new Map<number,number>());
  let selectableCharacters = $state.raw<CharacterCatalogEntry[]>([]);
  let catalogError = $state(''); 
  let veterans = $state.raw<Record<string,SelectableParent[]>>({}); let bookmarks = $state.raw<SelectableParent[]>([]); let partners = $state.raw<SelectableParent[]>([]);
  let busy = $state<Record<string,boolean>>({}); let errors = $state<Record<string,string>>({}); let manuals = $state<ManualParent[]>([]); let manualReadError = $state('');
  let editing = $state(false); let editedEntry = $state<ManualParent>(); let manualError = $state('');
  let partnerId = $state(''); let partnerPhase = $state<PartnerPhase>(); let lookupResult = $state<SelectableParent>(); let lookupError = $state(''); let lookupTimedOut = $state(false); let lookupController: AbortController | undefined;
  let accountGeneration=0; let partnerReloadPending=false; let live=true;
  const accountRequests = new Map<string, number>();
  const sortOptions = $derived([{value:'total',label:'Total'},...(targetId?[{value:'affinity',label:'Affinity'}]:[]),{value:'creation_time',label:'Newest first'},{value:'blue',label:'Blue ★'},{value:'pink',label:'Pink ★'},{value:'green',label:'Green ★'},{value:'name',label:'Name'}]);
  const scope = $derived(draftScope(pickerState.accountId, $authUser?.id));
  const collection = $derived(mergeVeterans(veterans[pickerState.accountId] ?? [], ($veteranDrafts[scope] ?? []).map(record => deviceParent(record, pickerState.accountId))).map(veteran => accountParent(veteran, pickerState.accountId)));
  const current = $derived(pickerState.tab==='veterans' ? collection : pickerState.tab==='bookmarks' ? bookmarks : pickerState.tab==='manual' ? manuals.map(manualParent) : partners);
  const name = (parent: SelectableParent) => `${parentCharacter(parent,characters).name} ${parent.name??''}`;
  const affinities = $derived(new Map(current.map(parent=>[parent.pickerId,parentAffinityDetails(parent,targetId,engine,groups)])));
  const scores = $derived(new Map([...affinities].map(([id,score])=>[id,score ? score.parentOne.total+score.race.p1Left+score.race.p1Right : 0])));
  const filtered = $derived(filterParents(current,pickerState,name,(parent)=>scores.get(parent.pickerId)??0));
  const loadKey = $derived(pickerState.tab==='veterans'?`account:${pickerState.accountId}`:pickerState.tab);
  const loading = $derived(busy[loadKey]);
  const error = $derived(errors[loadKey]);
  const emptyCollection = $derived(pickerState.tab==='veterans' && !current.length && !pickerState.query && !pickerState.factors.length && !loading && !error);
  const tabs = $derived([{id:'veterans',label:'Veterans',icon:'users' as const,badge:String(collection.length)},{id:'bookmarks',label:'Bookmarks',icon:'book' as const,badge:String(bookmarks.length)},{id:'saved',label:'Partner',icon:'connect' as const,badge:busy.saved?'...':String(partners.length)},{id:'manual',label:'Manual',icon:'edit' as const,badge:String(manuals.length)}]);
  function message(error: unknown): string { return error instanceof Error?error.message:'Please try again.'; }
  function choose(parent: SelectableParent): void { onselect(parent); open=false; }
  function clearSparkFilters(): void { pickerState.factors=[];pickerState.factorOperators={}; }
  function clearFilters(): void { pickerState.query='';clearSparkFilters(); }
  async function loadCatalogs(): Promise<void> {
    catalogError='';
    const results=await Promise.allSettled([loadCharacterCatalog(),veteranAffinityRepository.load(),loadG1SaddleGroups(),loadReleasedCharacterCatalog()]);
    if(!live)return;
    if(results[0].status==='fulfilled')characters=results[0].value;
    if(results[1].status==='fulfilled')engine=new VeteranAffinityEngine(results[1].value);
    if(results[2].status==='fulfilled')groups=results[2].value;
    if(results[3].status==='fulfilled') {
      selectableCharacters=results[3].value;
      const released=new Map(selectableCharacters.map(character=>[Number(character.id),character] as const));
      characters=new Map([...released,...[...characters].filter(([id])=>!released.has(id))]);
    }
    if(results.some((result)=>result.status==='rejected'))catalogError='Some character or affinity resources could not be loaded. Your saved entries have not been changed.';
  }
  async function loadAccount(account: string, refresh=false): Promise<void> {
    const key=`account:${account}`;if(!account||!refresh&&(busy[key]||veterans[account]))return;
    const request=(accountRequests.get(account)??0)+1;accountRequests.set(account,request);
    const generation=accountGeneration;busy[key]=true;errors[key]='';
    const current=()=>live&&generation===accountGeneration&&accountRequests.get(account)===request;
    try { const result=await profileRepository.load(account,refresh);if(current())veterans={...veterans,[account]:(result.veterans??[]).map((veteran)=>accountParent(veteran,account))}; }
    catch(error){if(current())errors[key]=message(error);}
    finally{if(current())busy[key]=false;}
  }
  async function loadBookmarks(): Promise<void> {
    const generation=accountGeneration;busy.bookmarks=true;errors.bookmarks='';
    try { const result=await inheritanceRepository.bookmarks();if(live&&generation===accountGeneration)bookmarks=result.map((record)=>inheritanceParent(record,'bookmark')); }
    catch(error){if(live&&generation===accountGeneration)errors.bookmarks=message(error);}
    finally{if(live&&generation===accountGeneration)busy.bookmarks=false;}
  }
  async function loadPartners(refresh=false): Promise<void> {
    if(busy.saved){if(refresh)partnerReloadPending=true;return;}
    const generation=accountGeneration;busy.saved=true;errors.saved='';
    try { await partnerRepository.migrateAnonymous();const result=await partnerRepository.saved();if(live&&generation===accountGeneration)partners=result; }
    catch(error){if(live&&generation===accountGeneration)errors.saved=message(error);}
    finally{if(live&&generation===accountGeneration){busy.saved=false;if(partnerReloadPending){partnerReloadPending=false;void loadPartners();}}}
  }
  function retry(): void { if(pickerState.tab==='veterans')void loadAccount(pickerState.accountId,true);else if(pickerState.tab==='bookmarks')void loadBookmarks();else if(pickerState.tab==='saved')void loadPartners(); }
  function saveManual(next: ManualParent[]): boolean {
    if(manualReadError)return false;
    try{localStorage.setItem(MANUAL_PARENTS_KEY,JSON.stringify(next));manuals=next;manualError='';return true;}
    catch{manualError='Could not save manual entries. Browser storage is unavailable or full. Your changes remain in the editor.';return false;}
  }
  async function deleteParent(parent: SelectableParent): Promise<void> {
    if(parent.share_source==='manual'){saveManual(manuals.filter((entry)=>entry.id!==parent.share_local_id));return;}
    try{await partnerRepository.remove(parent);if(!live)return;partners=partners.filter((item)=>item.pickerId!==parent.pickerId);if(lookupResult?.pickerId===parent.pickerId)lookupResult=undefined;}
    catch(error){if(live)errors.saved=message(error);}
  }
  async function lookup(): Promise<void> {
    if(partnerPhase)return;lookupController?.abort();const controller=new AbortController();lookupController=controller;lookupError='';lookupTimedOut=false;lookupResult=undefined;
    try{
      const result=await partnerRepository.lookup(partnerId,controller.signal,(phase)=>{if(live&&!controller.signal.aborted)partnerPhase=phase;});
      if(!live||controller.signal.aborted)return;
      if(!result.parent)throw new Error('Lookup completed without inheritance data. Please try again.');
      if(result.willPersist)await loadPartners(true);else lookupResult=result.parent;
    }
    catch(error){if(live&&!controller.signal.aborted){lookupError=message(error);lookupTimedOut=error instanceof Error&&error.name==='TimeoutError';}}
    finally{if(live&&lookupController===controller)partnerPhase=undefined;}
  }
  function clearPartnerId(): void { lookupController?.abort();partnerId='';partnerPhase=undefined;lookupError='';lookupTimedOut=false; }
  function inputPartnerId(event: Event): void { const input=event.currentTarget as HTMLInputElement;input.value=input.value.replace(/\D/g,'').slice(0,12);partnerId=input.value; }
  onMount(watchFactorCatalog);
  onMount(()=>{
    const saved=sessionScope?parentPickerSessions.get(sessionScope):undefined;
    pickerState=saved?structuredClone(saved):{tab:'veterans',accountId:selectedAccountId,query:'',sort:targetId?'affinity':'total',factors:[]};
    if(!targetId&&pickerState.sort==='affinity')pickerState.sort='total';
    try{manuals=parseManualParents(localStorage.getItem(MANUAL_PARENTS_KEY));}catch(error){manualReadError=message(error);}
    void loadCatalogs();return()=>{live=false;accountGeneration++;lookupController?.abort();};
  });
  $effect(()=>{
    const user=$authUser;accountGeneration++;
    untrack(()=>{veterans={};bookmarks=[];partners=[];busy={};errors={};partnerReloadPending=false;lookupController?.abort();lookupResult=undefined;partnerPhase=undefined;lookupError='';lookupTimedOut=false;if(user){void loadBookmarks();void loadPartners();}});
  });
  $effect(() => { pickerState.accountId = $authUser ? $activeWorkspace.accountId ?? '' : ''; });
  $effect(()=>{const account=pickerState.accountId; const revision=$veteranLibraryRevision; if($authReady&&$authUser&&account)untrack(()=>void loadAccount(account,revision>0));});
  $effect(()=>{JSON.stringify(pickerState);if(sessionScope)parentPickerSessions.set(sessionScope,JSON.parse(JSON.stringify({...pickerState,factors:pickerState.factors.filter((factor)=>factor.factorId)})));});
</script>

<div class="parent-picker"><Dialog bind:open title="Select Parent" icon="veterans" maxWidth="1280px" height="var(--parent-picker-height)" maxHeight="var(--parent-picker-height)" mobileInset="16px" contentPadding="0" mobileContentPadding="0">
  {#snippet headerActions()}{#if $authUser && $workspaces.length > 1}<SegmentedControl label="Linked account" options={$workspaces.map(workspace => ({value:workspace.id,label:workspace.kind === 'local' ? 'This device' : workspace.label}))} value={$activeWorkspace.id} onchange={selectWorkspace}/>{/if}{/snippet}
  <VeteranCollection compact showAccountSwitch={false} empty={emptyCollection} onnavigate={() => open=false} onimport={() => { pickerState.tab='veterans'; }}>{#snippet children(dropZone, chooseFile)}<div class="picker-layout">
    <Tabs items={tabs} bind:value={pickerState.tab} label="Veteran picker sections" variant="underline"/>
    <div class="filterbar">
      <div class="parent-search"><TextField id={id+'-search'} label="Search parents" hideLabel placeholder={pickerState.tab==='bookmarks'||pickerState.tab==='saved'?'Search Uma or username…':'Search veterans…'} prefixIcon="search" bind:value={pickerState.query}/>{#if pickerState.query}<IconButton icon="close" label="Clear parent search" onclick={()=>pickerState.query=''}/>{/if}</div>
      <span class="result-count" role="status">{filtered.length} {filtered.length===1?'result':'results'}</span>
      <div class="parent-sort"><SelectFieldSlim id={id+'-sort'} label="Sort parents" hideLabel options={sortOptions} bind:value={pickerState.sort}/></div>
      <div class="parent-actions">{#if pickerState.tab==='veterans'}<IconButton icon="upload" label="Upload veteran JSON" onclick={chooseFile}/>{/if}
        {#if pickerState.tab==='manual'&&!editing}<Button icon="add" size="sm" variant="secondary" disabled={!!manualReadError} onclick={()=>{editedEntry=undefined;editing=true;}}>Add</Button>{/if}</div>
    </div>
    <div class="picker-body">
    <div class="active-filters" aria-label="Spark filters">
      {#if factorGroups.length}<div class="spark-filter-groups">
        {#each factorGroups as group (group.tone)}
          <section class="spark-filter-group selected-factor--{group.tone}" aria-label={groupLabels[group.tone]+' filters'}>
            <div class="group-filters">
              {#each group.entries as {filter:factor,index,resolved} (index)}
                {@const max = factor.maxLevel ?? (factor.scope === 'combined' ? 9 : 3)}
                <div class="selected-factor selected-factor--{resolved.tone}" role="group" aria-label={resolved.name+' spark filter '+(index+1)}>
                  <FilterChip label={resolved.name+' · '+({combined:'Combined',any:'Any slot',own:'Own',p1:'P1',p2:'P2'}[factor.scope])+' '+factor.minLevel+(max === factor.minLevel ? '' : '–'+max)+'★'} selected removable onclick={() => editFactor(index)} onremove={()=>pickerState.factors=pickerState.factors.filter((_,i)=>index!==i)}/>
                </div>
              {/each}
            </div>
            {#if group.entries.length > 1}<SegmentedControl label={groupLabels[group.tone]+' matching'} options={[{value:'and',label:'AND'},{value:'or',label:'OR'}]} value={pickerState.factorOperators?.[group.tone] ?? 'and'} onchange={value => pickerState.factorOperators={...pickerState.factorOperators,[group.tone]:value as 'and'|'or'}}/>{/if}
          </section>
        {/each}
      </div>{/if}
      <div class="spark-search">
        <Button variant="secondary" size="sm" icon="add" onclick={() => editFactor()}>Add Spark</Button>
      </div>
      <div class="spark-display"><SegmentedControl label="Parent spark display" options={[{value:'split',label:'Split'},{value:'combined',label:'Combined'}]} bind:value={sparkView}/></div>
      {#if pickerState.factors.length}<div class="clear-sparks"><Button variant="ghost" size="sm" onclick={clearSparkFilters}>Clear all</Button></div>{/if}
    </div>
      <div class="picker-results">
      {#if catalogError}<Banner tone="warning" title="Some resources are unavailable"><p>{catalogError}</p><Button variant="secondary" onclick={loadCatalogs}>Retry resources</Button></Banner>{/if}
      {#if pickerState.tab==='saved'}
        <section class="partner-lookup" aria-label="Look up practice partner">
          <h3><Icon name="search" size={16}/>Look up practice partner</h3>
          <form onsubmit={(event)=>{event.preventDefault();void lookup();}}>
            <div class="partner-input"><TextField id={`${id}-partner`} label="Practice or trainer ID" hideLabel prefixIcon="tag" placeholder="Practice ID (9 digits) or Trainer ID (12 digits)" inputmode="numeric" maxlength={12} bind:value={partnerId} oninput={inputPartnerId}/>{#if partnerId}<IconButton icon="close" label="Clear partner ID" onclick={clearPartnerId}/>{/if}</div>
            <Button type="submit" icon="search" disabled={!/^(?:\d{9}|\d{12})$/.test(partnerId)||!!partnerPhase}>Fetch</Button>
          </form>
          <div class="partner-hints"><span><strong>Practice ID:</strong> 9-digit code from the in-game share button · expires after 24h</span><span><strong>Trainer ID:</strong> permanent 12-digit account ID · can be anyone's</span></div>
          {#if !$authUser}<p class="signin-notice"><Icon name="info" size={16}/><span>Sign in to keep fetched partners saved to your account across devices.</span></p>{/if}
        </section>
      {/if}
      {#if pickerState.tab==='manual'}
        {#if manualReadError||manualError}<Banner title="Manual entries unavailable" tone="danger"><p>{manualReadError||manualError}</p></Banner>{/if}
        {#if editing}<ManualParentEditor entry={editedEntry} {characters} {selectableCharacters} {targetId} {engine} oncancel={()=>editing=false} onsave={(entry)=>{if(saveManual(editedEntry?manuals.map(item=>item.id===entry.id?entry:item):[entry,...manuals]))editing=false;}}/>{/if}
      {/if}
      {#if pickerState.tab==='saved'&&partnerPhase}<div class="empty" role="status"><Spinner/><h3>{partnerPhase==='queued'?'Request queued…':partnerPhase==='pending'?'Waiting for a worker to pick up the task…':'Worker is retrieving inheritance data…'}</h3><p>This usually takes a few seconds.</p></div>
      {:else if pickerState.tab==='saved'&&lookupError}<div class="empty lookup-error" role="alert"><Icon name="warning" size={48}/><h3>{lookupTimedOut?'No response - timed out':'Fetch failed'}</h3><p>{lookupError}</p></div>
      {:else if loading}<div class="empty" role="status"><Spinner/>{pickerState.tab==='saved'?'Loading saved partners...':`Loading ${pickerState.tab==='veterans'?'veterans':'bookmarks'}…`}</div>
      {:else if error}<Banner title="Parents could not be loaded" tone="danger"><p>{error}</p><Button variant="secondary" onclick={retry}>Retry</Button></Banner>
      {:else if pickerState.tab==='veterans'&&!filtered.length&&(pickerState.query||pickerState.factors.length)}<div class="empty"><Icon name="users" size={48}/><h3>No veterans match your filters</h3><Button variant="secondary" onclick={clearFilters}>Clear filters</Button></div>
      {:else if pickerState.tab==='bookmarks'&&!$authUser}<div class="empty"><Icon name="book" size={48}/><h3>Sign in to use bookmarks</h3><p>Bookmark veterans from the Inheritance Database to find them here quickly. Sign in using the button in the top navigation bar.</p></div>
      {:else}
        {#if pickerState.tab==='saved'&&lookupResult}<h3 class="partner-heading"><Icon name="search" size={16}/>Lookup result</h3><ParentPickerRow parent={lookupResult} {characters} affinity={parentAffinityDetails(lookupResult,targetId,engine,groups)} combined={sparkView==='combined'} filters={pickerState.factors} onselect={()=>lookupResult&&choose(lookupResult)}/>{/if}
        {#if pickerState.tab==='saved'&&partners.length}<h3 class="partner-heading"><Icon name="save" size={16}/>Saved partners</h3>{/if}
        <div class="parent-list" role="list" aria-label="Available parents" use:virtualScroll={{ items: filtered, key: parent => parent.pickerId, root: 'closest', estimate: 180, onrange: range => virtualRange = range }}>{#each filtered.slice(virtualRange.start,virtualRange.end) as parent, index (parent.pickerId)}<div role="listitem" data-virtual-index={virtualRange.start + index} aria-posinset={virtualRange.start + index + 1} aria-setsize={filtered.length}><ParentPickerRow {parent} {characters} affinity={affinities.get(parent.pickerId)} combined={sparkView==='combined'} filters={pickerState.factors} onselect={()=>choose(parent)} onedit={parent.share_source==='manual'?()=>{editedEntry=manuals.find((entry)=>entry.id===parent.share_local_id);editing=true;}:undefined} ondelete={parent.share_source==='manual'||parent.share_source==='partner'&&!!$authUser?()=>deleteParent(parent):undefined}/></div>{/each}</div>
        {#if !filtered.length&&!editing&&!(pickerState.tab==='saved'&&lookupResult&&!partners.length)}<div class="empty" class:empty-upload={pickerState.tab==='veterans' && !current.length}>
          {#if current.length}<Icon name="search" size={48}/><h3>No results</h3><Button variant="secondary" onclick={clearFilters}>Clear filters</Button>
          {:else if pickerState.tab==='veterans'}{@render dropZone()}
          {:else if pickerState.tab==='bookmarks'}<Icon name="book" size={48}/><h3>No bookmarks yet</h3><p>Bookmark characters from the Inheritance Database and they will appear here for quick access.</p>
          {:else if pickerState.tab==='manual'}<h3>No saved entries</h3><p>Create manual entries to use characters without a linked game account.</p>
          {:else}<Icon name="users" size={48}/><h3>{$authUser?'No saved partners yet':'No lookup result yet'}</h3><p>Enter a Trainer ID above to fetch someone's inheritance data.</p>{/if}
        </div>{/if}
      {/if}
      </div>
    </div>
  </div>{/snippet}</VeteranCollection>
</Dialog></div>
{#if factorDraft}<SparkFilterDialog filter={factorDraft} {characters} {...$factorCatalogState} onapply={applyFactor} onclose={() => factorDraft = undefined}/>{/if}
<style>
  .parent-picker { --parent-picker-height:min(1000px,94dvh); --dialog-content-font:var(--font-sans); --control-height:34px; }
  @media(max-width:480px) { .parent-picker { --parent-picker-height:96dvh; } }
  .parent-picker > :global(dialog > .dialog-panel > header) { min-height:48px; height:48px; align-items:center; padding:0 8px 0 20px; border-bottom-color:var(--border-subtle); }
  .parent-picker > :global(dialog > .dialog-panel > header h2) { font-size:.95rem; font-weight:700; white-space:nowrap; }
  .parent-picker > :global(dialog > .dialog-panel > .content) { display:flex; min-height:0; overflow:hidden; padding:0; }
  .picker-layout { display:flex; flex-direction:column; min-width:0; min-height:0; width:100%; flex:1; }
  .parent-picker > :global(dialog > .dialog-panel > header .heading){flex:none}
  .parent-picker > :global(dialog > .dialog-panel > header .header-actions){flex:1;justify-content:flex-start;margin-left:8px}
  .parent-picker > :global(dialog > .dialog-panel > header .segments){padding:2px}
  .parent-picker > :global(dialog > .dialog-panel > header .segments button){min-height:30px;font-size:12px;white-space:nowrap}
  .signin-notice { display:flex; align-items:center; gap:8px; flex:none; padding:8px 16px; margin:0; border-bottom:1px solid rgb(33 150 243/.25); background:rgb(33 150 243/.1); color:rgb(var(--on-surface-rgb)/.75); font-size:.8rem; line-height:1.5; }
  .signin-notice :global(svg) { flex:none; color:var(--accent-blue-strong); }
  .parent-picker :global(.tabs) { flex:none; gap:0; border-color:var(--border-subtle); }
  .parent-picker :global(.tabs button) { min-width:0; min-height:40px; height:40px; gap:6px; font-size:.78rem; color:var(--text-muted); }
  .parent-picker :global(.tabs button.active) { color:var(--accent-primary); background:rgb(var(--accent-primary-rgb)/.06); }
  .parent-picker :global(.tabs small) { min-width:20px; margin:0; padding:0 5px; border:1px solid rgb(var(--accent-primary-rgb)/.32); border-radius:var(--radius-pill); background:rgb(var(--accent-primary-rgb)/.18); color:var(--accent-primary); font-size:.68rem; font-weight:700; line-height:1.6; }
  .parent-picker :global(.tabs button.active small) { background:rgb(var(--accent-primary-rgb)/.28); border-color:rgb(var(--accent-primary-rgb)/.5); }
  .filterbar { display:flex; align-items:center; gap:8px; padding:10px 12px; flex:none; }
  .parent-search { position:relative; min-width:0; flex:1; }
  .parent-search :global(input) { padding-right:34px; }
  .filterbar :global(input),.filterbar :global(.select-control) { font-size:12px; }
  .parent-search > :global(.icon-button) { position:absolute; top:0; right:0; width:var(--control-height); height:var(--control-height); border:0; background:transparent; }
  .parent-sort { flex:none; width:110px; }
  .spark-search { flex:none; }
  .spark-search :global(.ui-button) { min-height:var(--control-height); height:var(--control-height); padding:0 8px; border-radius:var(--radius-sm); font-size:11px; }
  .spark-search :global(svg) { width:14px; height:14px; }
  .parent-actions { display:flex; align-items:center; justify-content:flex-end; flex:0 0 64px; }.parent-actions :global(.icon-button),.parent-actions :global(.ui-button) { min-height:var(--control-height); height:var(--control-height); }.parent-actions :global(.icon-button) { width:var(--control-height); }
  .parent-actions :global(.ui-button) { padding:0 10px; font-size:12px; }
  .result-count { margin-left:auto; color:var(--text-muted); font-size:11px; white-space:nowrap; }
  .active-filters { --spark-filter-height:28px; --control-height:var(--spark-filter-height); display:flex; align-items:center; flex-wrap:wrap; gap:6px; padding:8px var(--picker-inset); margin:0 calc(-1 * var(--picker-inset)) 10px; border-block:1px solid var(--border-subtle); background:var(--bg-primary); }
  .spark-filter-groups { display:grid; gap:6px; width:100%; min-width:0; }
  .spark-filter-group { display:flex; align-items:flex-start; gap:8px; min-width:0; }
  .spark-filter-group :global(.segments) { flex:none; height:var(--spark-filter-height); padding:2px; }.spark-filter-group :global(.segments button) { min-height:0; padding:0 8px; font-size:11px; }
  .group-filters { flex:1; display:flex; flex-wrap:wrap; gap:4px; min-width:0; }
  .spark-display { margin-left:auto; }.spark-display :global(.segments) { padding:2px; height:var(--control-height); }.spark-display :global(.segments button) { min-height:0; padding:0 8px; font-size:11px; }
  .clear-sparks :global(.ui-button) { min-height:var(--control-height); padding:2px 6px; font-size:11px; }
  .picker-body { --picker-inset:12px; min-height:0; flex:1; overflow-y:auto; overscroll-behavior:contain; padding:0 var(--picker-inset) 12px; }
  .picker-results { min-width:0; }.parent-list { display:grid; gap:6px; min-width:0; }
  .selected-factor { --color-accent:var(--spark-white-text); --color-accent-soft:color-mix(in srgb,var(--color-accent) 10%,transparent); min-width:0; max-width:100%; }
  .selected-factor--blue { --color-accent:var(--accent-primary); }.selected-factor--pink { --color-accent:var(--color-pink); }.selected-factor--green { --color-accent:var(--accent-secondary); }
  .selected-factor :global(.wrap) { max-width:100%; }
  .selected-factor :global(button) { min-width:0; min-height:var(--control-height); padding:3px 8px; font-size:11px; text-align:left; overflow-wrap:anywhere; }
  .selected-factor :global(button:first-child) { border-radius:var(--radius-sm) 0 0 var(--radius-sm); }
  .selected-factor :global(button.remove) { flex:none; width:var(--control-height); padding:0; border-radius:0 var(--radius-sm) var(--radius-sm) 0; }
  .empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:60px 24px; text-align:center; color:var(--text-disabled); }
  .empty-upload{flex:1;justify-content:flex-start;padding:12px}
  .empty > :global(svg){opacity:.4}.empty h3{margin:0;font-size:.9rem;font-weight:600;line-height:1.5;color:inherit}.empty p{margin:0;font-size:.8rem;max-width:340px;line-height:1.5;opacity:.7}
  .partner-lookup{display:flex;flex-direction:column;gap:6px;padding:0 8px 6px;border-bottom:1px solid var(--border-subtle)}
  .partner-lookup h3{display:flex;align-items:center;gap:6px;margin:0 0 -2px;color:var(--text-disabled);font-size:.68rem;font-weight:600;line-height:1.5;letter-spacing:.07em;text-transform:uppercase}.partner-lookup h3 :global(svg){width:13px;height:13px;color:var(--accent-primary);opacity:.6}
  .partner-lookup form{display:flex;align-items:stretch;border:1px solid var(--border-primary);border-radius:var(--radius-md);overflow:hidden;background:var(--surface-2)}
  .partner-lookup form:focus-within{border-color:rgb(var(--accent-primary-rgb)/.45);box-shadow:0 0 0 3px rgb(var(--accent-primary-rgb)/.07)}
  .partner-input{position:relative;min-width:0;flex:1}.partner-input :global(input){height:33px;min-height:33px;border:0;background:transparent;box-shadow:none;border-radius:0;padding:0 33px 0 34px;font-family:Arial,sans-serif;font-size:.83rem;color:var(--text-primary)}.partner-input :global(input:focus){outline:0}
  .partner-input > :global(.icon-button){position:absolute;top:0;right:0;width:33px;height:33px;border:0;background:transparent}.partner-input :global(.prefix-icon){left:12px;width:15px;height:15px}
  .partner-lookup form > :global(.ui-button){height:auto;min-height:33px;padding:0 16px;border:0;border-left:1px solid var(--border-primary);border-radius:0;font-family:Arial,sans-serif;font-size:.8rem;font-weight:600;gap:5px;transform:none}.partner-lookup form > :global(.ui-button:disabled){opacity:.35}.partner-lookup form > :global(.ui-button svg){width:14px;height:14px}
  .partner-lookup form > :global(.ui-button:hover:not(:disabled):not([aria-disabled='true'])){transform:none}
  .partner-hints{display:flex;flex-wrap:wrap;gap:2px 14px;font-size:.7rem;line-height:1.4;color:var(--text-disabled)}.partner-hints strong{color:var(--text-secondary);font-weight:600}.partner-lookup .signin-notice{border:1px solid rgb(33 150 243/.2);border-radius:6px;padding:7px 10px;gap:7px;font-size:.75rem;line-height:1.4;color:var(--text-primary);background:rgb(33 150 243/.08)}.partner-lookup .signin-notice span{font-size:.73rem;opacity:.8}.partner-lookup .signin-notice :global(svg){width:14px;height:14px}
  .partner-heading{display:flex;align-items:center;gap:8px;margin:0;padding:8px 14px 6px;font-size:.78rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary)}.lookup-error{color:var(--color-danger)}.lookup-error> :global(svg){opacity:1}.lookup-error p{opacity:1}

  :global([data-theme='light']) .partner-input{background:white}:global([data-theme='light']) .partner-lookup h3{color:var(--text-muted)}:global([data-theme='light']) .partner-lookup .signin-notice{color:#1e3a8a;border-color:rgb(var(--accent-primary-rgb)/.25);background:rgb(var(--accent-primary-rgb)/.1)}
  :global([data-theme='light']) .empty{color:var(--text-muted)}:global([data-theme='light']) .empty > :global(svg){color:var(--accent-primary);opacity:1}:global([data-theme='light']) .empty p{color:var(--text-secondary);opacity:1}
  :global([data-theme='light']) .signin-notice { background:rgb(var(--accent-primary-rgb)/.1); border-color:rgb(var(--accent-primary-rgb)/.25); color:#1e3a8a; }

  @media (max-width:600px) {
    .partner-input :global(input),.partner-input > :global(.icon-button),.partner-lookup form > :global(.ui-button){height:var(--touch-target);min-height:var(--touch-target)}.partner-input > :global(.icon-button){width:var(--touch-target)}.partner-input :global(input){padding-right:44px}.partner-lookup{padding-inline:4px}
    .parent-picker{--control-height:var(--touch-target)}.parent-picker :global(.tabs button){min-height:var(--touch-target);height:auto}
    .parent-search > :global(.icon-button){width:var(--touch-target);height:var(--touch-target)}.parent-search :global(input){padding-right:44px}
    .active-filters{--spark-filter-height:32px}
  }
  @media(max-width:600px) {
    .parent-picker > :global(dialog > .dialog-panel > header){padding-left:12px;gap:6px}
    .parent-picker > :global(dialog > .dialog-panel > header .header-actions){margin-left:0}
    .parent-picker > :global(dialog > .dialog-panel > header .segments button){min-height:var(--touch-target)}
    .filterbar{gap:6px;padding:8px}.result-count{display:none}
    .picker-body{--picker-inset:8px;padding-bottom:calc(14px + env(safe-area-inset-bottom))}
    .signin-notice{font-size:.7rem;padding:6px 10px}.parent-picker :global(.tabs button){padding-inline:4px;font-size:.7rem}
  }
  @media(max-width:480px) {
    .parent-picker :global(.tabs button > svg){display:none}
    .parent-picker :global(.tabs button){flex:1 1 0;gap:4px}
    .parent-picker :global(.tabs .tab-label){white-space:nowrap}
    .parent-picker :global(.tabs small){flex:none;min-width:16px;padding-inline:3px;font-size:10px}.parent-picker > :global(dialog > .dialog-panel > header h2){font-size:.84rem}
  }
</style>
