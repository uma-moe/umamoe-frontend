<script lang="ts">
  import { onMount } from 'svelte';
  import { watchFactorCatalog } from '@/lib/catalog/factor-catalog';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import VeteranSummary from '@/components/VeteranSummary.svelte';
  import ProfileVeteranCard from '@/pages/profile/ProfileVeteranCard.svelte';
  import ProfileVeteranSparkMatcher from '@/pages/profile/ProfileVeteranSparkMatcher.svelte';
  import type { VeteranFactorFilter } from '@/lib/profile/profile-veterans';
  import type { ProfileVeteran } from '@/pages/profile/profile-repository';
  import StatisticsFilterControls from '@/pages/statistics/StatisticsFilterControls.svelte';
  import StatisticsRanking from '@/pages/statistics/StatisticsRanking.svelte';
  import StatisticsDeckMatrix from '@/pages/statistics/StatisticsDeckMatrix.svelte';
  import StatisticsChartPanel from '@/pages/statistics/StatisticsChartPanel.svelte';
  import { theme } from '@/stores/theme';
  import DemoBlock from './DemoBlock.svelte';
  import { veteranFixture, oguriCapImage, mejiroMcQueenImage } from './fixtures';
  let { ids }: { ids: string[] } = $props();
  onMount(watchFactorCatalog);
  const allScenarios = ['1','2','3','4'], allClasses = ['1','2','3','4','5','6'], allDistances = ['1','2','3','4','5'];
  let selectedScenarios = $state([...allScenarios]), selectedClasses = $state([...allClasses]), selectedDistances = $state([...allDistances]);
  let filtersOpen = $state(false);
  const sparkDefaults: VeteranFactorFilter[] = [{factorId:10,minLevel:1,scope:'any',mode:'total'},{factorId:20,minLevel:1,scope:'any',mode:'total',operator:'and'}];
  let sparkRules = $state(structuredClone(sparkDefaults));
  const scopeLabels = {parent:'Main',grandparent:'Parents',greatgrandparent:'Grandparents',family:'Main + parents',any:'Any generation',p1:'P1',p2:'P2'};
  const characters = new Map([[101301,{id:'101301',name:'Mejiro McQueen',image:mejiroMcQueenImage}],[100601,{id:'100601',name:'Oguri Cap',image:oguriCapImage}]]);
  const selectedSamples = $derived(selectedScenarios.length * selectedClasses.length * selectedDistances.length * 10000);
  function reset() { selectedScenarios = [...allScenarios]; selectedClasses = [...allClasses]; selectedDistances = [...allDistances]; }
  const veteran: ProfileVeteran = { id:1, member_id:null, card_id:101301, distance_type:4, running_style:2, speed:1542, stamina:1312, power:1184, guts:702, wiz:1138, rank_score:29412, rarity:5, fans:980453, factors:[103,1203], succession_chara_array:[{position_id:10,card_id:100601,rank:1,rarity:1,talent_level:1,factor_id_array:[103]},{position_id:20,card_id:106701,rank:1,rarity:1,talent_level:1,factor_id_array:[1203]}] };
  const option = $derived({ animation:false, grid:{left:45,right:15,top:20,bottom:35}, tooltip:{trigger:'axis'}, xAxis:{type:'category',data:['Sprint','Mile','Medium','Long','Dirt'],axisLabel:{color:$theme === 'dark' ? '#aaa' : '#555'}}, yAxis:{type:'value',axisLabel:{color:$theme === 'dark' ? '#aaa' : '#555'},splitLine:{lineStyle:{color:$theme === 'dark' ? '#333' : '#ddd'}}}, series:[{type:'bar',data:[420,780,940,660,280],itemStyle:{color:'#61b4ed',borderRadius:[3,3,0,0]},barMaxWidth:42}] });
</script>

{#if ids.includes('veteran-card')}<DemoBlock id="veteran-card"><div class="preview-narrow"><ProfileVeteranCard {veteran} summary={veteranFixture} skillCatalog={new Map()}/></div></DemoBlock>{/if}
{#if ids.includes('veteran-spark-matcher')}<DemoBlock id="veteran-spark-matcher"><div class="preview-stack" style="max-width:320px"><ProfileVeteranSparkMatcher bind:filters={sparkRules} {characters} {scopeLabels}/><Button variant="ghost" size="sm" onclick={() => sparkRules = structuredClone(sparkDefaults)}>Reset spark rules</Button></div></DemoBlock>{/if}
{#if ids.includes('veteran-summary')}<DemoBlock id="veteran-summary"><VeteranSummary veteran={veteranFixture}/></DemoBlock>{/if}
{#if ids.includes('statistics-filters')}<DemoBlock id="statistics-filters"><div class="preview-narrow preview-stack"><StatisticsFilterControls {allScenarios} {allClasses} {allDistances} bind:selectedScenarios bind:selectedClasses bind:selectedDistances {selectedSamples}/><div class="preview-row"><Button variant="secondary" onclick={() => filtersOpen = true}>Open filter dialog</Button><Button variant="ghost" onclick={reset}>Reset filters</Button></div></div></DemoBlock>{/if}
{#if ids.includes('statistics-ranking')}<DemoBlock id="statistics-ranking"><StatisticsRanking id="lab-statistics-ranking" title="Uma usage" description="Sample data. Bars are relative to the leading result." searchable items={[{id:'100601',name:'Oguri Cap',image:oguriCapImage,value:640,percentage:64},{id:'101301',name:'Mejiro McQueen',image:mejiroMcQueenImage,value:360,percentage:36}]}/></DemoBlock>{/if}
{#if ids.includes('statistics-deck-matrix')}<DemoBlock id="statistics-deck-matrix"><div class="preview-narrow"><StatisticsDeckMatrix id="lab-deck-matrix" items={[{id:'speed-stamina',name:'3× speed · 2× stamina · 1× friend',value:1284,percentage:42.8,composition:{speed:3,stamina:2,friend:1}},{id:'speed-power',name:'2× speed · 2× power · 2× wit',value:960,percentage:32,composition:{speed:2,power:2,wisdom:2}},{id:'guts-wit',name:'3× guts · 2× wit · 1× group',value:756,percentage:25.2,composition:{guts:3,wiz:2,group:1}}]}/></div></DemoBlock>{/if}
{#if ids.includes('statistics-chart')}<DemoBlock id="statistics-chart"><StatisticsChartPanel id="lab-statistics-chart" title="Training samples by distance" description="Sample data using the statistics page chart renderer." {option}/></DemoBlock>{/if}
<Dialog id="lab-statistics-filters" title="Statistics filters" icon="filter" maxWidth="540px" bind:open={filtersOpen}><StatisticsFilterControls {allScenarios} {allClasses} {allDistances} bind:selectedScenarios bind:selectedClasses bind:selectedDistances {selectedSamples}/>{#snippet actions()}<Button variant="ghost" icon="refresh" onclick={reset}>Reset filters</Button><Button onclick={() => filtersOpen = false}>Show results</Button>{/snippet}</Dialog>
