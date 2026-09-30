<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  import { onDestroy, onMount, tick } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { characterImagePath, loadReleasedCharacterCatalog, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import AffinityPicker from '@/components/AffinityPicker.svelte';
  import IncludeExcludePicker from '@/components/IncludeExcludePicker.svelte';
  import CharacterSelectDialog from '@/components/CharacterSelectDialog.svelte';
  import type { CharacterPickerSort } from '@/components/CharacterPicker.svelte';
  import ProfileVeteranAffinity from './ProfileVeteranAffinity.svelte';
  import { factorOptions, watchFactorCatalog, factorCatalogState, loadFactorArtwork } from '@/lib/catalog/factor-catalog';
  import ResourceStatus from '@/components/ResourceStatus.svelte';
  onMount(watchFactorCatalog);
  import { loadSkillCatalog, skillPointTotal, skillImage, skillRarity, type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import { aptitudeGrade, totalStats } from '@/lib/profile/profile-display';
  import {
    encodedSkills, activeVeteranFilterCount, computeVeteranStatBounds, filterAndSortVeterans, resolveVeteranFactors, veteranFactorTotals, veteranDisplay,
    type AncestorScope, type VeteranFactorFilter, type FactorTone, type VeteranFilterState, type VeteranSortField
  } from '@/lib/profile/profile-veterans';
  import AptitudeGrid, { type AptitudeItem } from '@/components/AptitudeGrid.svelte';
  import Pagination from '@/components/Pagination.svelte';
  import Button from '@/components/Button.svelte';
  import Banner from '@/components/Banner.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import LineageTree from '@/components/LineageTree.svelte';
  import RaceBadge from '@/components/RaceBadge.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import SelectFieldSlim from '@/components/SelectFieldSlim.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import TextField from '@/components/TextField.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import Slider from '@/components/Slider.svelte';
  import SkillChip from '@/components/SkillChip.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import type { VeteranUiRecord } from '@/components/veteran-ui-types';
  import { getRankInfoFromScore, getRankInfoFromLabel } from '@/lib/rank';
  import VeteranCollection from '@/pages/veterans/VeteranCollection.svelte';
  import { router } from '@/routes/router';
  import FilterSection from '@/components/FilterSection.svelte';
  import FilterChip from '@/components/FilterChip.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import ProfileVeteranDialog from './ProfileVeteranDialog.svelte';
  import ProfileVeteranSparkMatcher from './ProfileVeteranSparkMatcher.svelte';
  import type { LineageBranch, LineageNodeData } from '@/components/lineage-types';
  import type { ProfileResponse, ProfileVeteran, SuccessionChara } from './profile-repository';
  import { profileRepository } from './profile-repository';
  import { loadG1SaddleGroups, loadRaceQueryValues, type RaceQueryValue } from '@/lib/catalog/race-catalog';
  import ProfileVeteranCard from './ProfileVeteranCard.svelte';
  import ProfileVeteranIdentity from './ProfileVeteranIdentity.svelte';
  import ProfileVeteranSparks from './ProfileVeteranSparks.svelte';
  import { veteranDatabaseUrl } from '@/lib/veterans/veteran-links';
  import ProfileVeteranQueryMatches from './ProfileVeteranQueryMatches.svelte';
  import { profileVeteranAffinity } from '@/lib/profile/profile-veteran-metrics';
  import { compileVeteranQuery, veteranQueryRow } from '@/lib/profile/profile-veteran-query';
  import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
  import { loadUqlQueryCatalog } from '@/lib/catalog/uql-catalog';
  import { UqlCompiler, type UqlQueryCatalog } from '@/lib/inheritance/uql-compiler';
  import { loadCatalog, type CatalogEntry } from '@/pages/database/catalog-repository';

  interface Props { accountId: string; profile: Pick<ProfileResponse, 'trainer' | 'veterans'>; characters: Map<number, CharacterCatalogEntry>; isOwner: boolean; compact?: boolean; imports?: boolean; }
  let { accountId, profile, characters, isOwner, compact = false, imports = true }: Props = $props();
  function exportCollection() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filtered,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `veterans-${accountId}.json`; link.click(); URL.revokeObjectURL(url);
  }
  type StatField = 'speed' | 'stamina' | 'power' | 'guts' | 'wiz';
  type CollectionSortField = VeteranSortField | 'affinity' | 'white_count' | 'white_stars_sum' | 'win_count';
  type AptitudeField = 'proper_ground_turf'|'proper_ground_dirt'|'proper_distance_short'|'proper_distance_mile'|'proper_distance_middle'|'proper_distance_long'|'proper_running_style_nige'|'proper_running_style_senko'|'proper_running_style_sashi'|'proper_running_style_oikomi';

  const statFields: Array<{ id: StatField; label: string; tone: 'blue'|'coral'|'orange'|'pink'|'teal' }> = [
    { id:'speed',label:'Speed',tone:'blue' }, { id:'stamina',label:'Stamina',tone:'coral' }, { id:'power',label:'Power',tone:'orange' },
    { id:'guts',label:'Guts',tone:'pink' }, { id:'wiz',label:'Wit',tone:'teal' }
  ];
  const aptitudeFields: Array<{ id: AptitudeField; label: string; group: string }> = [
    {id:'proper_ground_turf',label:'Turf',group:'Track'}, {id:'proper_ground_dirt',label:'Dirt',group:'Track'},
    {id:'proper_distance_short',label:'Sprint',group:'Distance'}, {id:'proper_distance_mile',label:'Mile',group:'Distance'}, {id:'proper_distance_middle',label:'Medium',group:'Distance'}, {id:'proper_distance_long',label:'Long',group:'Distance'},
    {id:'proper_running_style_nige',label:'Front',group:'Style'}, {id:'proper_running_style_senko',label:'Pace',group:'Style'}, {id:'proper_running_style_sashi',label:'Late',group:'Style'}, {id:'proper_running_style_oikomi',label:'End',group:'Style'}
  ];
  const gradeOptions = [{value:'',label:'Any'}, ...['S','A','B','C','D','E','F','G'].map((value) => ({value,label:value === 'S' ? 'S' : `${value}+`,image:'/game-assets/textures/uma_ranks/utx_ico_statusrank_'+String(getRankInfoFromLabel(value).iconIndex).padStart(2,'0')+'.webp'}))];
  const sortOptions: Array<{ value: string; label: string }> = [
    {value:'total',label:'Total Stats'},{value:'rank_score',label:'Rank Score'},{value:'speed',label:'Speed'},{value:'stamina',label:'Stamina'},
    {value:'power',label:'Power'},{value:'guts',label:'Guts'},{value:'wiz',label:'Wiz'},{value:'blue',label:'Blue Stars'},
    {value:'pink',label:'Pink Stars'},{value:'green',label:'Green Stars'},
    {value:'white_count',label:'White Spark Count'},{value:'white_stars_sum',label:'Total White Stars'},
    {value:'win_count',label:'G1 Wins'},{value:'creation_time',label:'Date Trained'},
    {value:'affinity',label:'Affinity'},{value:'name',label:'Name'}
  ];
  const distanceOptions = [{value:'',label:'Any distance'},{value:'1',label:'Sprint'},{value:'2',label:'Mile'},{value:'3',label:'Middle'},{value:'4',label:'Long'},{value:'5',label:'Dirt'}];
  const styleOptions = [{value:'',label:'Any style'},{value:'1',label:'Front'},{value:'2',label:'Pace'},{value:'3',label:'Late'},{value:'4',label:'End'}];
  const factors = $derived(factorOptions());

  let veterans = $state.raw<ProfileVeteran[]>([]);
  let bounds = $state(computeVeteranStatBounds([]));
  let speedMin=$state(0),speedMax=$state(1500),staminaMin=$state(0),staminaMax=$state(1500),powerMin=$state(0),powerMax=$state(1500),gutsMin=$state(0),gutsMax=$state(1500),wizMin=$state(0),wizMax=$state(1500);
  const allDistances=distanceOptions.filter(option=>option.value).map(option=>option.value),allStyles=styleOptions.filter(option=>option.value).map(option=>option.value);
  const toggleChoice=(choices:string[],value:string)=>choices.includes(value) ? choices.filter(choice=>choice!==value) : [...choices,value].sort();
  let query=$state(''),distance=$state<string[]>([...allDistances]),style=$state<string[]>([...allStyles]),minTotal=$state(0),sortField=$state<CollectionSortField>('total'),sortDirection=$state<'asc'|'desc'>('desc');
  const sortDirectionOptions=$derived(sortField==='creation_time' ? [{value:'desc',label:'Newest first'},{value:'asc',label:'Oldest first'}] : [{value:'desc',label:'Highest first'},{value:'asc',label:'Lowest first'}]);
  const fullHd = new MediaQuery('(min-width:1920px)');
  let preferredColumns = $state<number>();
  const gridColumns = $derived(preferredColumns ?? (fullHd.current ? 3 : 2));
  let displayTab=$state<'cards'|'inheritance'>('cards'),viewMode=$state<'grid'|'table'>('grid');
  let expandedSection=$state<'sparks'|'skills'|'compact'>('skills'),sparkSource=$state<'family'|'parent'|'p1'|'p2'>('family');
  let aptitudeFilters=$state<Partial<Record<AptitudeField,string>>>({}), selectedSkills=$state<number[]>([]), skillQuery=$state(''), skillCatalog=$state<Map<number,SkillCatalogEntry>>(new Map());
  let selectedFactors=$state<VeteranFactorFilter[]>([]),factorCategory=$state('all');
  let browseToolbar=$state<HTMLDivElement>();
  let queryPanel=$state<HTMLElement>();
  const desktopFilters=new MediaQuery('(min-width:1024px)');
  $effect(()=>{if(desktopFilters.current)filterDrawerOpen=false;});
  let displayOptions=$state(false),filterDrawerOpen=$state(false),drawerView=$state<'filters'|'sort'>('filters');
  let affinityEngine=$state<VeteranAffinityEngine>();
  let raceGroups=$state<ReadonlyMap<number,number>>(new Map());
  let metricError=$state('');
  let targetId=$state<number>(),targetLoading=$state(false),targetError=$state(''),targetChoices=$state<CharacterCatalogEntry[]>([]);
  let targetOpen=$state(false),targetSort=$state<CharacterPickerSort>('default');
  const target=$derived(targetId ? characters.get(targetId) : undefined);
  const targetOptions=$derived((targetChoices.length ? targetChoices : target ? [target] : []).map(character=>({...character,image:characterImagePath(Number(character.id))})));
  async function loadTargets() {
    if(targetChoices.length || targetLoading) return;
    targetLoading=true;targetError='';
    try { targetChoices=await loadReleasedCharacterCatalog(); }
    catch { targetError='Target characters could not be loaded.'; }
    finally { targetLoading=false; }
  }
  function selectTarget(value:string) {
    targetId=Number(value) || undefined;targetOpen=false;
    try { if(targetId) localStorage.setItem('veteran-affinity-target',String(targetId));else localStorage.removeItem('veteran-affinity-target'); } catch { /* Keep the current selection when storage is unavailable. */ }
  }
  onMount(()=>{try { const saved=Number(localStorage.getItem('veteran-affinity-target'));if(characters.has(saved))targetId=saved; } catch { /* Target selection is optional. */ }});
  let minSp=$state(''),maxSp=$state(''),minAffinity=$state(''),minWhites=$state(''),scenarioFilter=$state('');
  let uql=$state(''),appliedUql=$state(''),uqlLoading=$state(false),uqlError=$state(''),uqlEditorError=$state('');
  let uqlCatalog=$state.raw<UqlQueryCatalog|null>(null),uqlCharacters=$state.raw<CatalogEntry[]>([]),uqlSupports=$state.raw<CatalogEntry[]>([]);
  let UqlEditor=$state<typeof import('@/pages/database/DatabaseUqlEditor.svelte').default>();
  const uqlCompiler=$derived(new UqlCompiler(uqlCatalog ?? undefined));
  const queryDraft=$derived(compileVeteranQuery(uql,uql.trim() ? uqlCompiler : undefined));
  let queryApplied=$state.raw(compileVeteranQuery(''));
  $effect(()=>{
    if(queryDraft.validation.state==='empty' || uqlCatalog && queryDraft.validation.state==='valid') {
      appliedUql=queryDraft.validation.state==='empty' ? '' : uql;
      queryApplied=queryDraft;
    }
  });
  const affinityByVeteran=$derived(new Map(veterans.map(v => [v,profileVeteranAffinity(v,affinityEngine,raceGroups,targetId)])));
  const spByVeteran=$derived(new Map(veterans.map(v => [v,skillPointTotal(skillCatalog,encodedSkills(v))])));
  const spCeiling=$derived(Math.max(1000,Math.ceil(Math.max(0,...[...spByVeteran.values()].filter((value):value is number=>value!=null))/500)*500));
  const rangeMarks=(low:number,high:number)=>[...new Set([low,Math.round((low+high)/100)*50,high])];
  const databaseRows=$derived(new Map(veterans.map(v => [v,veteranQueryRow(v,profile.trainer,raceGroups,affinityByVeteran.get(v)?.main ?? null,affinityByVeteran.get(v)?.race ?? null)])));
  const filterTabs=[
    {id:'stats',icon:'gauge' as const,label:'Stats & SP',help:'Displayed stats. Drag either end to set a range.'},
    {id:'aptitudes',icon:'compass' as const,label:'Aptitudes',help:'Match this grade or higher.'},
    {id:'skills',icon:'book' as const,label:'Learned skills',help:'Veterans must have every selected skill.'},
    {id:'parents',icon:'users' as const,label:'Include / Exclude Umas',help:''},
    {id:'saddle',icon:'calendar' as const,label:'Race wins',help:'A parent or grandparent must have won any selected race.'},
    {id:'database',icon:'database' as const,label:'Inheritance totals',help:''},
    {id:'uql',icon:'tune' as const,label:'Advanced',help:''}
  ];
  async function loadAffinity() {
    metricError='';
    try {const [data,groups]=await Promise.all([veteranAffinityRepository.load(),loadG1SaddleGroups()]);if(live){affinityEngine=new VeteranAffinityEngine(data);raceGroups=groups;}}
    catch {if(live)metricError='Affinity details could not be loaded. Stored main scores are still shown.';}
  }
  async function loadQueryNames() {
    if(uqlLoading || uqlCatalog) return;
    uqlLoading=true;uqlError='';
    try {const [catalog,chars,supports]=await Promise.all([loadUqlQueryCatalog(),loadCatalog('characters'),loadCatalog('supports')]);if(live){uqlCatalog=catalog;uqlCharacters=chars;uqlSupports=supports;}}
    catch {if(live)uqlError='Query names could not be loaded. Try again.';}
    finally {if(live)uqlLoading=false;}
  }
  async function loadQueryEditor() {
    void loadQueryNames();
    if(UqlEditor) return;
    uqlEditorError='';
    try {const editor=await import('@/pages/database/DatabaseUqlEditor.svelte');if(live)UqlEditor=editor.default;}
    catch {if(live)uqlEditorError='Query editor could not be loaded. Try again.';}
  }
  onMount(()=>{void loadAffinity();});
  let statView=$state('displayed'),cardMood=$state('0');
  let include=$state<Partial<Record<AncestorScope,number[]>>>({}),exclude=$state<Partial<Record<AncestorScope,number[]>>>({});
  let umaOpen=$state(false),umaScope=$state<AncestorScope>('parent'),umaMode=$state<'include'|'exclude'>('include'),umaDraft=$state<string[]>([]),umaSort=$state<CharacterPickerSort>('default');
  let expanded=$state<Record<string,boolean>>({}),detail=$state.raw<ProfileVeteran>(),detailOpen=$state(false);
  const moodOptions = [{value:'2',label:'Great (+4%)'},{value:'1',label:'Good (+2%)'},{value:'0',label:'Normal'},{value:'-1',label:'Bad (−2%)'},{value:'-2',label:'Awful (−4%)'}];
  const scopeLabels = { p1:'P1 only',p2:'P2 only', any:'Any generation', family:'Veteran + parents', parent:'Veteran', grandparent:'Parents', greatgrandparent:'Grandparents' };
  let raceChoices=$state<RaceQueryValue[]>([]),raceQuery=$state(''),selectedRaceIds=$state<number[]>([]),raceSaddleIndex=$state<Map<number,number[]>>(new Map()),scheduleLoading=$state(false);
  const generations:Array<{scope:AncestorScope;label:string}>=[{scope:'parent',label:'This veteran'},{scope:'grandparent',label:'Parents'},{scope:'greatgrandparent',label:'Grandparents'}];
  const affinityCeiling=$derived(Math.max(100,Math.ceil(Math.max(0,...[...affinityByVeteran.values()].map(value=>value.main ?? 0))/10)*10));
  const whiteCeiling=$derived(Math.max(10,...[...databaseRows.values()].map(row=>Number(row.white_count ?? 0))));
  let initialized=$state('');
  let live=true;
  onDestroy(()=>{live=false;});
  let catalogError=$state(''),scheduleError=$state('');

  function resetStatRanges(nextBounds=bounds){ speedMin=nextBounds.speed[0]; speedMax=nextBounds.speed[1]; staminaMin=nextBounds.stamina[0]; staminaMax=nextBounds.stamina[1]; powerMin=nextBounds.power[0]; powerMax=nextBounds.power[1]; gutsMin=nextBounds.guts[0]; gutsMax=nextBounds.guts[1]; wizMin=nextBounds.wiz[0]; wizMax=nextBounds.wiz[1]; }
  function currentStats(): VeteranFilterState['stats'] { return {speed:[speedMin,speedMax],stamina:[staminaMin,staminaMax],power:[powerMin,powerMax],guts:[gutsMin,gutsMax],wiz:[wizMin,wizMax]}; }
  function filterState(): VeteranFilterState { return { query,distance:distance.length===allDistances.length?null:distance.map(Number),style:style.length===allStyles.length?null:style.map(Number),minTotal,stats:currentStats(),aptitudes:aptitudeFilters,skills:selectedSkills,include,exclude,factors:selectedFactors,raceIds:selectedRaceIds }; }
  const metricSort=$derived(sortField==='affinity' || sortField==='white_count' || sortField==='white_stars_sum' || sortField==='win_count' ? sortField : undefined);
  const propertyFiltered = $derived(filterAndSortVeterans(veterans,$state.snapshot(filterState()),sortField==='affinity' || sortField==='white_count' || sortField==='white_stars_sum' || sortField==='win_count' ? 'total' : sortField,sortDirection,characters));
  const filtered = $derived.by(() => {
    const result=propertyFiltered.filter(v => matchesSelectedRaces(v)
      && (!minSp || (spByVeteran.get(v) ?? -1) >= Number(minSp))
      && (!maxSp || (spByVeteran.get(v) ?? Infinity) <= Number(maxSp))
      && (!minAffinity || (affinityByVeteran.get(v)?.main ?? -1) >= Number(minAffinity))
      && (!minWhites || Number(databaseRows.get(v)?.white_count ?? -1) >= Number(minWhites))
      && (!scenarioFilter || v.scenario_id === Number(scenarioFilter))
      && (!appliedUql || queryApplied.matches(databaseRows.get(v)!)));
    const sort=queryApplied.validation.sortBy;
    if(appliedUql && sort) return result.sort((a,b)=>Number(databaseRows.get(b)?.[sort] ?? -1)-Number(databaseRows.get(a)?.[sort] ?? -1));
    if(metricSort) result.sort((a,b)=>{
      const left=databaseRows.get(a)?.[metricSort],right=databaseRows.get(b)?.[metricSort];
      return left==null ? right==null ? 0 : 1 : right==null ? -1 : (Number(left)-Number(right))*(sortDirection==='asc' ? 1 : -1);
    });
    return result;
  });
  let previewPage = $state(1);
  const previewPages = $derived(Math.max(1, Math.ceil(filtered.length / 3)));
  const currentPreviewPage = $derived(Math.min(previewPage, previewPages));
  const displayed = $derived(filtered.slice(compact ? (currentPreviewPage - 1) * 3 : virtualRange.start, compact ? currentPreviewPage * 3 : virtualRange.end).map((veteran)=>veteranDisplay(veteran,characters)));
  const queryMatches=$derived(new Map(displayed.map(({veteran:v})=>[v,appliedUql ? queryApplied.explain(databaseRows.get(v)!) : []])));
  const activeCount = $derived(activeVeteranFilterCount(filterState(),bounds)+[minSp||maxSp,minAffinity,minWhites,scenarioFilter,appliedUql].filter(Boolean).length);
  const skillOptions = $derived([...skillCatalog.values()].filter(skill=>!selectedSkills.includes(skill.skill_id)).map(skill=>({value:String(skill.skill_id),label:skill.name,image:skillImage(skill.icon)})));
  function addFactor(filter: VeteranFactorFilter) { if(!selectedFactors.some(item => item.factorId === filter.factorId && item.scope === filter.scope && item.minLevel === filter.minLevel && (item.mode ?? 'minimum') === (filter.mode ?? 'minimum'))) selectedFactors = [...selectedFactors,filter]; }
  function addSkill(id: number) { if(!selectedSkills.includes(id)) selectedSkills = [...selectedSkills,id]; }
  function sortTable(field:CollectionSortField) { sortDirection=sortField===field && sortDirection==='desc' ? 'asc' : 'desc';sortField=field; }
  function sparkLabel(filter: VeteranFactorFilter) { return `${factors.find(factor => Number(factor.id) === filter.factorId)?.text ?? `Factor ${filter.factorId}`} · ${filter.mode === 'total' ? 'Total ' : ''}${filter.minLevel}${filter.maxLevel != null ? '–'+filter.maxLevel : ''}★${filter.mode === 'exact' ? ' exactly' : filter.maxLevel != null ? '' : '+'} · ${scopeLabels[filter.scope]}`; }

  $effect(() => {
    const next = profile.veterans ?? [];
    veterans = next;
    const key = `${accountId}:${next.length}`;
    if(initialized!==key){ bounds=computeVeteranStatBounds(next); resetStatRanges(bounds); initialized=key; }
  });
  $effect(() => { void Promise.all([loadSkillCatalog(), loadFactorArtwork()]).then(([catalog])=>skillCatalog=catalog).catch(()=>catalogError='Skill and race data could not be loaded. Reload the page to try again.'); });
  $effect(() => { accountId; profile; query; distance; style; minTotal; sortField; sortDirection; targetId; minSp;maxSp;minAffinity;minWhites;scenarioFilter;appliedUql; speedMin; speedMax; staminaMin; staminaMax; powerMin; powerMax; gutsMin; gutsMax; wizMin; wizMax; aptitudeFilters; selectedSkills; selectedFactors; include; exclude; previewPage=1; });

  function statValue(field:StatField,end=false):number { const values:{[key:string]:number}={speedMin,speedMax,staminaMin,staminaMax,powerMin,powerMax,gutsMin,gutsMax,wizMin,wizMax}; return values[`${field}${end?'Max':'Min'}`] ?? 0; }
  function changeStat(field:StatField,start:number,end?:number):void { if(field==='speed'){speedMin=start;speedMax=end??start}else if(field==='stamina'){staminaMin=start;staminaMax=end??start}else if(field==='power'){powerMin=start;powerMax=end??start}else if(field==='guts'){gutsMin=start;gutsMax=end??start}else{wizMin=start;wizMax=end??start} }
  function clearFacet(id:string):void {
    if(id==='type'){distance=[...allDistances];style=[...allStyles];}
    if(id==='factors'){selectedFactors=[];factorCategory='all';}
    if(id==='stats'){minTotal=0;minSp='';maxSp='';resetStatRanges();}
    if(id==='aptitudes')aptitudeFilters={};
    if(id==='skills'){selectedSkills=[];skillQuery='';}
    if(id==='parents'){include={};exclude={};}
    if(id==='saddle')selectedRaceIds=[];
    if(id==='database'){minAffinity='';minWhites='';scenarioFilter='';}
    if(id==='uql'){uql='';appliedUql='';}
  }
  function clearFilters():void { minSp='';maxSp='';minAffinity='';minWhites='';scenarioFilter='';uql='';appliedUql='';query='';distance=[...allDistances];style=[...allStyles];minTotal=0;aptitudeFilters={};selectedSkills=[];selectedFactors=[];selectedRaceIds=[];include={};exclude={};skillQuery='';resetStatRanges(); }
  function openFilter(id:string,toggle=false):void {
    const close=toggle && !!expanded[id];
    if(id!=='factors'||close)factorCategory='all';
    drawerView='filters';filterDrawerOpen=id!=='uql' && !desktopFilters.current;expanded=close ? {} : {[id]:true};
    if(!close){if(id==='saddle'&&!raceChoices.length)void loadSchedule();if(id==='uql')void focusQuery();}
  }
  async function focusQuery() { await loadQueryEditor();await tick();if(expanded.uql){queryPanel?.scrollIntoView({block:'start'});queryPanel?.querySelector<HTMLElement>('.cm-content')?.focus({preventScroll:true});} }
  async function hideQuery() { expanded={};await tick();(document.getElementById('veteran-uql-trigger') ?? browseToolbar?.querySelector<HTMLElement>('button[aria-label="Filters"]'))?.focus({preventScroll:true}); }
  function openDrawer(view:'filters'|'sort') { drawerView=view;filterDrawerOpen=true; }
  async function showResults() { filterDrawerOpen=false;await tick();browseToolbar?.scrollIntoView({block:'start'}); }
  function facetCount(id:string):number {
    if(id==='type') return Number(distance.length!==allDistances.length)+Number(style.length!==allStyles.length);
    if(id==='factors') return selectedFactors.length;
    if(id==='skills') return selectedSkills.length;
    if(id==='parents') return [...Object.values(include),...Object.values(exclude)].reduce((count,ids)=>count+(ids?.length ?? 0),0);
    if(id==='saddle') return selectedRaceIds.length;
    if(id==='database') return [minAffinity,minWhites,scenarioFilter].filter(Boolean).length;
    if(id==='uql') return appliedUql.trim() ? 1 : 0;
    if(id==='aptitudes')return Object.values(aptitudeFilters).filter(Boolean).length;
    return (minTotal ? 1 : 0)+(minSp||maxSp ? 1 : 0)+statFields.filter(field=>statValue(field.id)!==bounds[field.id][0] || statValue(field.id,true)!==bounds[field.id][1]).length;
  }
  function setAptitude(field:AptitudeField,value:string):void { aptitudeFilters={...aptitudeFilters,[field]:value}; }
  function editUmas(scope:AncestorScope,mode:'include'|'exclude'):void { umaScope=scope;umaMode=mode;umaDraft=[];umaSort='default';umaOpen=true;void loadTargets(); }
  function selectUmas(values:string[]):void {
    const ids=values.map(Number),current=umaMode==='include' ? include : exclude,opposite=umaMode==='include' ? exclude : include;
    const next={...current,[umaScope]:[...new Set([...(current[umaScope]??[]),...ids])]},remaining={...opposite,[umaScope]:(opposite[umaScope]??[]).filter(id=>!ids.includes(id))};
    if(umaMode==='include'){include=next;exclude=remaining;}else{exclude=next;include=remaining;}
    umaOpen=false;
  }
  function umaItems(ids:number[]=[]){return ids.map(id=>({id:String(id),label:characters.get(id)?.name ?? String(id),image:characterImage(id)}));}
  function removeAncestor(scope:AncestorScope,id:number,excluded=false):void { const target=excluded?exclude:include; const next={...target,[scope]:(target[scope]??[]).filter((value)=>value!==id)}; if(excluded)exclude=next;else include=next; }
  function characterImage(id:number):string { return characterImagePath(id); }

  function aptitudes(v:ProfileVeteran):AptitudeItem[]{return aptitudeFields.map((field)=>({id:field.id,label:field.label,group:field.group,grade:aptitudeGrade(v[field.id])}));}
  function findVeteranText(veteran: ProfileVeteran): string {
    const item = veteranDisplay(veteran, characters), summary = veteranSummary(item);
    return [summary.id, summary.name, summary.rank, summary.score, item.scenario, item.distance, item.style,
      ...(summary.stats ?? []).flatMap(stat => [stat.label, stat.value]), ...item.factors.map(factor => factor.name),
      ...item.skills.map(skill => skillCatalog.get(Math.floor(skill / 10))?.name),
      ...(veteran.succession_chara_array ?? []).flatMap(parent => [characters.get(parent.card_id)?.name, ...resolveVeteranFactors(parent).map(factor => factor.name)])].join(' ');
  }
  function veteranSummary(item: ReturnType<typeof veteranDisplay>): VeteranUiRecord {
    const v = item.veteran;
    const affinity = affinityByVeteran.get(v);
    return {
      id:String(v.trained_chara_id ?? v.id), name:item.name, image:item.image,
      rank:v.rank_score == null ? '' : getRankInfoFromScore(v.rank_score).label, score:v.rank_score ?? undefined,
      scenario:item.scenario === '-' ? undefined : item.scenario, detail:[item.distance,item.style].filter(value => value && value !== '-').join(' · '),
      affinity:affinity?.main ?? Number.NaN, affinityTarget:targetId ? {id:targetId,name:target?.name ?? 'Selected Uma'} : undefined,
      affinityNote:targetId ? 'Affinity with '+(target?.name ?? 'the target')+': direct relation, both parent contributions and shared G1 wins.' : affinity?.recorded ? 'Stored main affinity; parent details unavailable' : 'Main = P1 + P2. Each parent includes base affinity and shared G1 wins.', aptitudes:aptitudes(v),
      stats:[...statFields.map(field => ({ id:field.id, label:field.label, value:(v[field.id] ?? 0).toLocaleString(), tone:field.id === 'wiz' ? 'wit' as const : field.id, icon:'/assets/images/icon/stats/' + (field.id === 'wiz' ? 'wit' : field.id) + '.webp' })), {id:'total',label:'Total',value:item.total.toLocaleString()}],
      sparks:factorGroups(item.factors),
      parents:(v.succession_chara_array ?? []).filter(parent => parent.position_id === 10 || parent.position_id === 20).map(parent => ({
        id:String(parent.position_id), position:parent.position_id === 10 ? 'P1' as const : 'P2' as const,
        name:characters.get(parent.card_id)?.name ?? 'Parent', image:characterImage(parent.card_id),
        affinity:(parent.position_id === 10 ? affinity?.p1 : affinity?.p2) ?? Number.NaN, sparks:factorGroups(resolveVeteranFactors(parent))
      }))
    };
  }
  function lineage(v:ProfileVeteran):{root:LineageNodeData;branches:LineageBranch[]}{
    const rootDisplay=veteranDisplay(v,characters); const successors=v.succession_chara_array??[];
    const node=(item:SuccessionChara,role:'parent'|'grandparent',label:string):LineageNodeData=>({id:`${v.trained_chara_id}:${item.position_id}`,name:characters.get(item.card_id)?.name??`Character ${item.card_id}`,image:characterImage(item.card_id),role,roleLabel:label,sparks:factorGroups(resolveVeteranFactors(item))});
    const branches=[10,20].map((position,index)=>{const parent=successors.find((item)=>item.position_id===position);if(!parent)return null;const base=position===10?11:21;return{id:`branch-${position}`,parent:node(parent,'parent',index===0?'P1':'P2'),grandparents:successors.filter((item)=>item.position_id===base||item.position_id===base+1).map((item,grandIndex)=>node(item,'grandparent',`${index===0?'P1':'P2'} legacy ${grandIndex+1}`))};}).filter((branch):branch is LineageBranch=>Boolean(branch));
    return{root:{id:`${v.trained_chara_id??v.id}`,name:rootDisplay.name,image:rootDisplay.image,role:'main',roleLabel:'Main',affinity:affinityByVeteran.get(v)?.main??undefined,sparks:factorGroups(rootDisplay.factors)},branches};
  }
  function factorGroups(items:ReturnType<typeof resolveVeteranFactors>){return(['blue','pink','green','white']as FactorTone[]).map((tone)=>({tone,items:items.filter((factor)=>factor.tone===tone).map((factor,index)=>({id:`${factor.encodedId}:${index}`,name:factor.name,level:factor.level}))})).filter((group)=>group.items.length);}
  function toggleRace(id:string):void{const numeric=Number(id);selectedRaceIds=selectedRaceIds.includes(numeric)?selectedRaceIds.filter((value)=>value!==numeric):[...selectedRaceIds,numeric];}
  function matchesSelectedRaces(veteran:ProfileVeteran):boolean{if(!selectedRaceIds.length)return true;const saddles=new Set((veteran.succession_chara_array??[]).flatMap((node)=>node.win_saddle_id_array??[]));return selectedRaceIds.some((raceId)=>(raceSaddleIndex.get(raceId)??[]).some((saddle)=>saddles.has(saddle)));}
  async function loadSchedule():Promise<void>{scheduleLoading=true;scheduleError='';try{raceChoices=await loadRaceQueryValues();raceSaddleIndex=new Map(raceChoices.map(race=>[race.id,race.saddleIds]));}catch{scheduleError='Race choices could not be loaded.';}finally{scheduleLoading=false;}}
  function showDetail(veteran:ProfileVeteran):void{ detail=veteran; detailOpen=true; }
  function openDetailPlanner(veteran:ProfileVeteran):void{
    try{localStorage.setItem('planner_transfer',JSON.stringify({veteran,veteranPosition:'p1',targetCharaId:targetId}));}catch{/* Legacy transfer is best effort. */}
    window.open('/tools/lineage-planner?from=profile','_blank','noopener');
  }
  async function refreshImports(): Promise<void> {
    const target = accountId;
    try { const refreshed = await profileRepository.load(target, true); if (live && accountId === target) { veterans = refreshed.veterans ?? []; bounds = computeVeteranStatBounds(veterans); resetStatRanges(bounds); } }
    catch { if (live && accountId === target) catalogError = 'The collection could not be refreshed. Reload to try again.'; }
  }

</script>

<div class="veterans-page" class:compact-roster={compact}>
  {#if catalogError}<Banner title={catalogError} tone="warning"/>{/if}
  {#if isOwner && !compact && imports}
    <VeteranCollection preferredAccountId={accountId} onimport={refreshImports} onaccountchange={id => { void (id ? router.navigate('/veterans/:accountId', { params: { accountId: id } }) : router.navigate('/veterans')); }}/>
  {/if}  {#if veterans.length===0}<EmptyState compact icon="veterans" title="No veterans found." description={isOwner ? (compact ? "Open the Veterans browser to import your collection." : "Upload your trained character JSON to get started.") : "This trainer has no shared veterans yet."}/>
  {:else}
    {#if compact}
      <div class="light-filters">
        <TextField id="profile-veteran-search" label="Search veterans" placeholder="Find a runner…" type="search" bind:value={query}/>
        <SelectField id="profile-veteran-distance" label="Distance" options={distanceOptions} value={distance.length===1 ? distance[0] : ''} onchange={value=>distance=value ? [value] : [...allDistances]}/>
        <SelectField id="profile-veteran-sort" label="Sort" options={sortOptions.filter(option => ['total','rank_score','affinity','name','creation_time','white_count','white_stars_sum','win_count'].includes(option.value))} bind:value={sortField}/>
      </div>
    {/if}

    {#if !compact}<div class="collection-header">
      <div class="collection-toolbar" aria-label="Collection search">
        <TextField id="veteran-search" label="Search" hideLabel prefixIcon="search" type="search" placeholder="Search your collection…" bind:value={query}/>
        <Button variant="ghost" icon="download" ariaLabel="Export veterans" disabled={!filtered.length} onclick={exportCollection}/>
      </div>
    {#if !filterDrawerOpen}{@render activeChips()}{/if}
    </div>{/if}
    <div class="collection-body" class:with-sidebar={!compact && desktopFilters.current}>
      {#if !compact && desktopFilters.current}
        <aside class="filter-sidebar" aria-label="Filter veterans">
          <header class="sidebar-heading"><h2>Refine collection{#if activeCount}<span class="active-count">{activeCount}</span>{/if}</h2><Button variant="ghost" size="sm" disabled={!activeCount} onclick={clearFilters}>Reset all</Button></header>
          {@render filterFacets()}
        </aside>
      {/if}
      <div class="collection-results">
        {#if !compact}
          <div class="results-toolbar" aria-label="Browse controls" bind:this={browseToolbar}>
            <div class="result-count" aria-live="polite"><strong>{filtered.length.toLocaleString()}</strong><span>{activeCount ? 'of ' + veterans.length.toLocaleString() : ''} veteran{veterans.length === 1 ? '' : 's'}</span>{#if activeCount}<Button variant="ghost" size="sm" onclick={clearFilters}>Reset</Button>{/if}</div>
            {#if !desktopFilters.current}<Button variant="secondary" size="sm" icon="filter" ariaLabel="Filters" ariaExpanded={filterDrawerOpen && drawerView === 'filters'} onclick={()=>openDrawer('filters')}>Filters{#if activeCount}<span class="active-count">{activeCount}</span>{/if}</Button>{/if}
            <div class="desktop-sort sort"><SelectField id="veteran-sort" label="Sort" hideLabel prefixIcon="sort" options={sortOptions} bind:value={sortField}/><Button variant="ghost" size="sm" ariaLabel={'Sort '+(sortField==='creation_time' ? sortDirection==='desc' ? 'oldest first' : 'newest first' : sortDirection==='asc' ? 'descending' : 'ascending')} onclick={() => sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'}>{sortDirection === 'asc' ? '↑' : '↓'}</Button></div>
            <span class="mobile-sort"><Button variant="secondary" size="sm" icon="sort" ariaLabel="Sort veterans" onclick={()=>openDrawer('sort')}>Sort</Button></span>
            <Button variant="ghost" size="sm" icon="tune" ariaLabel="Display options" ariaExpanded={displayOptions} onclick={() => displayOptions = !displayOptions}><span class="display-label">Display</span></Button>
          </div>
          {#if displayOptions}<section class="display-options" aria-label="Card display options">
            <SelectField id="veteran-view" label="View" options={[{value:'grid',label:'Cards'},{value:'table',label:'Table'},{value:'inheritance',label:'Family tree'}]} value={displayTab === 'inheritance' ? 'inheritance' : viewMode} onchange={value => {displayTab = value === 'inheritance' ? 'inheritance' : 'cards'; if(value !== 'inheritance') viewMode = value as 'grid'|'table';}}/>
            {#if displayTab === 'cards' && viewMode === 'grid'}
            <SelectField id="veteran-stat-view" label="Stats" options={[{value:'displayed',label:'Displayed'},{value:'base',label:'Base stats'}]} bind:value={statView}/>
            {#if statView === 'base'}<SelectField id="veteran-card-mood" label="Mood" options={moodOptions} bind:value={cardMood}/>{/if}
            <SelectField id="veteran-columns" label="Per row" options={[4,3,2,1].map(count => ({value:String(count),label:String(count)}))} value={String(gridColumns)} onchange={value => preferredColumns = Number(value)}/>
          {/if}</section>{/if}
        {/if}

    {#if !compact && (expanded.uql || UqlEditor)}
      <section class="collection-uql" id="veteran-uql-panel" aria-label="Collection query editor" hidden={!expanded.uql} bind:this={queryPanel}>
        {#if uqlError || uqlEditorError}<Banner title={uqlError || uqlEditorError} tone="danger"><Button onclick={()=>void focusQuery()}>Retry</Button></Banner>{/if}
        {#if UqlEditor}<UqlEditor bind:value={uql} validation={queryDraft.validation} characters={uqlCharacters} supports={uqlSupports} catalog={uqlCatalog} loading={uqlLoading} onclear={()=>{uql='';appliedUql='';}} onpicklegacy={()=>openFilter('parents')}/>{:else if !uqlEditorError}<p>Loading query editor…</p>{/if}
        <p class="filter-help">Main is the veteran; GP1 / GP2 are P1 / P2. Ranking functions and support limit-break rules are unavailable.</p>
        <div class="query-actions"><small>{queryDraft.validation.state!=='empty' && uql !== appliedUql ? uqlLoading ? 'Loading names before applying your query…' : appliedUql ? 'Showing results for your last valid query.' : 'Finish a valid query to filter results.' : 'Results update as you type, alongside your other filters.'}</small><Button variant="ghost" size="sm" onclick={hideQuery}>Hide editor</Button></div>
      </section>
    {/if}
    {#if filtered.length===0}<EmptyState compact icon="filter" title="No veterans match your filters." description="Try another name or distance.">{#snippet actions()}<Button variant="secondary" onclick={clearFilters}>Clear all filters</Button>{/snippet}</EmptyState>
    {:else if displayTab==='inheritance'}<div class="inheritance-list" use:virtualScroll={{ items: filtered, searchText: findVeteranText, key: veteran => veteran.trained_chara_id ?? veteran.id, active: !compact, onrange: range => virtualRange = range }}>{#each displayed as item, index (item.veteran.trained_chara_id??item.veteran.id)}{@const tree=lineage(item.veteran)}<article data-virtual-index={virtualRange.start + index}><LineageTree root={tree.root} branches={tree.branches} onselect={()=>showDetail(item.veteran)}/><Button variant="secondary" size="sm" onclick={() => openDetailPlanner(item.veteran)} icon="external">Open in planner</Button></article>{/each}</div>
    {:else if viewMode==='grid'}
      <div class="veteran-grid" use:virtualScroll={{ items: filtered, searchText: findVeteranText, key: veteran => veteran.trained_chara_id ?? veteran.id, active: !compact, onrange: range => virtualRange = range }} style={'--grid-columns:' + (compact ? 3 : gridColumns)}>
        {#each displayed as item, index (item.veteran.trained_chara_id ?? item.veteran.id)}
          <div data-virtual-index={virtualRange.start + index}><ProfileVeteranCard veteran={item.veteran} summary={veteranSummary(item)} legacyUrl={veteranDatabaseUrl(item.veteran, accountId, targetId)} {skillCatalog} {expandedSection} {sparkSource} baseStats={statView === 'base'} mood={Number(cardMood)} {selectedFactors} {selectedSkills} queryMatches={queryMatches.get(item.veteran) ?? []} onfactor={compact ? undefined : addFactor} onskill={compact ? undefined : addSkill} ondetails={() => showDetail(item.veteran)}/></div>
        {/each}
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (The comparison table supports keyboard scrolling.) -->
      <div class="table-wrap" role="region" aria-label="Veteran comparison" tabindex="0">
        <table>
          <colgroup><col class="character-column"/><col class="stats-column"/><col class="affinity-column"/><col class="aptitude-column"/><col/><col class="details-column"/></colgroup>
          <thead><tr><th scope="col">Veteran</th>
            <th scope="col" aria-sort={sortField==='total' || statFields.some(field=>field.id===sortField) ? sortDirection==='asc' ? 'ascending' : 'descending' : 'none'}><Button variant="ghost" size="sm" ariaLabel="Sort by Total Stats" onclick={()=>sortTable('total')}>Stats {sortField==='total' || statFields.some(field=>field.id===sortField) ? sortDirection==='asc' ? '↑' : '↓' : ''}</Button></th>
            <th scope="col" title={target ? 'Affinity for '+target.name : 'Veteran and parent affinity'} aria-sort={sortField==='affinity' ? sortDirection==='asc' ? 'ascending' : 'descending' : 'none'}><Button variant="ghost" size="sm" onclick={()=>sortTable('affinity')}>Affinity {sortField==='affinity' ? sortDirection==='asc' ? '↑' : '↓' : ''}</Button></th><th scope="col">Aptitudes</th><th scope="col" title="Combined stars from Own + P1 + P2">Combined sparks</th><th scope="col"><span class="visually-hidden">Details</span></th>
          </tr></thead>
          <tbody use:virtualScroll={{ items: filtered, searchText: findVeteranText, key: veteran => veteran.trained_chara_id ?? veteran.id, active: !compact, onrange: range => virtualRange = range }}>{#each displayed as item, index (item.veteran.trained_chara_id ?? item.veteran.id)}
            {@const matches=queryMatches.get(item.veteran) ?? []}
            {@const summary=veteranSummary(item)}
            {@const factors=veteranFactorTotals(item.veteran)}
            <tr data-virtual-index={virtualRange.start + index}>
              <th scope="row"><button class="table-character" aria-label={'View '+item.name+' details'} onclick={()=>showDetail(item.veteran)}><ProfileVeteranIdentity {summary} rarity={item.veteran.rarity} score={item.veteran.rank_score}/></button></th>
              <td class="table-stats">
                <StatStrip label={item.name+' stats'} items={[...statFields.map(field=>({id:field.id,label:field.label,value:(item.veteran[field.id] ?? 0).toLocaleString(),icon:'/assets/images/icon/stats/'+(field.id==='wiz' ? 'wit' : field.id)+'.webp'})),{id:'sp',label:'SP',value:spByVeteran.get(item.veteran)?.toLocaleString() ?? '-'},{id:'total',label:'Total Stats',value:item.total.toLocaleString()}]} compact presentation="icons"/>
              </td>
              <td class="table-affinity" data-label="Affinity"><ProfileVeteranAffinity {summary} compact/></td>
              <td class="table-aptitudes" data-label="Aptitudes"><AptitudeGrid items={aptitudes(item.veteran)} compact stretch gradeFirst/></td>
              <td class="table-factors" data-label="Combined sparks"><ProfileVeteranSparks items={factors} {selectedFactors} queryMatches={matches} onfactor={addFactor} onmore={()=>showDetail(item.veteran)}/></td>
              <td class="table-details"><IconButton icon="arrow-right" label={'Open '+item.name+' details'} onclick={()=>showDetail(item.veteran)}/></td>
            </tr>
            {#if matches.length}<tr class="query-row" data-virtual-index={virtualRange.start + index}><td colspan="6"><ProfileVeteranQueryMatches {matches}/></td></tr>{/if}
          {/each}</tbody>
        </table>
      </div>
    {/if}
    {#if compact && filtered.length > 3}<div class="preview-pagination"><span aria-live="polite">Showing <strong>{(currentPreviewPage - 1) * 3 + 1}–{Math.min(currentPreviewPage * 3, filtered.length)}</strong> of {filtered.length} veterans</span><Pagination page={currentPreviewPage} pages={previewPages} label="Veterans preview pages" onchange={page => previewPage = page}/></div>{/if}
      </div>
    </div>
  {/if}
</div>

{#snippet filterFacets()}
  <div class="filter-facets">
    {#if displayTab === 'cards' && viewMode === 'grid'}<section class="card-display" aria-label="Veteran card display">
      <div><h3>Expand on cards</h3><SegmentedControl label="Expanded card section" options={[{value:'skills',label:'Skills'},{value:'sparks',label:'Sparks'},{value:'compact',label:'Neither'}]} value={expandedSection} onchange={value=>expandedSection=value as typeof expandedSection}/></div>
      <div><h3>Spark source</h3><SegmentedControl label="Spark source" options={[{value:'family',label:'Combined'},{value:'parent',label:'Own'},{value:'p1',label:'P1'},{value:'p2',label:'P2'}]} value={sparkSource} onchange={value=>sparkSource=value as typeof sparkSource}/></div>
    </section>{/if}
    <section class="affinity-target" aria-label="Affinity target">
      <AffinityPicker targetOnly target={target ? {...target,image:characterImage(Number(target.id))} : undefined} ontargetpick={()=>{targetSort='default';targetOpen=true;void loadTargets();}} ontargetclear={()=>selectTarget('')}/>
      {#if targetId && metricError}<Banner title="Target affinity unavailable" tone="warning"><Button variant="secondary" size="sm" onclick={loadAffinity}>Retry affinity</Button></Banner>{/if}
    </section>
    <div class="primary-filters">
      <fieldset aria-label="Distance"><legend><span>Distance</span><button type="button" aria-label={distance.length===allDistances.length ? "Clear distances" : "Select all distances"} onclick={()=>distance=distance.length===allDistances.length ? [] : [...allDistances]}>{distance.length===allDistances.length ? "Clear" : "All"}</button></legend><div class="filter-choices">{#each distanceOptions.filter(option=>option.value) as option}<button type="button" class:selected={distance.includes(option.value)} aria-pressed={distance.includes(option.value)} onclick={()=>distance=toggleChoice(distance,option.value)}>{option.label}</button>{/each}</div></fieldset>
      <fieldset aria-label="Running style"><legend><span>Running style</span><button type="button" aria-label={style.length===allStyles.length ? "Clear running styles" : "Select all running styles"} onclick={()=>style=style.length===allStyles.length ? [] : [...allStyles]}>{style.length===allStyles.length ? "Clear" : "All"}</button></legend><div class="filter-choices">{#each styleOptions.filter(option=>option.value) as option}<button type="button" class:selected={style.includes(option.value)} aria-pressed={style.includes(option.value)} onclick={()=>style=toggleChoice(style,option.value)}>{option.label}</button>{/each}</div></fieldset>
    </div>
    <section class="spark-categories" aria-label="Inheritance sparks">
      <header><h3>Inheritance sparks</h3>{#if selectedFactors.length}<button class="clear-facet" aria-label="Clear Sparks" onclick={()=>clearFacet('factors')}>Clear {selectedFactors.length}</button>{/if}</header>
      <div class="spark-category-grid">{#each [{value:'0',label:'Blue stats',tone:'blue'},{value:'1',label:'Aptitude',tone:'pink'},{value:'5',label:'Unique',tone:'green'},{value:'white',label:'Skill / race',tone:'white'}] as category}{@const count=selectedFactors.filter(filter=>{const type=factorOptions().find(factor=>Number(factor.id)===filter.factorId)?.type;return category.value==='white' ? ![0,1,5].includes(type??-1) : type===Number(category.value);}).length}<button class:selected={factorCategory===category.value} aria-label={category.label} aria-expanded={factorCategory===category.value} aria-controls="facet-factors" onclick={()=>{const toggle=factorCategory===category.value;factorCategory=category.value;openFilter('factors',toggle);}}><span class={'spark-category-star '+category.tone} aria-hidden="true">★</span>{category.label}{#if count}<span class="category-count">{count}</span>{/if}</button>{/each}</div>
      {#if selectedFactors.length || factorCategory!=='all'}<section class="inline-spark-filters" id="facet-factors" aria-label="Inheritance spark filters"><ResourceStatus {...$factorCatalogState}/><ProfileVeteranSparkMatcher bind:filters={selectedFactors} bind:category={factorCategory} {characters} {scopeLabels}/></section>{/if}
    </section>
    <h3 class="more-filters-heading">More filters</h3>
    {#each filterTabs as tab}
      <section class="filter-facet" class:expanded={!!expanded[tab.id]}>
        <div class="facet-header"><button class="facet-heading" id={tab.id==='uql' ? 'veteran-uql-trigger' : undefined} aria-label={tab.label} aria-expanded={!!expanded[tab.id]} aria-controls={tab.id==='uql' ? 'veteran-uql-panel' : 'facet-'+tab.id} onpointerenter={()=>{if(tab.id==='uql')void loadQueryEditor();}} onfocus={()=>{if(tab.id==='uql')void loadQueryEditor();}} onclick={()=>openFilter(tab.id,true)}><Icon name={tab.icon} size={16}/><strong>{tab.label}</strong>{#if facetCount(tab.id)}<span class="active-count">{facetCount(tab.id)}</span>{/if}<Icon name="chevron" size={16}/></button>{#if facetCount(tab.id)}<button class="clear-facet" aria-label={'Clear '+tab.label} onclick={()=>clearFacet(tab.id)}>Clear</button>{/if}</div>
        {#if expanded[tab.id] && tab.id!=='uql'}
          <div class="facet-content" id={'facet-'+tab.id}>
            {#if tab.help && tab.id!=='skills'}<p class="filter-help">{tab.help}</p>{/if}
            {#if tab.id === 'stats'}
              <div class="stat-limits" role="group" aria-label="Stat limits">
                {#each statFields as field}<div class="stat-limit"><img class="stat-icon" src={'/assets/images/icon/stats/'+(field.id === 'wiz' ? 'wit' : field.id)+'.webp'} alt={field.label} title={field.label}/><Slider id={'veteran-'+field.id} label={field.label} hideLabel showOutput={false} showTicks tickValues={rangeMarks(...bounds[field.id])} showValueLabels range min={bounds[field.id][0]} max={bounds[field.id][1]} step={50} value={statValue(field.id)} endValue={statValue(field.id,true)} tone={field.tone} onchange={(start,end)=>changeStat(field.id,start,end)}/></div>{/each}
                <div class="stat-limit"><span class="sp-icon" title="Skill point total" aria-hidden="true">SP</span><Slider id="filter-sp" label="SP total" hideLabel showOutput={false} showTicks tickValues={rangeMarks(0,spCeiling)} showValueLabels range min={0} max={spCeiling} step={50} tone="white" value={Number(minSp)||0} endValue={maxSp ? Number(maxSp) : spCeiling} onchange={(start,end)=>{minSp=start ? String(start) : '';maxSp=end!=null&&end<spCeiling ? String(end) : '';}}/></div>
              </div>
              <div class="stat-totals"><span>Stat total ≥</span><TextField id="veteran-min-total" label="Minimum stat total" hideLabel type="number" min={0} step={100} placeholder="Any" value={minTotal ? String(minTotal) : ''} oninput={event=>minTotal=Math.max(0,Number((event.currentTarget as HTMLInputElement).value)||0)}/></div>
            {:else if tab.id === 'aptitudes'}
              {#each ['Track','Distance','Style'] as group}<fieldset class="aptitude-filter-group"><legend>{group}</legend><div class="aptitude-options">{#each aptitudeFields.filter(field=>field.group===group) as field}<div class="aptitude-choice" class:chosen={!!aptitudeFilters[field.id]}><span>{field.label}</span><SelectFieldSlim id={'aptitude-'+field.id} label={field.label+' minimum grade'} hideLabel imageOnly options={gradeOptions} value={aptitudeFilters[field.id]??''} onchange={value=>setAptitude(field.id,value)}/></div>{/each}</div></fieldset>{/each}
            {:else if tab.id === 'skills'}
              <div class="filter-search"><Combobox id="veteran-skill-search" label="Find a learned skill" hideLabel placeholder="Search skills…" prefixIcon="search" options={skillOptions} bind:query={skillQuery} action maxResults={12} emptyText="No unselected skills match." onchange={value=>addSkill(Number(value))}/></div>
              {#if selectedSkills.length}<div class="selected-skills">{#each selectedSkills as skillId}{@const skill=skillCatalog.get(skillId)}<SkillChip name={skill?.name ?? `Skill ${skillId}`} icon={skillImage(skill?.icon)} rarity={skillRarity(skill,Boolean(skill?.inherited))} compact onremove={()=>selectedSkills=selectedSkills.filter(id=>id!==skillId)}/>{/each}</div>{/if}
              <p class="filter-help">{tab.help}</p>
            {:else if tab.id === 'parents'}
              <div class="uma-rules">{#each generations as generation}
                <IncludeExcludePicker compact label={generation.label} tone={generation.scope==='greatgrandparent' ? 'purple' : 'blue'} included={umaItems(include[generation.scope])} excluded={umaItems(exclude[generation.scope])} onadd={mode=>editUmas(generation.scope,mode)} onremove={(mode,id)=>removeAncestor(generation.scope,Number(id),mode==='exclude')}/>
              {/each}</div>
            {:else if tab.id === 'saddle'}
              <div class="schedule-filter">{#if scheduleLoading}<p>Loading races…</p>{:else if scheduleError}<Banner title={scheduleError} tone="danger"><Button variant="secondary" size="sm" onclick={loadSchedule}>Retry</Button></Banner>{:else}<div class="filter-search race-search"><Combobox id="veteran-race-search" label="Find a race win" hideLabel placeholder="Race name or grade…" prefixIcon="search" options={raceChoices.filter(race=>!selectedRaceIds.includes(race.id)).map(race=>({value:String(race.id),label:race.name,image:race.image,keywords:(race.grade ?? '')+' '+(race.searchText ?? '')}))} bind:query={raceQuery} action maxResults={12} onchange={toggleRace}/></div>{/if}
                <div class="selected-list selected-races">{#each selectedRaceIds as id}{@const race=raceChoices.find(race=>race.id===id)}{#if race?.grade}<RaceBadge race={{...race,id:String(id),grade:race.grade}} compact presentation="inline" removable onremove={()=>toggleRace(String(id))}/>{:else}<FilterChip label={race?.name ?? 'Race '+id} selected removable onremove={()=>toggleRace(String(id))}/>{/if}{/each}</div>
                <p>{selectedRaceIds.length} selected race{selectedRaceIds.length===1?'':'s'}</p>
              </div>
            {:else if tab.id === 'database'}
              <div class="database-quick">
                <SelectField id="filter-scenario" label="Training scenario" options={[{value:'',label:'Any scenario'},...Array.from(new Set(veterans.map(v=>v.scenario_id).filter((id):id is number=>id!=null))).map(id=>({value:String(id),label:veteranDisplay(veterans.find(v=>v.scenario_id===id)!,characters).scenario}))]} bind:value={scenarioFilter}/>
                <Slider id="filter-affinity" label="Minimum affinity" min={0} max={affinityCeiling} step={1} value={Number(minAffinity)||0} tone="pink" onchange={value=>minAffinity=value ? String(value) : ''}/>
                <Slider id="filter-whites" label="Minimum unique white sparks" min={0} max={whiteCeiling} step={1} value={Number(minWhites)||0} tone="white" onchange={value=>minWhites=value ? String(value) : ''}/>
              </div>
              <p class="filter-help">Totals include this veteran and both parents. Zero means any.</p>
              {#if metricError}<p class="filter-help">{metricError} <button class="retry-link" onclick={()=>void loadAffinity()}>Retry</button></p>{/if}
            {/if}
          </div>
        {/if}
      </section>
    {/each}
    <p class="card-filter-hint"><Icon name="info" size={15}/><span>Select a spark or skill on any card to add it as a filter.</span></p>
  </div>
{/snippet}

{#snippet activeChips()}
{#if activeCount}
      <div class="active-filter-chips" aria-label="Selected spark and skill filters">
        {#each selectedFactors as filter,index}
          {#if index}<span class="filter-operator">{filter.operator === 'or' ? 'OR' : 'AND'}</span>{/if}<FilterChip label={sparkLabel(filter)} selected removable onclick={()=>{openFilter('factors');factorCategory='all';void tick().then(()=>document.getElementById('factor-stars-'+index+'-start')?.focus({preventScroll:true}));}} onremove={()=>{selectedFactors=selectedFactors.filter((_,i)=>i!==index);}}/>
        {/each}
        {#each selectedSkills as skillId}
          <FilterChip label={skillCatalog.get(skillId)?.name??`Skill ${skillId}`} selected removable onclick={()=>openFilter('skills')} onremove={()=>selectedSkills=selectedSkills.filter(id=>id!==skillId)}/>
        {/each}
        {#if query.trim()}<FilterChip label={`Name: ${query.trim()}`} selected removable onremove={() => query = ''}/>{/if}
        {#if distance.length!==allDistances.length}<FilterChip label={distance.length ? 'Distance: '+distanceOptions.filter(item=>distance.includes(item.value)).map(item=>item.label).join(', ') : 'No distances selected'} selected removable onremove={()=>distance=[...allDistances]}/>{/if}
        {#if style.length!==allStyles.length}<FilterChip label={style.length ? 'Style: '+styleOptions.filter(item=>style.includes(item.value)).map(item=>item.label).join(', ') : 'No styles selected'} selected removable onremove={()=>style=[...allStyles]}/>{/if}
        {#if minSp||maxSp}<FilterChip label={'SP total '+(minSp&&maxSp ? minSp+'–'+maxSp : minSp ? '≥ '+minSp : '≤ '+maxSp)} selected removable onremove={()=>{minSp='';maxSp='';}}/>{/if}
        {#each [{value:minAffinity,label:targetId ? 'Target affinity' : 'Main affinity',clear:()=>minAffinity=''},{value:minWhites,label:'White count',clear:()=>minWhites=''}] as filter}{#if filter.value}<FilterChip label={filter.label+' ≥ '+filter.value} selected removable onremove={filter.clear}/>{/if}{/each}
        {#if scenarioFilter}<FilterChip label={'Scenario: '+scenarioFilter} selected removable onremove={()=>scenarioFilter=''}/>{/if}
        {#if appliedUql}<FilterChip label="UQL query" selected removable onclick={()=>openFilter('uql')} onremove={()=>{appliedUql='';uql='';}}/>{/if}
        {#if minTotal}<FilterChip label={`Total stats ≥ ${minTotal}`} selected removable onremove={() => minTotal = 0}/>{/if}
        {#each statFields as field}{#if statValue(field.id) !== bounds[field.id][0] || statValue(field.id,true) !== bounds[field.id][1]}<FilterChip label={`${field.label}: ${statValue(field.id)}–${statValue(field.id,true)}`} selected removable onremove={() => changeStat(field.id,bounds[field.id][0],bounds[field.id][1])}/>{/if}{/each}
        {#each aptitudeFields as field}{#if aptitudeFilters[field.id]}<FilterChip label={`${field.label}: ${aptitudeFilters[field.id]}+`} selected removable onremove={() => setAptitude(field.id,'')}/>{/if}{/each}
        {#each ['parent','grandparent','greatgrandparent'] as scope}{#each include[scope as AncestorScope] ?? [] as id}<FilterChip label={`Include ${characters.get(id)?.name ?? id} · ${scopeLabels[scope as AncestorScope]}`} selected removable onremove={() => removeAncestor(scope as AncestorScope,id)}/>{/each}{#each exclude[scope as AncestorScope] ?? [] as id}<FilterChip label={`Exclude ${characters.get(id)?.name ?? id} · ${scopeLabels[scope as AncestorScope]}`} selected removable onremove={() => removeAncestor(scope as AncestorScope,id,true)}/>{/each}{/each}
        {#if selectedRaceIds.length}<FilterChip label={`Race wins: ${selectedRaceIds.length}`} selected removable onremove={() => selectedRaceIds = []}/>{/if}
      </div>
    {/if}
{/snippet}

{#if !compact && !desktopFilters.current}
<div class="filter-drawer">
  <Dialog id="veteran-filters" bind:open={filterDrawerOpen} title={drawerView === 'filters' ? 'Filter veterans' : 'Sort veterans'} maxWidth="600px" maxHeight="calc(100dvh - 24px)" height="calc(100dvh - 24px)" contentPadding="0" mobileContentPadding="0">
    {#if filterDrawerOpen}
      {#if drawerView === 'filters'}
        {#if activeCount}<div class="drawer-selected">{@render activeChips()}</div>{/if}
        {@render filterFacets()}
      {:else}
        <div class="sort-drawer">
          <SelectField id="mobile-sort-direction" label="Order" options={sortDirectionOptions} bind:value={sortDirection}/>
          <div class="sort-choices" role="group" aria-label="Sort by">{#each sortOptions as option}<button class:selected={sortField === option.value} aria-pressed={sortField === option.value} onclick={()=>sortField=option.value as CollectionSortField}><span>{option.label}</span>{#if sortField === option.value}<Icon name="check" size={16}/>{/if}</button>{/each}</div>
        </div>
      {/if}
    {/if}
    {#snippet actions()}<div class="drawer-actions">{#if drawerView === 'filters'}<Button variant="ghost" disabled={!activeCount} onclick={clearFilters}>Reset all</Button>{/if}<Button onclick={showResults}>Show {filtered.length.toLocaleString()} veteran{filtered.length === 1 ? '' : 's'}</Button></div>{/snippet}
  </Dialog>
</div>
{/if}

{#if detail}
  <ProfileVeteranDialog veteran={detail} {accountId} summary={veteranSummary(veteranDisplay(detail,characters))} {skillCatalog} family={lineage(detail)} bind:open={detailOpen}/>
{/if}
<CharacterSelectDialog id="veteran-uma-rules" bind:open={umaOpen} options={targetOptions} loading={targetLoading} error={targetError} onretry={loadTargets} bind:selected={umaDraft} existing={((umaMode==='include' ? include : exclude)[umaScope]??[]).map(String)} mode={umaMode} multiple bind:sort={umaSort} onselect={selectUmas}/>
<CharacterSelectDialog id="veteran-target-select" bind:open={targetOpen} options={targetOptions} loading={targetLoading} error={targetError} onretry={loadTargets} selected={targetId ? [String(targetId)] : []} bind:sort={targetSort} onselect={values=>selectTarget(values[0]??'')}/>

<style>
  .veteran-grid > [data-virtual-index] { display:grid; min-width:0; }
  .card-display{display:grid;gap:10px;padding:0 0 16px;margin-bottom:16px;border-bottom:1px solid var(--border-subtle)}.card-display h3{margin:0 0 6px;font-size:11px;font-weight:600;color:var(--text-secondary)}.card-display :global(.segments){width:100%;padding:2px}.card-display :global(button){flex:1;min-width:0;padding-inline:6px;font-size:11px}
  .veterans-page { min-width:0; width:100%; display:grid; gap:20px; }
  .collection-header { min-width:0; display:grid; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle); }
  .collection-toolbar { min-width:0; display:flex; align-items:center; gap:8px; }
  .collection-toolbar>:global(.field) { flex:1; min-width:0; }.collection-toolbar>:global(.ui-button) { flex:none; }
  .collection-toolbar :global(input) { min-height:44px; border-color:var(--border-primary); border-radius:8px; background:var(--card-surface-bg); }
  .affinity-target { min-width:0; display:grid; gap:8px; padding-bottom:16px; border-bottom:1px solid var(--border-subtle); }
  .active-count { display:inline-grid; place-items:center; min-width:19px; min-height:19px; margin-left:6px; padding:1px 5px; border-radius:4px; background:var(--color-accent-soft); color:var(--accent-primary); font-size:10px; font-weight:600; }
  .mobile-sort { display:none; }
  .filter-drawer { display:contents; }.filter-drawer > :global(dialog > .dialog-panel) { overflow:hidden; }
  .filter-drawer > :global(dialog > .dialog-panel > .content) { scrollbar-gutter:stable; }
  .filter-drawer > :global(dialog > .dialog-panel > footer) { padding:12px 16px max(12px,env(safe-area-inset-bottom)); }
  .drawer-actions { display:flex; gap:8px; width:100%; }.drawer-actions>:global(.ui-button:last-child) { flex:1; min-height:44px; }
  .drawer-selected { padding:12px 16px; border-bottom:1px solid var(--border-subtle); }.drawer-selected .active-filter-chips { gap:5px; }.drawer-selected :global(.wrap) { font-size:11px; }
  .filter-facets { min-width:0; padding:0 16px 16px; }.filter-facet { min-width:0; }.filter-facet.expanded { border-bottom:1px solid var(--border-subtle); }
  .facet-heading { min-width:0; min-height:56px; display:flex; align-items:center; gap:8px; width:100%; padding:12px 0; border:0; background:transparent; color:var(--color-text); text-align:left; cursor:pointer; }.facet-heading strong { font-size:13px; font-weight:500; }.facet-heading>:global(svg:first-child) { flex:none; color:var(--color-text-muted); }.facet-heading>:global(svg:last-child) { margin-left:auto; color:var(--color-text-muted); }.facet-heading>:global(svg:last-child) { transform:rotate(-90deg); }.filter-facet.expanded .facet-heading>:global(svg:last-child) { transform:rotate(0); }.filter-facet.expanded .facet-heading { color:var(--accent-primary); }
  .facet-content { min-width:0; display:grid; gap:12px; padding:0 0 16px; }
  .primary-filters { display:grid; gap:14px; padding:12px 0 20px; }.primary-filters fieldset { min-width:0; margin:0; padding:0; border:0; }.primary-filters legend { display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:6px; padding:0; font-size:12px; font-weight:600; }.primary-filters legend>button { min-height:24px; padding:2px 4px; border:0; background:transparent; color:var(--color-text-muted); font:inherit; font-size:10px; font-weight:400; cursor:pointer; }.primary-filters legend>button:focus-visible { outline:2px solid var(--accent-primary); }.filter-choices { display:flex; flex-wrap:wrap; gap:4px; }.filter-choices button { min-height:30px; padding:4px 9px; border:1px solid var(--border-secondary); border-radius:5px; background:var(--factor-field-bg); color:var(--color-text-muted); font:inherit; font-size:11px; cursor:pointer; }.filter-choices button:hover { background:var(--surface-2); color:var(--color-text); }.filter-choices button.selected { border-color:var(--accent-primary); background:var(--factor-option-selected-bg); color:var(--factor-option-selected-text); }.filter-choices button:focus-visible { outline:2px solid var(--accent-primary); outline-offset:2px; }
  @media (max-width:767px) { .primary-filters legend>button { min-height:var(--touch-target); min-width:var(--touch-target); }.filter-choices button { min-height:var(--touch-target); min-width:var(--touch-target); } }
  .spark-categories { min-width:0; display:grid; gap:10px; padding:18px 0 20px; border-block:1px solid var(--border-subtle); }.spark-categories>header { display:flex; align-items:center; justify-content:space-between; min-height:18px; }.spark-categories h3,.more-filters-heading { margin:0; color:var(--color-text-muted); font-size:11px; font-weight:500; }.spark-category-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }.spark-category-grid>button { min-height:40px; display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border-secondary); border-radius:6px; background:var(--factor-field-bg); color:var(--color-text); text-align:left; font-size:11px; font-weight:500; cursor:pointer; }.spark-category-grid>button:hover { background:var(--surface-3); border-color:var(--accent-primary); }.spark-category-grid>button:focus-visible { outline:2px solid var(--accent-primary); outline-offset:2px; }.spark-category-grid>button.selected { background:var(--factor-option-selected-bg); border-color:var(--accent-primary); }.category-count { margin-left:auto; display:grid; place-items:center; min-width:17px; height:17px; padding:0 3px; border-radius:4px; background:var(--surface-3); font-size:10px; }.spark-category-star { font-size:15px; }.spark-category-star.blue { color:var(--accent-primary); }.spark-category-star.pink { color:var(--color-pink); }.spark-category-star.green { color:var(--accent-secondary); }.spark-category-star.white { color:var(--spark-white-text); }
  .more-filters-heading { padding:20px 0 8px; }.card-filter-hint { display:flex; align-items:start; gap:8px; margin:16px 0 0; color:var(--color-text-muted); font-size:11px; line-height:1.6; }.card-filter-hint>:global(svg) { flex:none; margin-top:2px; }
  .inline-spark-filters { min-width:0; padding-top:8px; }.inline-spark-filters :global(.spark-matcher) { padding:0; }
  .sort-drawer { min-width:0; display:grid; gap:16px; padding:16px; }.sort-choices { display:grid; }.sort-choices button { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:44px; padding:10px 12px; border:0; border-bottom:1px solid var(--border-subtle); background:transparent; color:var(--color-text-muted); text-align:left; font-size:13px; cursor:pointer; }.sort-choices button.selected { color:var(--accent-primary); background:var(--color-accent-soft); }
  @media(min-width:768px) { .filter-drawer > :global(dialog) { margin:12px 12px 12px auto; }.filter-drawer > :global(dialog > .dialog-panel) { border-radius:12px; } }
  .database-quick { display:grid; gap:14px; }
  .collection-uql { display:grid; gap:10px; min-width:0; scroll-margin-top:calc(var(--utility-height,60px) + 112px); }.collection-uql[hidden] { display:none; }.query-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }.query-actions small { color:var(--color-text-muted); font-size:11px; }
  .collection-uql :global(.uql-mode-panel) { padding:0; zoom:1; }.collection-uql :global(.cm-editor) { font-size:13px; }.collection-uql :global(.cm-scroller) { min-height:180px; }.collection-uql :global(.uql-editor-header) { flex-direction:row; align-items:center; }
  .retry-link { border:0; background:transparent; color:var(--color-accent); text-decoration:underline; cursor:pointer; }
  .collection-body { min-width:0; }.collection-body.with-sidebar { display:grid; grid-template-columns:288px minmax(0,1fr); align-items:start; gap:16px; }
  .filter-sidebar { position:sticky; top:calc(var(--utility-height,60px) + 16px); min-width:0; max-height:calc(100dvh - var(--utility-height,60px) - 32px); overflow-y:auto; scrollbar-width:thin; padding-right:12px; border-right:1px solid var(--border-subtle); }
  .sidebar-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:55px; margin-bottom:8px; border-bottom:1px solid var(--border-subtle); }.sidebar-heading h2 { display:flex; align-items:center; gap:8px; margin:0; font-size:14px; font-weight:600; }.sidebar-heading .active-count { margin:0; }.sidebar-heading :global(.ui-button) { padding-inline:4px; font-size:11px; }
  .filter-sidebar .filter-facets { padding:0 0 16px; }.filter-sidebar .facet-heading { min-height:40px; padding-block:8px; }.filter-sidebar .facet-heading strong { font-size:12px; }
  .filter-sidebar .facet-content :global(.select-control),.filter-sidebar .facet-content :global(input) { font-size:12px; }
  .collection-results { container:veteran-results / inline-size; min-width:0; display:grid; align-content:start; gap:16px; }
  .results-toolbar { scroll-margin-top:var(--utility-height,60px); min-width:0; display:flex; align-items:center; gap:8px; min-height:44px; padding-block:8px; border-bottom:1px solid var(--border-subtle); background:var(--color-canvas); }
  .result-count { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; margin-right:auto; color:var(--color-text-muted); font-size:12px; }
  .result-count>strong { color:var(--color-text); font-size:20px; font-weight:600; letter-spacing:-.04em; }
  .sort { min-width:0; display:flex; align-items:center; gap:2px; }
  .sort :global(.field) { width:154px; }
  .results-toolbar :global(.select-control) { background:transparent; }
  .display-options { display:flex; flex-wrap:wrap; gap:14px; padding:16px; border:1px solid var(--border-primary); border-radius:12px; background:var(--surface-1); }
  .display-options :global(.field) { flex:1; min-width:130px; }
  .display-options :global(.field:has(#veteran-columns)) { flex:0 0 72px; min-width:72px; }
  .filter-operator { align-self:center; color:var(--color-text-muted); font-size:10px; }
  .active-filter-chips { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }
  .active-filter-chips :global(.wrap) { max-width:100%; }.active-filter-chips :global(.wrap>button:first-child) { min-width:0; white-space:normal; text-align:left; }.active-filter-chips :global(.remove) { flex-shrink:0; }

  .filter-help { margin:0; font-size:11px; color:var(--color-text-muted); line-height:1.6; }

  .facet-header { display:flex; align-items:center; gap:8px; }.facet-heading { flex:1; }.clear-facet { flex:none; min-height:28px; padding:2px 0 2px 6px; border:0; background:transparent; color:var(--color-text-muted); font-size:10px; cursor:pointer; }
  .aptitude-filter-group { min-width:0; padding:0; margin:0; border:0; }.aptitude-filter-group legend { margin:0 0 6px; padding:0; font-size:10px; font-weight:600; color:var(--color-text-muted); }
  .stat-totals { display:grid; grid-template-columns:minmax(0,1fr) 110px; align-items:center; gap:8px; font-size:11px; color:var(--color-text-muted); }.stat-totals :global(input) { min-height:30px; height:30px; font-size:12px; }
  .stat-limits { display:grid; gap:6px; }.stat-limit { display:grid; grid-template-columns:28px minmax(0,1fr); align-items:start; gap:10px; min-width:0; }.stat-icon { width:24px; height:24px; margin-top:3px; }.sp-icon { width:28px; line-height:30px; font-size:16px; font-weight:700; color:var(--color-text); text-align:center; }.stat-limit :global(.field) { --slider-label-gap:1px; }.stat-limit :global(.slider-wrap),.stat-limit :global(.thumb) { height:30px; }.stat-limit :global(.visual-knob) { width:14px; height:14px; }.stat-limit :global(.track) { height:3px; }
  .aptitude-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 14px; }
  .aptitude-choice { --control-height:30px; position:relative; display:grid; grid-template-columns:minmax(0,1fr) 64px; align-items:center; min-width:0; gap:5px; font-size:11px; }
  .aptitude-choice>span { color:var(--color-text-muted); }.aptitude-choice.chosen>span { color:var(--color-text); }
  .aptitude-choice :global(.control-wrap) { position:static; }
  .aptitude-choice :global(.select-control) { padding:0 6px; gap:3px; font-size:11px; font-weight:500; border-radius:6px; }
  .aptitude-choice :global(.selected-copy) { gap:3px; }
  .aptitude-choice.chosen :global(.selected-copy)::before { content:'≥'; color:var(--color-text-muted); font-size:12px; }
  .aptitude-choice :global(.select-panel) { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; width:196px; padding:5px; left:0; right:auto; }
  .aptitude-choice:nth-child(even) :global(.select-panel) { left:auto; right:0; }
  .aptitude-choice :global(.select-panel button) { min-height:36px; padding:4px; border:0; border-radius:4px; font-size:11px; }
  .aptitude-choice :global(.select-panel button:first-child) { grid-column:1/-1; min-height:28px; }
  .aptitude-choice :global(.select-panel button.selected) { box-shadow:inset 0 0 0 1px var(--color-accent); }
  .aptitude-choice :global(.selected-copy img) { width:20px; height:20px; margin:0; }
  .aptitude-choice :global(.select-panel button img) { width:24px; height:24px; margin:0; }
  @media (max-width:767px) { .aptitude-choice :global(.select-panel button),.aptitude-choice :global(.select-panel button:first-child) { min-height:var(--touch-target); } }
  .facet-content>:global(.segments) { width:100%; }.facet-content :global(.segments button) { flex:1; padding:2px 6px; min-height:30px; font-size:10px; }
  .filter-search { min-width:0; }.filter-search :global(.combo-panel) { position:static; margin-top:4px; box-shadow:none; }.filter-search :global(input) { height:34px; font-size:12px; }
  .selected-list { display:flex; flex-wrap:wrap; gap:6px; }.selected-list :global(.wrap) { max-width:100%; font-size:10px; }.selected-list :global(.wrap>button:first-child) { min-width:0; white-space:normal; text-align:left; }
  .selected-skills { display:grid; gap:6px; min-width:0; }
  .schedule-filter { display:grid; gap:10px; min-width:0; }.schedule-filter>div,.schedule-filter>p { color:var(--color-text-muted); font-size:11px; }
  .selected-races :global(.race.inline) { width:max-content; flex:0 1 auto; }.race-search :global(.combo-panel img) { width:48px; height:24px; }.race-search :global(.combo-panel button) { padding:6px 8px; }
  @media(max-width:767px) { .aptitude-choice :global(.select-control),.clear-facet,.facet-content :global(.segments button) { min-height:var(--touch-target); }.stat-totals :global(input),.filter-search :global(input) { min-height:var(--touch-target); height:var(--touch-target); }.stat-limit :global(.slider-wrap),.stat-limit :global(.thumb) { height:var(--touch-target); }.stat-icon { margin-top:10px; }.sp-icon { line-height:44px; }.stat-limit :global(.visual-knob) { width:18px; height:18px; } }
  .veteran-grid { min-width:0; display:grid; grid-template-columns:repeat(var(--grid-columns),minmax(0,1fr)); align-items:stretch; gap:12px; }
  .inheritance-list { min-width:0; display:grid; gap:16px; }.inheritance-list>article { min-width:0; overflow-x:auto; padding:16px; border:1px solid var(--border-primary); border-radius:12px; background:var(--card-surface-bg); }.inheritance-list>article>:global(.ui-button) { margin-top:12px; }
  .uma-rules { min-width:0; display:grid; gap:12px; }.uma-rules>:global(.tree-box+.tree-box) { padding-top:12px; border-top:1px solid var(--border-primary); }
  .table-wrap { position:relative; min-width:0; overflow:auto; border:1px solid var(--border-primary); border-radius:var(--radius-lg); background:var(--card-surface-bg); }
  table { width:100%; min-width:1024px; table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:12px; }
  .character-column { width:252px; }.stats-column { width:198px; }.affinity-column { width:96px; }.aptitude-column { width:284px; }.details-column { width:56px; }
  th,td { padding:10px 8px; border-bottom:1px solid var(--border-subtle); text-align:left; vertical-align:middle; }
  thead th { color:var(--color-text-muted); font-size:11px; font-weight:500; background:var(--card-surface-bg); }
  thead th { padding-block:6px; }thead th :global(.ui-button) { justify-content:flex-start; width:100%; min-height:32px; padding:0; gap:4px; font-size:11px; font-weight:500; }
  tbody th { position:sticky; left:0; z-index:1; background:var(--card-surface-bg); border-right:1px solid var(--border-subtle); }
  tbody tr:hover>td,tbody tr:hover>th { background:var(--surface-2); }tbody tr:last-child>* { border-bottom:0; }
  .table-character { display:block; width:100%; padding:0; border:0; background:transparent; color:var(--color-text); text-align:left; cursor:pointer; }
  .table-character :global(.rarity) { flex-basis:100%; }
  .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .table-stats :global(.stats) { grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px 6px; border:0; background:transparent; }.table-stats :global(.stats>div) { flex-direction:row; justify-content:flex-start; align-items:center; gap:4px; padding:0; border:0; }.table-stats :global(.stats img) { width:13px; height:13px; }.table-stats :global(.stats dd) { font-size:12px; line-height:1.4; font-variant-numeric:tabular-nums; }
  .table-stats :global(.stats>[data-stat='total']) { grid-column:1/-1; background:transparent; }
  .table-stats :global([data-stat='total'] dt) { font-size:10px; letter-spacing:0; text-transform:none; }
  .table-stats :global([data-stat='sp'] dt) { order:-1; width:13px; flex:none; color:var(--color-text-muted); font-size:9px; font-weight:600; }
  .query-row td { padding:8px 12px; }
  .more { min-height:70px; display:flex; justify-content:center; align-items:center; gap:12px; color:var(--color-text-muted); font-size:12px; }
  .light-filters { display:grid; grid-template-columns:minmax(0,1.6fr) repeat(2,minmax(0,1fr)); gap:8px; }.compact-roster { padding:0; }
  .preview-pagination { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-2); padding-top:var(--space-2); border-top:1px solid var(--border-subtle); color:var(--color-text-muted); font-size:var(--font-xs); }.preview-pagination strong { color:var(--color-text); font-weight:600; }
  button:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
  @container veteran-results (max-width:1190px) { .veteran-grid { grid-template-columns:repeat(min(3,var(--grid-columns)),minmax(0,1fr)); } }
  @container veteran-results (max-width:870px) { .veteran-grid { grid-template-columns:repeat(min(2,var(--grid-columns)),minmax(0,1fr)); } }
  @container veteran-results (max-width:570px) { .veteran-grid { grid-template-columns:minmax(0,1fr); } }
  @media(max-width:767px) {
    .table-wrap { overscroll-behavior-x:contain; }
    table { zoom:.7; }
    .character-column { width:160px; }.stats-column { width:180px; }.aptitude-column { width:260px; }
    th,td { padding:4px; }
    thead th,thead th :global(.ui-button) { font-size:10px; }
    thead th :global(.ui-button) { min-height:36px; }
    thead th:first-child { position:sticky; left:0; z-index:2; }
    .table-character { min-height:44px; }
    .table-character :global(.veteran-identity) { grid-template-columns:28px minmax(0,1fr) auto; gap:6px; }
    .table-character :global(.portrait) { height:40px; }.table-character :global(.identity) { gap:3px; }
    .table-character :global(.identity h3) { font-size:11px; }.table-character :global(.identity-details) { gap:2px 4px; }
    .table-character :global(.scenario) { padding:1px 3px; font-size:8px; }.table-character :global(.race-style) { font-size:9px; }.table-character :global(.rarity) { font-size:7px; letter-spacing:.5px; }
    .table-character :global(.rank--md) { width:28px; height:28px; }.table-character :global(.rank strong) { font-size:9px; }
    .table-stats :global(.stats dd) { font-size:10px; }.table-stats :global([data-stat='total'] dt) { font-size:9px; }
    .table-stats :global([data-stat='sp'] dt) { width:auto; overflow:visible; }
    .table-factors :global(.spark-filter) { min-height:34px; }
    .veterans-page { gap:12px; }.collection-toolbar>:global(.ui-button) { padding-inline:10px; }
    .collection-results { gap:12px; }.results-toolbar { position:sticky; top:var(--utility-height,60px); z-index:20; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px; gap:6px; padding:8px 0; }.result-count { grid-column:1/3; min-height:26px; margin:0; font-size:11px; }.result-count>strong { font-size:16px; }.result-count :global(.ui-button) { min-height:26px; padding-inline:4px; font-size:11px; }.results-toolbar>:global(.ui-button:last-child) { grid-column:3; grid-row:1/3; height:var(--touch-target); align-self:end; padding:0; }.results-toolbar>:global(.ui-button) { width:100%; font-size:12px; }
    .desktop-sort { display:none; }.mobile-sort { display:block; }.mobile-sort>:global(.ui-button) { width:100%; font-size:12px; }.display-label { display:none; }
    .collection-header>.active-filter-chips { flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; scrollbar-width:thin; }.collection-header>.active-filter-chips :global(.wrap) { flex:none; max-width:280px; }.collection-header>.active-filter-chips :global(.wrap>button:first-child) { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.drawer-selected .active-filter-chips :global(.wrap) { max-width:100%; }
    .filter-facets { padding-inline:12px; }.spark-category-grid>button { min-height:var(--touch-target); }.facet-heading { min-height:52px; }.facet-content :global(input),.facet-content :global(.select-control) { min-height:var(--touch-target); }.filter-drawer > :global(dialog > .dialog-panel > header) { padding:10px 12px; }
    .veteran-grid,.compact-roster .veteran-grid { grid-template-columns:minmax(0,1fr); gap:12px; }.display-options { gap:12px; padding:12px; }.light-filters { grid-template-columns:repeat(2,minmax(0,1fr)); }.light-filters>:global(.field:first-child) { grid-column:1/-1; }
  }
</style>
