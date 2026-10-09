<script lang="ts">
  import type { Snippet } from 'svelte';
  import { normalizeVeteranRecord } from '@/lib/veterans/veteran-normalizer';
  import { veteranSupportCards } from '@/lib/veterans/veteran-profile';
  import RunnerTraining from './RunnerTraining.svelte';
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import ProfileVeteranIdentity from '@/pages/profile/ProfileVeteranIdentity.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import AptitudeGrid from '@/components/AptitudeGrid.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import type { AptitudeGradeValue } from '@/components/AptitudeGrade.svelte';
  import AptitudeGrade from '@/components/AptitudeGrade.svelte';
  import { runningStyleName } from '@/lib/race/race-display';
  import { identity, score, stats } from './analysis-view';
  let { runner, skillNames = new Map<number, string>(), expanded = false, compact = false, outfit, metrics, training, headerActions, raceContext }: { runner: RaceRunner; skillNames?: Map<number,string>; expanded?: boolean; compact?: boolean; outfit?: string; metrics?: Snippet; training?: Snippet; headerActions?: Snippet; raceContext?: { surface?:number; distance?:number } } = $props();
  const veteran=$derived.by(()=>{try{return normalizeVeteranRecord(runner.raw);}catch{return undefined;}});
  const supports=$derived(veteranSupportCards(runner.raw));
  const aptitudes=$derived([
    ['proper_ground_turf','Turf'],['proper_ground_dirt','Dirt'],['proper_distance_short','Sprint'],['proper_distance_mile','Mile'],
    ['proper_distance_middle','Medium'],['proper_distance_long','Long'],['proper_running_style_nige','Front'],
    ['proper_running_style_senko','Pace'],['proper_running_style_sashi','Late'],['proper_running_style_oikomi','End']
  ].flatMap(([key,label])=>typeof runner.raw[key!]==='number'?[{id:key!,label:label!,value:Number(runner.raw[key!])}]:[]));
  const grades = ['G','F','E','D','C','B','A','S'] as AptitudeGradeValue[];
  const aptitudeItems=$derived((aptitudes.length?aptitudes:Object.entries(runner.aptitudes).filter(([,value])=>value!==undefined).map(([id,value])=>({id,label:id[0]!.toUpperCase()+id.slice(1),value:value!}))).map(({id,label,value})=>({id,label,group:id.includes('distance')?'Distance':id.includes('ground')||id==='surface'?'Surface':'Style',grade:grades[Math.max(0,value-1)]??'G'})));
  const totalStats=$derived(Object.values(runner.stats).reduce((total,value)=>total+(value??0),0));
  const raceAptitudes=$derived.by(()=>{
    if(!raceContext)return [];
    const style=runner.result?.runningStyle??Number(runner.raw.runningStyle);
    const styleKey=['','nige','senko','sashi','oikomi','nige'][style];
    const surfaceKey=raceContext.surface===1?'turf':raceContext.surface===2?'dirt':undefined;
    const distance=raceContext.distance;
    const distanceKey=distance?distance<=1400?'short':distance<=1800?'mile':distance<=2400?'middle':'long':undefined;
    const aptitude=(key:string|undefined,aggregate:string)=>{
      const camel=key?.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase());
      const value=Number((key?runner.raw[key]??runner.raw[camel!]:undefined)??runner.raw[aggregate]);
      return grades[value-1];
    };
    return [
      {group:'Distance',label:distanceKey?({short:'Sprint',mile:'Mile',middle:'Medium',long:'Long'})[distanceKey]:'Distance',grade:aptitude(distanceKey?'proper_distance_'+distanceKey:undefined,'apt_distance')},
      {group:'Surface',label:surfaceKey?surfaceKey==='turf'?'Turf':'Dirt':'Surface',grade:aptitude(surfaceKey?'proper_ground_'+surfaceKey:undefined,'apt_ground')},
      {group:'Style',label:styleKey?runningStyleName(style,true):'Style',grade:aptitude(styleKey?'proper_running_style_'+styleKey:undefined,'apt_style')}
    ];
  });
