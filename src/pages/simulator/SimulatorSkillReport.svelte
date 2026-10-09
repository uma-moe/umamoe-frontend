<script lang="ts">
  import ChartFrame from '@/components/ChartFrame.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import RunnerReference from '@/pages/competitive/RunnerReference.svelte';
  import RaceSkill from '@/pages/competitive/RaceSkill.svelte';
  import SimulatorSkillDistributions from './SimulatorSkillDistributions.svelte';
  import {skillDistributions,type SkillDistributionRow} from './skill-distributions';
  import type {MonteCarloResult} from './simulator-repository';
  import type {SimulatorUma} from './simulator-uma';
  let {result,umas,distance}:{result:MonteCarloResult;umas:SimulatorUma[];distance:number}=$props();
  let open=$state(false),source=$state(0),selected=$state(0),mode=$state('time'),expanded=$state<Record<number,boolean>>({});
  const runners=$derived(umas.map((uma,source)=>{
    const {rows}=skillDistributions(result,source,uma.skills.map(skill=>skill.skillId));
    const timed=rows.flatMap(row=>row.procs.filter(({proc})=>proc[6]>=0)),bins=Array<number>(36).fill(0);
    for(const {proc} of timed)bins[Math.min(bins.length-1,Math.max(0,Math.floor(proc[5]/Math.max(1,distance)*bins.length)))]!++;
    return {uma,source,rows,bins,timed:timed.length,never:rows.filter(row=>!row.triggered).length,activations:rows.reduce((sum,row)=>sum+row.total,0),active:rows.reduce((sum,row)=>sum+row.activePerRace,0)};
  }));
  const peak=$derived(Math.max(1,...runners.flatMap(runner=>runner.bins)));
  const allOpen=$derived(runners.every(runner=>expanded[runner.source]??true));
  function inspect(runner:number,skill:SkillDistributionRow){source=runner;selected=skill.id;mode=skill.duration!==undefined?'time':'binomial';open=true;}
