<script lang="ts">
  import {onMount,onDestroy,untrack} from 'svelte';
  import Button from '@/components/Button.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import {loadSkillCatalog,resolveEncodedSkill,type SkillCatalogEntry} from '@/lib/catalog/skill-catalog';
  import {cmGet,snapshotPath,pct,number} from './cm-data';
  import {activationBins,centralActivationWindow,type SkillDetail,type SkillOverview} from './cm-exploration';
  import {courseSegments,type Course} from '../race-analysis/replay-course';
  let {overview,style='all',selected=$bindable([]),removable=true,course,courseLabel}:{overview:SkillOverview;style?:string;selected?:number[];removable?:boolean;course?:Course;courseLabel?:string}=$props();
  const helpId=$props.id();
  let attempt=$state(0),cursor=$state(50),details=$state<Record<number,SkillDetail>>({}),failures=$state<Record<number,string>>({});
  let catalog=$state.raw(new Map<number,SkillCatalogEntry>());
  onMount(()=>{void loadSkillCatalog().then(value=>catalog=value).catch(()=>{});});
  const name=(id:number)=>resolveEncodedSkill(catalog,id).skill?.name??'Skill '+id;
  $effect(()=>{overview.snapshotId;details={};failures={};});
  $effect(()=>{
    const id=overview.snapshotId,ids=[...selected],distance=overview.courseDistance;attempt;if(!distance)return;
    const controller=new AbortController();
    for(const skill of ids){
      if(untrack(()=>details[skill]))continue;
      cmGet<SkillDetail>(snapshotPath(id,'skills/details/'+skill),controller.signal,id).then(value=>{
        if(controller.signal.aborted)return;
        if(value.skillId!==skill||value.bucketCount!==100||value.courseDistance!==distance)throw new Error('The activation data does not match this skill or course.');
        details[skill]=value;delete failures[skill];
      }).catch(e=>{if(!controller.signal.aborted)failures[skill]=e.message;});
    }
    return()=>controller.abort();
  });
  const lanes=$derived(selected.map(id=>{
    const detail=details[id],bins=detail?activationBins(detail,style):Array<number>(100).fill(0);
    const peak=Math.max(1,...bins);
    const bars=bins.map((count,bin)=>{const height=count/peak*74;return count>0?'M'+(bin*10+1)+','+(96-height)+'h8v'+height+'h-8Z':'';}).join('');
    return {id,bins,bars,total:bins.reduce((sum,n)=>sum+n,0),window:detail?centralActivationWindow(bins,detail.courseDistance):undefined};
  }));
  const distanceLabel=$derived(Math.round(cursor*overview.courseDistance/100)+'–'+Math.round((cursor+1)*overview.courseDistance/100)+' m');
  // Race phases use 4, 12, 4, 4 of 24 course sections: https://github.com/jalbarrang/torena-sim/blob/main/docs/mechanics/README.md#phase-phase
  const phases=$derived([
    {label:'Early race',short:'Early',start:0,end:overview.courseDistance/6,color:'var(--text-secondary)'},
    {label:'Mid race',short:'Mid',start:overview.courseDistance/6,end:overview.courseDistance*2/3,color:'var(--accent-primary)'},
    {label:'Late race',short:'Late',start:overview.courseDistance*2/3,end:overview.courseDistance*5/6,color:'var(--accent-warning)'},
    {label:'Final leg',short:'Final',start:overview.courseDistance*5/6,end:overview.courseDistance,color:'var(--accent-purple)'}
  ]);
  const segments=$derived.by(()=>{
    const sections=courseSegments(course),first=sections[0];
    return first&&first.start>0?[{start:0,end:first.start,label:'Start section',color:'#8c939f'},...sections]:sections;
  });
  const cursorDistance=$derived((cursor+.5)*overview.courseDistance/100);
  const currentPhase=$derived(phases.find(phase=>cursorDistance>=phase.start&&cursorDistance<phase.end)!.label);
  const currentSegment=$derived(segments.find(segment=>cursorDistance>=segment.start&&cursorDistance<segment.end)?.label);
  const slope=$derived(course?.slopes.find(s=>cursorDistance>=s.start&&cursorDistance<s.start+s.length)?.slope??0);
  const courseReading=$derived([currentPhase,currentSegment,course?(slope?(slope>0?'Uphill +':'Downhill ')+(slope/10000).toFixed(1)+'%':'Level ground'):undefined].filter(Boolean).join(' · '));
  const sectionLabel=(label:string,start:number,end:number)=>label+' · '+number(Math.round(start))+'–'+number(Math.round(end))+' m';
  function remove(id:number){selected=selected.filter(value=>value!==id);}
  let frame=0,clientX=0,target:SVGSVGElement;
  function cancelPointer(){if(frame)cancelAnimationFrame(frame);frame=0;}
  onDestroy(cancelPointer);
  function inspectWithKeyboard(event:KeyboardEvent){
    if(!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();cancelPointer();
    cursor=event.key==='Home'?0:event.key==='End'?99:Math.max(0,Math.min(99,cursor+(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)));
  }
  function inspectDistance(event:PointerEvent){
    target=event.currentTarget as SVGSVGElement;clientX=event.clientX;
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;if(!target.isConnected)return;
      const rect=target.getBoundingClientRect();
      if(rect.width)cursor=Math.max(0,Math.min(99,Math.floor((clientX-rect.left)/rect.width*100)));
    });
  }
