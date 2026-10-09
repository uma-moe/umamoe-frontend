<script lang="ts">
  import Artwork from '@/components/Artwork.svelte';
  import {portrait} from '@/pages/competitive/analysis-view';
  import {raceFieldSpread,type RaceTrajectory} from '@/lib/race/race-ensemble';
  import type {RaceRunner} from '@/lib/race/race-capture-parser';
  let {trajectories,time,runners,selected=$bindable('0'),teamColor}:{trajectories:RaceTrajectory[];time:number;runners:RaceRunner[];selected?:string;teamColor:(runner:RaceRunner)=>string}=$props();
  const rows=$derived(raceFieldSpread(trajectories,time));
  const max=$derived(Math.max(10,Math.ceil(Math.max(...rows.flatMap(row=>[row.p90,row.mean]))/10)*10));
  const x=(gap:number)=>Math.min(100,gap/max*100);
</script>
<section class="spread" aria-label="Runner gap distributions" data-ensemble-count={trajectories.length}>
  <header><strong>Field spread</strong><span>Gap to each race’s leader · Lower is better</span><div class="legend"><i class="dot"></i>Mean <i class="band"></i>Middle 50% / 80%</div></header>
  <div class="spread-grid"><div class="axis"><span>Uma</span><div>{#each [0,.25,.5,.75,1] as tick}<span style:left={tick*100+'%'}>{Math.round(tick*max)} m</span>{/each}</div><span>Mean gap</span></div>
  {#each runners as runner}
    {@const row=rows[runner.index]!}
    <button class="spread-row" class:chosen={selected===String(runner.index)} style:--runner-color={teamColor(runner)} aria-label={'Follow '+runner.name} aria-pressed={selected===String(runner.index)} onclick={()=>selected=String(runner.index)} data-runner-index={runner.index} data-mean-gap={row.mean}>
      <span class="identity"><Artwork src={portrait(runner.cardId)} alt="" size="xs"/><strong>{runner.name}</strong></span>
      <span class="range" role="img" aria-label={runner.name+': mean gap '+row.mean.toFixed(1)+' metres; middle 80% '+row.p10.toFixed(1)+'–'+row.p90.toFixed(1)+' metres'}>
        {#each [0,.25,.5,.75,1] as tick}<i class="grid-line" style:left={tick*100+'%'}></i>{/each}
        <i class="outer" style:left={x(row.p10)+'%'} style:width={Math.max(.4,x(row.p90)-x(row.p10))+'%'}></i><i class="inner" style:left={x(row.p25)+'%'} style:width={Math.max(.4,x(row.p75)-x(row.p25))+'%'}></i><i class="mean" style:left={x(row.mean)+'%'}></i>
      </span><span class="value">{row.mean.toFixed(1)}<small> m</small></span>
    </button>
  {/each}</div>
  <p>Aligned by elapsed time; gaps are calculated within each race. Field gaps freeze when that race’s winner finishes.</p>
</section>
<style>
  .spread{grid-column:1/-1;min-width:0}header{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding-bottom:8px;font-size:11px}header>strong{font-size:13px}header>span,p{font-size:10px;color:var(--text-secondary)}.legend{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:9px;color:var(--text-secondary)}.dot{width:6px;height:6px;border-radius:50%;background:var(--text-primary)}.band{width:24px;height:6px;background:var(--accent-primary);opacity:.4}.axis,.spread-row{display:grid;grid-template-columns:150px minmax(80px,1fr) 65px;gap:14px;align-items:center}.axis{font-size:9px;color:var(--text-secondary);height:22px}.axis>div{position:relative;height:14px}.axis>div>span{position:absolute;transform:translateX(-50%);white-space:nowrap}.axis>div>span:first-child{transform:none}.axis>div>span:last-child{transform:translateX(-100%)}.axis>span:last-child{text-align:right}.spread-row{width:100%;min-height:29px;padding:2px 0;border:0;border-top:1px solid var(--border-subtle);border-radius:0;background:transparent;color:var(--text-primary);text-align:left;cursor:pointer;font:inherit}.spread-row:hover,.spread-row.chosen{background:var(--color-accent-soft)}.spread-row:focus-visible{outline:2px solid var(--accent-primary);outline-offset:-2px}.identity{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px}.identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.identity :global(.art){width:22px;height:24px;border:0;background:transparent;flex:none}.range{height:24px;position:relative;display:block}.grid-line{position:absolute;top:0;bottom:0;border-left:1px solid var(--border-subtle)}.outer,.inner{position:absolute;top:8px;height:8px;background:var(--runner-color);opacity:.2;border-radius:3px}.inner{opacity:.55;height:10px;top:7px}.mean{position:absolute;top:8px;height:8px;width:8px;border:1px solid var(--surface-1);border-radius:50%;transform:translateX(-50%);background:var(--text-primary)}.value{text-align:right;font-size:12px;font-variant-numeric:tabular-nums}.value small{font-size:9px;color:var(--text-secondary)}p{margin:6px 0 0;line-height:1.5}@media(max-width:600px){.axis,.spread-row{grid-template-columns:100px minmax(60px,1fr) 48px;gap:8px}.identity{font-size:10px}.identity :global(.art){width:18px;height:22px}.legend{margin-left:0}.spread-row{min-height:32px}header>span{width:100%}}
</style>