</script>
<div class="build" class:compact>
  <header class="build-identity"><ProfileVeteranIdentity summary={compact?{...identity(runner),scenario:outfit??identity(runner).scenario}:identity(runner)} score={score(runner) || undefined}/>{@render headerActions?.()}</header>
  <div class="build-content">
  <section class="stat-overview">
    {#if compact}<header class="section-heading"><h3>Stats</h3><span>Total stats <strong>{totalStats.toLocaleString('en-US')}</strong></span></header>{/if}
    <StatStrip items={stats(runner)} presentation={compact||!expanded?'inline':'icons'} compact/>
    {#if raceContext&&!expanded}
      <div class="race-aptitudes" aria-label="Aptitudes for this race">
        {#each raceAptitudes as item}<span class="race-aptitude" title={item.group+' · '+item.label}><span>{item.group}</span>{#if item.grade}<AptitudeGrade grade={item.grade} label={item.label} size="xs"/>{:else}<span class="unknown-grade" aria-label={item.label+': not recorded'} title="Aptitude not recorded">—</span>{/if}<small>{item.label}</small></span>{/each}
      </div>
    {/if}
  </section>
  {#if expanded}
    {#if aptitudeItems.length}<section class="aptitude-overview">{#if compact&&raceContext&&aptitudes.length}<div class="full-aptitudes" aria-label="All aptitudes">{#each ['Distance','Surface','Style'] as group}<div><span>{group}</span><div>{#each aptitudeItems.filter(item=>item.group===group) as item}<span>{item.label}<AptitudeGrade grade={item.grade} label={item.label} size="xs"/></span>{/each}</div></div>{/each}</div>{:else if compact}<div class="compact-aptitudes" aria-label="Race aptitudes">{#each aptitudeItems as item}<span>{item.label}<AptitudeGrade grade={item.grade} label={item.label} size="xs"/></span>{/each}</div>{:else}<AptitudeGrid items={aptitudeItems} compact stretch/>{/if}</section>{/if}
    {@render metrics?.()}
    <section class="skills-section">
    {#if compact}<h3>Learned skills <span>{runner.skillIds.length}</span></h3>{/if}
    <div class="skills">{#each runner.skillIds as id}<RaceSkill {id} name={skillNames.get(id)}/>{/each}</div>
    </section>
    {@render training?.()}
    {#if !training}<RunnerTraining deck={supports.map(card=>({id:card.support_card_id,lb:card.limit_break_count??0}))} parents={veteran?.parents} ownFactors={veteran?.factors} label={runner.name}/>{/if}
  {/if}
  </div>
</div>
<style>.build{display:grid;gap:10px;min-width:0;container-type:inline-size}.skills{display:flex;flex-wrap:wrap;gap:5px}small{font-size:10px;color:var(--text-secondary)}
.build-content{display:contents}.stat-overview,.aptitude-overview,.skills-section{display:grid;gap:8px;min-width:0}.build-identity{min-width:0}.compact{display:grid;gap:0}.compact .build-identity{padding:6px 10px}.compact .build-content{display:grid;align-content:start;gap:8px;padding:0 10px 10px}.compact h3{display:flex;align-items:center;gap:5px;margin:0;font-size:13px;font-weight:600}.compact h3>span{color:var(--text-secondary);font-size:11px;font-weight:400}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.section-heading>span{font-size:10px;color:var(--text-secondary)}.section-heading strong{font-size:11px;margin-left:4px;color:var(--text-primary);font-weight:600;font-variant-numeric:tabular-nums}.compact .skills-section{align-content:start}.compact .skills :global(.skill-chip){min-height:25px;font-size:11px;max-width:100%}.compact .skills :global(.skill-chip img){width:25px;height:25px}.compact .skills :global(.skill-body){min-height:25px}.compact .skills :global(.skill-name){white-space:normal;overflow:visible;overflow-wrap:anywhere}
.compact .build-identity{padding-block:6px}
.compact .build-content{gap:8px}
.compact .stat-overview,.compact .aptitude-overview{gap:4px}
.build-identity{display:flex;align-items:center;gap:8px}.build-identity>:global(.veteran-identity){flex:1}
.compact .stat-overview :global(.inline-stats>div){padding-block:3px;background:transparent;border:0}
.compact .stat-overview :global(.inline-stats dd){font-size:13px}
.compact-aptitudes{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary)}.compact-aptitudes>span{display:inline-flex;align-items:center;gap:5px}
.race-aptitudes{display:flex;align-items:center;justify-content:center;gap:14px;font-size:10px;color:var(--text-secondary)}.race-aptitude{display:inline-flex;align-items:center;gap:4px}.unknown-grade{font-size:12px}

.race-aptitudes{justify-content:flex-start;gap:14px;flex-wrap:wrap}.race-aptitude small{font-size:9px}.full-aptitudes{display:grid;gap:6px}.full-aptitudes>div{display:grid;grid-template-columns:52px minmax(0,1fr);gap:8px;align-items:center}.full-aptitudes>div>span{font-size:10px;color:var(--text-secondary)}.full-aptitudes>div>div{display:flex;flex-wrap:wrap;gap:8px 14px}.full-aptitudes>div>div>span{display:inline-flex;align-items:center;gap:4px;font-size:10px}
</style>
