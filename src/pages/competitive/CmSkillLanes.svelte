<script lang="ts">
  import {onMount,onDestroy,untrack} from 'svelte';
  import Button from '@/components/Button.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import {loadSkillCatalog,resolveEncodedSkill,type SkillCatalogEntry} from '@/lib/catalog/skill-catalog';
  import {cmGet,snapshotPath,pct,number} from './cm-data';
  import {activationBins,centralActivationWindow,type SkillDetail,type SkillOverview} from './cm-exploration';
  let {overview,style='all',selected=$bindable([]),removable=true}:{overview:SkillOverview;style?:string;selected?:number[];removable?:boolean}=$props();
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
    const bars=bins.map((count,bin)=>{const height=count/peak*80;return count>0?'M'+(bin*10+1)+','+(90-height)+'h8v'+height+'h-8Z':'';}).join('');
    return {id,bins,bars,total:bins.reduce((sum,n)=>sum+n,0),window:detail?centralActivationWindow(bins,detail.courseDistance):undefined};
  }));
  const distanceLabel=$derived(Math.round(cursor*overview.courseDistance/100)+'–'+Math.round((cursor+1)*overview.courseDistance/100)+' m');
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
    <div class="lanes" aria-label="Skill activation lanes">
      {#each lanes as lane,index (lane.id)}
        <section class="lane" style:--lane-color={['var(--accent-primary)','var(--accent-purple)','var(--accent-secondary)'][index%3]}>
          {#if removable}<div class="lane-heading"><span class="lane-identity"><RaceSkill id={lane.id}/><small>[Id {lane.id}]</small></span><IconButton icon="close" size="sm" label={'Remove '+name(lane.id)+' from comparison'} onclick={()=>remove(lane.id)}/></div>{/if}<p class="event-count"><strong>{number(lane.total)}</strong> activation events</p>
          {#if failures[lane.id]}<p role="alert">{failures[lane.id]}</p><Button size="sm" variant="secondary" onclick={()=>attempt++}>Retry activation data</Button>
          {:else if !details[lane.id]}<p role="status">Loading {name(lane.id)}…</p>
          {:else}
            <svg viewBox="0 0 1000 100" role="slider" tabindex="0" aria-label={name(lane.id)+' activation distribution'} aria-describedby={helpId} aria-valuemin={0} aria-valuemax={99} aria-valuenow={cursor} aria-valuetext={distanceLabel+': '+number(lane.bins[cursor]??0)+' events, '+pct((lane.bins[cursor]??0)/Math.max(1,lane.total))} preserveAspectRatio="none" onpointermove={inspectDistance} onpointerdown={inspectDistance} onkeydown={inspectWithKeyboard}>
              {#each [0,250,500,750,1000] as x}<line x1={x} x2={x} y1="0" y2="95" class="guide"/>{/each}
              <title>{distanceLabel}: {number(lane.bins[cursor]??0)} events ({pct((lane.bins[cursor]??0)/Math.max(1,lane.total))})</title>
              <path d={lane.bars} fill="var(--lane-color)"/>
              <line x1={cursor*10+5} x2={cursor*10+5} y1="0" y2="96" class="cursor"/>
            </svg>
            <div class="distance-axis">{#each [0,.5,1] as f}<span>{number(Math.round(overview.courseDistance*f))} m</span>{/each}</div>
            <div class="lane-reading"><span>Central 80% of events <strong>{lane.window?lane.window.join('–')+' m':'No events'}</strong></span><span>{distanceLabel} <strong>{number(lane.bins[cursor]??0)} events · {pct((lane.bins[cursor]??0)/Math.max(1,lane.total))}</strong></span></div>
          {/if}
        </section>
      {:else}<div class="empty"><h3>Choose skills from the table.</h3><p>Add skills to inspect their distributions on the same distance axis.</p></div>{/each}
    </div>
    <details class="reading-note"><summary>How to read activation distances</summary><p id={helpId} class="caption">Hover or tap a chart to inspect events. With the chart focused, use arrow keys to move through distances or Home and End to reach either end. Each lane scales to its own peak; heights are not comparable across skills. The window covers the 10th–90th percentile of events. Repeated activations count separately.</p></details>
</section>
<style>
.timing{min-width:0}.reading-note{margin-top:8px}.reading-note summary{font-size:10px;color:var(--text-secondary);cursor:pointer}.lanes{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}.lane+.lane{border-top:1px solid var(--border-subtle);padding-top:16px}.lane{min-width:0;padding:0}.lane-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px}.lane-identity{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;min-width:0}.lane-identity small{font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.lane-heading>:global(.icon-button){flex:none}.event-count{font-size:11px;color:var(--text-secondary);margin:0 0 8px}.event-count strong{font-weight:550;color:var(--color-text);font-variant-numeric:tabular-nums}.lane svg{display:block;width:100%;height:80px;cursor:crosshair}.lane svg:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}.guide{stroke:var(--border-subtle);stroke-dasharray:2 4}.cursor{stroke:var(--text-secondary);stroke-dasharray:4 3}.lane-reading{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px 20px;font-size:10px;color:var(--text-secondary);margin-top:10px}.lane-reading>span{display:flex;justify-content:space-between;gap:6px}.lane-reading strong{font-weight:500;color:var(--color-text);font-variant-numeric:tabular-nums}.distance-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);margin-top:8px}.caption{font-size:10px;line-height:1.7;color:var(--text-secondary);margin:8px 0 0}.empty{padding:40px 0;text-align:center;grid-column:1/-1}.empty h3{font-size:16px}.empty p,p[role]{font-size:12px;color:var(--text-secondary)}
@media(max-width:900px){.lane-reading{display:flex;justify-content:space-between;flex-wrap:wrap}.lane-reading>span{gap:10px}.caption{font-size:10px}}
@media(max-width:500px){.lane-reading{display:grid}.lane-reading>span{justify-content:space-between}}
</style>
