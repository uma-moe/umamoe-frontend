<script lang="ts">
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import ProfileVeteranIdentity from '@/pages/profile/ProfileVeteranIdentity.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import AptitudeGrade, { type AptitudeGradeValue } from '@/components/AptitudeGrade.svelte';
  import { identity, score, stats } from './analysis-view';
  let { runner, outfit, color, modified=false, labelStats=true, showScore=true, layout='stack' }: {
    runner:RaceRunner; outfit?:string; color?:string; modified?:boolean; labelStats?:boolean; showScore?:boolean; layout?:'stack'|'row';
  }=$props();
  const grades='GFEDCBAS';
</script>
<div class="runner-summary" class:row={layout==='row'} style:--runner-color={color??'var(--accent-primary)'}>
  <ProfileVeteranIdentity summary={{...identity(runner),scenario:outfit??identity(runner).scenario}} score={showScore?score(runner)||undefined:undefined}/>
  <div class="summary-build">
    <StatStrip items={stats(runner)} presentation={labelStats?'inline':'values'} compact={layout==='row'} label={runner.name+' stats'}/>
    <div class="race-aptitudes" aria-label="Race aptitudes">
      {#each [['distance','Distance'],['surface','Surface'],['style','Style']] as [key,label]}
        {@const grade=grades[(runner.aptitudes[key as keyof RaceRunner['aptitudes']]??0)-1]}
        <span>{label}{#if grade}<AptitudeGrade grade={grade as AptitudeGradeValue} {label} size="xs"/>{:else}<span aria-label={label+': not recorded'}>—</span>{/if}</span>
      {/each}
      {#if modified}<small class="modified">Modified</small>{/if}
    </div>
  </div>
</div>
<style>
  .runner-summary,.summary-build{display:grid;gap:4px;min-width:0;width:100%}
  .runner-summary :global(.veteran-identity){grid-template-columns:52px minmax(0,1fr) auto;gap:8px}.runner-summary :global(.portrait){height:56px}.runner-summary :global(.identity){gap:4px}.runner-summary :global(.identity h3){font-size:14px}.runner-summary :global(.race-style){color:var(--runner-color)}.runner-summary :global(.rank){gap:0}.runner-summary :global(.rank strong){font-size:10px}
  .runner-summary :global(.inline-stats>div){border:0;padding:3px 0;background:transparent}.runner-summary :global(.inline-stats dt){font-size:9px}.runner-summary :global(.inline-stats dd){font-size:13px}
  .race-aptitudes{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--text-secondary);font-size:10px}.race-aptitudes>span{display:inline-flex;align-items:center;gap:4px}.modified{margin-left:auto;color:var(--accent-primary);font-size:10px}
  .row{grid-template-columns:minmax(0,1fr) 210px;gap:8px;align-items:center}.row :global(.veteran-identity){grid-template-columns:44px minmax(0,1fr) auto}.row :global(.portrait){height:48px}.row :global(.identity h3){font-size:13px}.row :global(.identity-details){gap:3px 6px}.row :global(.race-style){font-size:10px}.row .race-aptitudes{justify-content:flex-end;gap:4px 8px;font-size:9px}
  @container(max-width:400px){.row{grid-template-columns:minmax(0,1fr);gap:0}.row .summary-build{width:auto;margin-left:52px}.row .race-aptitudes{justify-content:flex-start}}
</style>