</script>
<section class="skill-report" aria-label="Skill report">
  <ChartFrame plain surface id="simulator-skill-report" title="Skill performance" description="Every runner and every owned skill, including skills that never activated. Rates and summaries use all sampled races.">
    {#snippet actions()}<Button variant="ghost" size="sm" onclick={()=>expanded=Object.fromEntries(runners.map(runner=>[runner.source,!allOpen]))}>{allOpen?'Collapse skill tables':'Expand skill tables'}</Button>{/snippet}
    {#if !result.skill_procs}<p class="empty">Run a new batch to include activation timings and duration distributions.</p>{:else}
      <section class="activation-overview" aria-label="Skill activation overview"><h4>When skills activate</h4><p>Timed and instant activation events by course distance. Shared scales; passive effects are excluded.</p>
        <div class="overview-labels" aria-hidden="true"><span>Runner</span><span>Course distance: 0–{distance.toLocaleString()} m</span><span>Events / race</span><span>Unobserved</span></div>
        {#each runners as runner}<div class="activation-row" data-runner-index={runner.source} data-timed-events={runner.timed}><RunnerReference name={runner.uma.name} cardId={runner.uma.cardId} compact/>
          <svg viewBox="0 0 360 40" preserveAspectRatio="none" role="img" aria-label={runner.uma.name+': '+runner.timed+' timed and instant activations across the batch, distributed along the course'}><rect x="0" y="0" width="60" height="40" class="early"/><rect x="60" y="0" width="180" height="40" class="mid"/><rect x="240" y="0" width="120" height="40" class="late"/>{#each runner.bins as count,bin}<rect x={bin*10+.5} y={38-count/peak*34} width="9" height={count/peak*34} class="activation-bin"><title>{count} activations · {Math.round(distance*bin/36)}–{Math.round(distance*(bin+1)/36)} m</title></rect>{/each}<line x1="240" x2="240" y1="0" y2="40" class="phase-line"/></svg>
          <span class="reading">{(runner.activations/result.runs).toFixed(2)}<small>incl. passives</small></span><span class="reading">{runner.never}<small>of {runner.rows.length} skills</small></span>
        </div>{/each}
        <div class="phase-key"><span>Early: first ⅙</span><span>Mid race: ⅙–⅔</span><span>Late race: final ⅓</span></div>
      </section>
      <div class="runner-skills">{#each runners as runner}
        <details class="skill-card" data-runner-index={runner.source} open={expanded[runner.source]??true} ontoggle={event=>expanded[runner.source]=event.currentTarget.open}>
          <summary><RunnerReference name={runner.uma.name} cardId={runner.uma.cardId} compact/><span class="runner-skill-summary"><strong>{runner.rows.length-runner.never}/{runner.rows.length} observed</strong><span>{runner.never} never activated · {(runner.activations/result.runs).toFixed(2)} activations/race · {runner.active.toFixed(1)} summed skill-seconds/race</span></span><span class="chevron">⌄</span></summary>
          {#if expanded[runner.source]??true}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables must be reachable with the keyboard.) -->
          <div class="skill-table-scroll" role="region" aria-label={runner.uma.name+' full skill results'} tabindex="0"><table><caption>{runner.uma.name}: all learned and recorded skills</caption><thead><tr><th scope="col">Skill</th><th scope="col">Lv.</th><th scope="col">Activation rate</th><th scope="col">Procs / race</th><th scope="col">Activation time</th><th scope="col">Course distance</th><th scope="col">Duration / proc</th></tr></thead><tbody>
            {#each runner.rows as skill}<tr class:unobserved={!skill.triggered}>
              <th scope="row"><button class="skill-link" aria-label={'Inspect skill '+skill.id+' for '+runner.uma.name} onclick={()=>inspect(runner.source,skill)}><RaceSkill id={skill.id}/></button></th>
              <td>{runner.uma.skills.some(owned=>owned.skillId===skill.id)?runner.uma.skills.find(owned=>owned.skillId===skill.id)?.level??1:'—'}</td>
              <td><strong>{skill.rate.toFixed(1)}%</strong><small>{skill.triggered}/{result.runs} races</small><small>95%: {skill.interval[0].toFixed(1)}–{skill.interval[1].toFixed(1)}%</small></td>
              <td><strong>{(skill.total/result.runs).toFixed(2)}</strong><small>{skill.total} total · max {skill.countSummary?.max??0}</small></td>
              <td><strong>{skill.timing?skill.timing.mean.toFixed(1)+' s':'—'}</strong>{#if skill.timing}<small>80%: {skill.timing.p10.toFixed(1)}–{skill.timing.p90.toFixed(1)}</small>{/if}</td>
              <td><strong>{skill.distances?Math.round(skill.distances.mean).toLocaleString()+' m':'—'}</strong>{#if skill.distances}<small>80%: {Math.round(skill.distances.p10).toLocaleString()}–{Math.round(skill.distances.p90).toLocaleString()}</small>{/if}</td>
              <td><strong>{skill.passive?'Passive':skill.durations?skill.durations.mean.toFixed(2)+' s':skill.instant?'Instant':'—'}</strong>{#if skill.durations}<small>80%: {skill.durations.p10.toFixed(2)}–{skill.durations.p90.toFixed(2)}</small><small>{skill.activePerRace.toFixed(2)} s/race</small>{/if}</td>
            </tr>{:else}<tr><td colspan="7">No skills in this build.</td></tr>{/each}
          </tbody></table></div>{/if}
        </details>
      {/each}</div>
      <p class="note">Select a skill for binomial activation probabilities, timing, distance, duration and proc-count distributions. “Summed skill-seconds” adds recorded positive durations and counts overlapping skills separately. Unobserved skills have no timing or duration estimate. Activation times use elapsed simulation seconds; official finish times use a different clock.</p>
    {/if}
  </ChartFrame>
</section>
<Dialog bind:open title={umas[source]?.name+' · Skill analysis'} maxWidth="900px" maxHeight="90dvh">
  {#if open}<SimulatorSkillDistributions {result} {umas} {distance} source={String(source)} bind:mode bind:selected focusOnly/>{/if}
  {#snippet actions()}<Button variant="secondary" onclick={()=>open=false}>Close</Button>{/snippet}
</Dialog>
<style>
  .skill-report{min-width:0}.activation-overview{min-width:0;margin-bottom:24px}.activation-overview h4{margin:0;font-size:13px}.activation-overview>p{font-size:10px;line-height:1.6;color:var(--text-secondary);margin:5px 0 12px}.overview-labels,.activation-row{display:grid;grid-template-columns:190px minmax(0,1fr) 100px 90px;gap:16px;align-items:center}.overview-labels{font-size:10px;color:var(--text-secondary);padding-bottom:8px}.overview-labels>span:nth-last-child(-n+2){text-align:right}.activation-row{padding:7px 0;border-top:1px solid var(--border-subtle);min-width:0}.activation-row svg{width:100%;height:40px;display:block;min-width:0}.early{fill:var(--accent-secondary);fill-opacity:.06}.mid{fill:var(--accent-primary);fill-opacity:.06}.late{fill:var(--accent-purple);fill-opacity:.06}.activation-bin{fill:var(--accent-primary);fill-opacity:.55}.phase-line{stroke:var(--text-secondary);stroke-width:.5;stroke-dasharray:3 3}.reading{text-align:right;font-size:12px;font-variant-numeric:tabular-nums}.reading small{display:block;font-size:9px;color:var(--text-secondary);margin-top:4px}.phase-key{display:flex;justify-content:space-between;gap:8px;margin:8px 206px 0;font-size:9px;color:var(--text-secondary)}
  .runner-skills{display:grid;gap:12px}.skill-card{min-width:0;border:1px solid var(--border-subtle);border-radius:var(--radius-md)}.skill-card>summary{display:flex;align-items:center;gap:14px;padding:12px 14px;cursor:pointer;list-style:none}.skill-card>summary::-webkit-details-marker{display:none}.runner-skill-summary{display:grid;gap:4px;margin-left:auto;text-align:right;min-width:0;font-size:11px}.runner-skill-summary strong{font-weight:500}.runner-skill-summary>span{font-size:10px;color:var(--text-secondary);line-height:1.5}.chevron{color:var(--text-secondary);flex:none}.skill-card[open] .chevron{transform:rotate(180deg)}.skill-card :global(.runner-name strong){font-size:12px}.skill-card :global(.runner-reference .art){width:25px;height:30px}.skill-table-scroll{overflow:auto;max-width:100%;scrollbar-width:thin;padding:0 14px 10px}table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}caption{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}th,td{text-align:right;white-space:nowrap;border-top:1px solid var(--border-subtle);padding:8px 9px;vertical-align:middle}thead th{font-size:9px;font-weight:500;color:var(--text-secondary);padding-top:10px;padding-bottom:10px}th:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--surface-1);max-width:270px;min-width:180px}td strong{display:block;font-size:11px;font-weight:500}td small{display:block;font-size:9px;color:var(--text-secondary);margin-top:4px}.unobserved td strong{color:var(--text-secondary)}.skill-link{display:block;border:0;background:transparent;cursor:pointer;color:var(--text-primary);font:inherit;padding:0;min-width:0;max-width:100%;text-align:left}.skill-link :global(.skill-chip){max-width:100%;min-width:0}.skill-link :global(.skill-name){font-size:11px}.skill-link:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}.note,.empty{font-size:10px;line-height:1.7;color:var(--text-secondary);margin:12px 0 0}
  @container race-main (max-width:850px){.overview-labels{display:none}.activation-row{grid-template-columns:minmax(0,1fr) 90px 80px;gap:8px}.activation-row svg{grid-column:1/-1;grid-row:2}.phase-key{margin-inline:0}.runner-skill-summary>span{max-width:350px}}
  @media(max-width:600px){.activation-row{grid-template-columns:minmax(0,1fr) 70px 65px}.reading{font-size:11px}.reading small{font-size:8px}.skill-card>summary{padding:10px;flex-wrap:wrap;gap:8px}.runner-skill-summary{order:3;width:100%;text-align:left}.chevron{margin-left:auto}.skill-table-scroll{padding:0 8px 8px}th:first-child{min-width:135px;max-width:150px}.skill-link :global(.skill-name){font-size:10px}.skill-link :global(.skill-chip img){width:20px;height:20px}th,td{padding:8px 6px}.phase-key{font-size:8px}.skill-report :global(.chart-tools){justify-content:flex-start}}
</style>