</script>
<section class="timing">
    {#if selected.length}<div class="course-context"><div class="course-identity">{#if !removable}<span class="event-count"><strong>{details[lanes[0]!.id]?number(lanes[0]!.total):'—'}</strong> activation events</span>{/if}<span>{courseLabel??number(overview.courseDistance)+' m course'}</span></div><div class="course-tools"><span class="course-reading">{courseReading}</span><InspectPopover label="How to read activation distances" align="end">
      {#snippet trigger()}<Icon name="info" size={15}/>{/snippet}
      <div class="activation-help"><h3>How to read activation distances</h3><p>Hover or tap a chart to inspect events and the course at that distance. Use arrow keys while the chart is focused, or Home and End to reach either end.</p><p>Shaded regions show the race legs. The final leg covers the last sixth of the course; each runner’s last spurt can begin at a different distance. The strip below marks straights and corners, and the readout shows the slope at the cursor.</p><p>Each chart scales to its own peak, so bar heights across skills do not indicate equal event counts. The central 80% range covers the 10th–90th percentile of events. Repeated activations count separately.</p></div>
    </InspectPopover></div></div>{/if}
    <span id={helpId} class="sr-only">Use arrow keys, Home, or End to inspect activation distances. Shading shows race legs and the strip below shows course sections. Each skill’s bars scale to its own peak.</span>
    <div class="lanes" aria-label="Skill activation lanes">
      {#each lanes as lane,index (lane.id)}
        <section class="lane" class:card={removable} aria-labelledby={removable?helpId+'-'+lane.id:undefined} style:--lane-color={['var(--accent-primary)','var(--accent-purple)','var(--accent-secondary)'][index%3]}>
          {#if removable}<div class="lane-heading"><span class="lane-identity" id={helpId+'-'+lane.id}><RaceSkill id={lane.id}/><small>[Id {lane.id}]</small></span><p class="event-count"><strong>{details[lane.id]?number(lane.total):'—'}</strong> events</p><IconButton icon="close" size="sm" label={'Remove '+name(lane.id)+' from comparison'} onclick={()=>remove(lane.id)}/></div>{/if}
          <div class="chart-stack">
            <div class="lane-chart">
            <div class="phase-background" role="img" aria-label={'Race legs: '+phases.map(p=>sectionLabel(p.label,p.start,p.end)).join('; ')}>{#each phases as phase}<span style:left={phase.start/overview.courseDistance*100+'%'} style:width={(phase.end-phase.start)/overview.courseDistance*100+'%'} style:--phase-color={phase.color}><span class="phase-label">{phase.label}</span><span class="phase-short">{phase.short}</span></span>{/each}</div>
            {#if failures[lane.id]}<div class="activation-error"><p role="alert">{failures[lane.id]}</p><Button size="sm" variant="secondary" onclick={()=>{delete failures[lane.id];attempt++;}}>Retry activation data</Button></div>
            {:else if !details[lane.id]}<Spinner size={32} centered label={'Loading '+name(lane.id)+'…'}/>
            {:else}
            <svg viewBox="0 0 1000 100" role="slider" tabindex="0" aria-label={name(lane.id)+' activation distribution'} aria-describedby={helpId} aria-valuemin={0} aria-valuemax={99} aria-valuenow={cursor} aria-valuetext={distanceLabel+': '+number(lane.bins[cursor]??0)+' events, '+pct((lane.bins[cursor]??0)/Math.max(1,lane.total))} preserveAspectRatio="none" onpointermove={inspectDistance} onpointerdown={inspectDistance} onkeydown={inspectWithKeyboard}>
              {#each [0,250,500,750,1000] as x}<line x1={x} x2={x} y1="20" y2="100" class="guide"/>{/each}
              <title>{distanceLabel}: {number(lane.bins[cursor]??0)} events ({pct((lane.bins[cursor]??0)/Math.max(1,lane.total))})</title>
              <path d={lane.bars} fill="var(--lane-color)"/>
            </svg>
            {/if}
            </div>
            <div class="course-bands" role="img" aria-label={course?'Course sections: '+segments.map(s=>sectionLabel(s.label,s.start,s.end)).join('; '):'Track sections unavailable'}>
              {#each segments as segment}<span style:left={segment.start/overview.courseDistance*100+'%'} style:width={(segment.end-segment.start)/overview.courseDistance*100+'%'} style:--segment-color={segment.color} title={sectionLabel(segment.label,segment.start,segment.end)}><span>{segment.label}</span></span>{:else}<span class="track-unavailable">Track sections unavailable</span>{/each}
            </div>
            {#if details[lane.id]}<span class="course-cursor" style:left={cursor+.5+'%'} aria-hidden="true"></span>{/if}
          </div>
          <div class="distance-axis">{#each [0,.5,1] as f}<span>{number(Math.round(overview.courseDistance*f))} m</span>{/each}</div>
          <div class="lane-reading"><span>Central 80% of events <strong>{details[lane.id]?(lane.window?lane.window.join('–')+' m':'No events'):'—'}</strong></span><span>{distanceLabel} <strong>{details[lane.id]?number(lane.bins[cursor]??0)+' events · '+pct((lane.bins[cursor]??0)/Math.max(1,lane.total)):'—'}</strong></span></div>
        </section>
      {:else}<div class="empty"><h3>Choose skills from the table.</h3><p>Add skills to inspect their distributions on the same distance axis.</p></div>{/each}
    </div>
</section>
<style>
.course-context{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 16px;margin-bottom:4px;font-size:10px;line-height:1.4;color:var(--text-secondary)}.course-identity{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;min-width:0}.course-identity>.event-count{margin:0;font-size:10px}
.course-tools{display:flex;align-items:center;gap:8px;min-width:0}.course-reading{min-width:0;font-variant-numeric:tabular-nums}
.course-tools :global(.inspect){flex:none}.course-tools :global(.inspect>.trigger){display:grid;place-items:center;min-width:28px;min-height:28px;width:28px;height:28px;border-radius:var(--radius-sm)}.course-tools :global(.inspect>.trigger:hover){color:var(--accent-primary);background:var(--color-accent-soft)}
.activation-help h3{font-size:13px;line-height:1.5;margin:0}.activation-help p{font-size:12px;line-height:1.6;color:var(--text-secondary);margin:8px 0 0}
.chart-stack{position:relative}.lane-chart{position:relative;isolation:isolate;height:72px;display:grid;align-items:center}
.phase-background{position:absolute;inset:0;z-index:-1;pointer-events:none}.phase-background>span{position:absolute;inset-block:0;box-sizing:border-box;background:color-mix(in srgb,var(--phase-color) 8%,transparent);border-right:1px dashed color-mix(in srgb,var(--text-secondary) 30%,transparent)}.phase-background>span:last-child{border-right:0}
.phase-label,.phase-short{position:absolute;top:2px;left:2px;right:2px;font-size:9px;line-height:12px;text-align:center;color:var(--text-secondary);white-space:nowrap;overflow:hidden}.phase-short{display:none}
.activation-error{position:relative;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 12px}.activation-error p{margin:0}.lane-chart>:global(.spinner){position:relative}
.course-bands{position:relative;height:16px;margin-top:2px;overflow:hidden}.course-bands>span{position:absolute;inset-block:0;box-sizing:border-box;min-width:0;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:9px;line-height:16px;border-right:1px solid var(--surface-1);color:var(--text-secondary);background:color-mix(in srgb,var(--segment-color) 22%,transparent);box-shadow:inset 0 -2px var(--segment-color)}.course-bands>.track-unavailable{width:100%;background:none;box-shadow:none;color:var(--text-secondary);font-size:9px;text-align:left;padding:0;border:0}
.course-cursor{position:absolute;top:16px;bottom:0;border-left:1px dashed var(--text-secondary);pointer-events:none}
.timing{min-width:0}.lanes{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.lane{min-width:0;padding:0}.lane.card{padding:10px 14px 12px;background:var(--surface-1);border-radius:var(--radius-lg)}.lane-heading{display:flex;align-items:center;gap:10px;min-height:30px;margin-bottom:6px}.lane-heading .event-count{margin:0 0 0 auto;flex:none;font-size:10px}.lane-identity{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;min-width:0}.lane-identity small{font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.lane-heading>:global(.icon-button){flex:none;width:26px;height:26px}.event-count{font-size:11px;color:var(--text-secondary);margin:0 0 8px}.event-count strong{font-weight:550;color:var(--color-text);font-variant-numeric:tabular-nums}.lane svg{position:relative;display:block;width:100%;height:72px;cursor:crosshair}.lane svg:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}.guide{stroke:var(--border-subtle);stroke-dasharray:2 4}.lane-reading{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px 20px;font-size:10px;color:var(--text-secondary);margin-top:6px}.lane-reading>span{display:flex;justify-content:space-between;gap:6px}.lane-reading strong{font-weight:500;color:var(--color-text);font-variant-numeric:tabular-nums}.distance-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);margin-top:4px}.empty{padding:40px 0;text-align:center;grid-column:1/-1}.empty h3{font-size:16px}.empty p,p[role]{font-size:12px;color:var(--text-secondary)}
@media(max-width:900px){.lane-reading{display:flex;justify-content:space-between;flex-wrap:wrap}.lane-reading>span{gap:10px}}
@media(max-width:500px){.lane-heading{flex-wrap:wrap;gap:5px}.lane-heading .event-count{order:2;width:100%;margin:0}.lane-heading>:global(.icon-button){margin-left:auto}.lane.card{padding:10px 12px}.lane-reading{display:grid}.lane-reading>span{justify-content:space-between}}
.timing{container-type:inline-size;container-name:skill-timing}
@container skill-timing (max-width:600px){.course-context{display:grid;grid-template-columns:minmax(0,1fr)}.course-tools{justify-content:space-between}.course-bands>span>span,.phase-label{display:none}.phase-short{display:block}}
</style>
