<script lang="ts">
  import { onMount } from 'svelte';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { describeCourse, trackName } from '@/lib/catalog/course-catalog';
  import { loadReplayCourses, courseSegments, type CourseData } from '@/pages/race-analysis/replay-course';
  import { courseTerrain } from '@/pages/race-analysis/replay-timeline';
  import SimulatorCoursePreview from './SimulatorCoursePreview.svelte';
  let { course, showOutline = true, showHeader = true, compact = false }: { course?: CourseCatalogEntry; showOutline?: boolean; showHeader?: boolean; compact?: boolean } = $props();
  let data = $state.raw<CourseData>(), error = $state(''), inspected = $state('');
  const profile = $derived(course && data?.courses[course.course_id]);
  const sections = $derived(profile ? courseSegments(profile,true).map(segment=>{
    const corner=segment.label.toLowerCase().includes('corner') ? profile.corners.findIndex(corner=>segment.start>=corner.start && segment.start<corner.start+corner.length)+1 : 0;
    return {...segment,label:segment.label==='Corner'?'Corner '+corner:segment.label,short:corner?'C'+corner:segment.label==='Final straight'?'Finish str.':segment.label==='Straight'?'Straight →':'—'};
  }) : []);
  const bands = $derived(profile ? [
    {id:'slopes',label:'Slopes',segments:courseTerrain(profile).slopes.map(slope=>({
      start:slope.start,end:slope.end,
      label:slope.slope ? (slope.slope>0?'↗ +':'↘ ')+(slope.slope/10000).toFixed(1)+'%' : 'Flat',
      color:slope.slope>0?'#bd7581':slope.slope<0?'#719bdd':'#737d8a'
    }))},
    {id:'sections',label:'Sections',segments:sections},
    {id:'phase',label:'Race phase',segments:[
      {start:0,end:profile.distance/6,label:'Early',color:'var(--accent-secondary)'},
      {start:profile.distance/6,end:profile.distance*2/3,label:'Mid race',color:'var(--accent-primary)'},
      {start:profile.distance*2/3,end:profile.distance,label:'Late race',color:'var(--accent-purple)'}
    ]},
    {id:'race-sections',label:'24 sections',segments:Array.from({length:24},(_,index)=>({
      start:profile.distance*index/24,end:profile.distance*(index+1)/24,
      label:'Section '+(index+1),short:String(index+1),color:'#737d8a'
    }))}
  ] : []);
  const selected = $derived(bands.flatMap(band=>band.segments.map((segment,index)=>({...segment,id:band.id+'-'+index,band:band.label}))).find(segment=>segment.id===inspected));
  $effect(()=>{course?.course_id;inspected='';});
  onMount(() => { let active = true;
    void loadReplayCourses().then(value => { if (active) data = value; }).catch(reason => { if (active) error = (reason as Error).message; });
    return () => { active = false; };
  });
  const range = (start: number, end: number) => Math.round(start).toLocaleString()+'–'+Math.round(end).toLocaleString()+' m';
</script>

<section class="profile" class:compact class:without-outline={!showOutline} aria-label="Course profile">
  {#if showHeader}<header><div class="course-heading"><h2>{course ? trackName(course.race_track_id) : 'Course profile'}</h2><span>{course ? describeCourse(course) : 'Select a course to see its layout'}</span></div>{#if compact}<span class="preview-label">Course overview</span>{/if}</header>{/if}
  <div class="profile-body">
    <div class="distance-profile">
      <div class="breakdown-heading"><h3>Course breakdown</h3>{#if profile}<div class="course-distances"><span title="The final third begins here; last spurt can begin from this distance.">Spurt from {Math.round(profile.distance*2/3).toLocaleString()} m</span><span>{profile.distance.toLocaleString()} m</span></div>{/if}</div>
      {#if profile}
        <div class="timeline" role="region" aria-label="Course timeline">
        <div class="bands">
          {#each bands as band}
            <div class="profile-row" data-band={band.id}><span class="row-label">{band.label}</span><div class="band">
              {#each band.segments as segment,index}
                {@const id=band.id+'-'+index}
                <button class="segment" class:unspecified={segment.label==='Unspecified'} class:flat={segment.label==='Flat'} class:selected={inspected===id} style:left={segment.start/profile.distance*100+'%'} style:width={(segment.end-segment.start)/profile.distance*100+'%'} style:--segment-color={segment.color} aria-label={band.label+': '+segment.label+', '+range(segment.start,segment.end)} title={segment.label+': '+range(segment.start,segment.end)} aria-pressed={inspected===id} onclick={()=>inspected=id} onfocus={()=>inspected=id} onpointermove={()=>inspected=id}>
                  <span class="segment-name">{segment.label}{#if segment.label==='Straight'} →{/if}</span>
                  {#if 'short' in segment}<span class="segment-short" aria-hidden="true">{segment.short}</span>{/if}
                  {#if band.id!=='slopes' && band.id!=='race-sections' && segment.start>0}<span class="segment-distance" aria-hidden="true">{Math.round(segment.start).toLocaleString()} m</span>{/if}
                </button>
              {/each}
            </div></div>
          {/each}
          <div class="axis">{#each [0,1,2,3,4] as tick}<span style:left={tick*25+'%'}>{Math.round(profile.distance*tick/4).toLocaleString()} m</span>{/each}</div>
        </div>
        </div>
        <p class="section-detail" aria-live="polite">{#if selected}<i style:background={selected.color}></i><strong>{selected.label}</strong><span>{range(selected.start,selected.end)} · {Math.round(selected.end-selected.start).toLocaleString()} m</span>{:else}Hover a section to highlight it on the track.{/if}</p>
      {:else}<div class="profile-empty" role="status">{error || (data && course ? 'Course profile unavailable' : course ? 'Loading course profile…' : 'Choose a track and course above.')}</div>{/if}
    </div>
    {#if showOutline}<div class="outline"><SimulatorCoursePreview {course} interactive highlight={selected}/></div>{/if}
  </div>
</section>
<style>
  .profile{--profile-label-width:64px;min-width:0;padding:16px;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);container:course-profile / inline-size}
  header{display:flex;align-items:center;gap:12px;margin-bottom:16px}h2{margin:0;font-size:14px}.course-heading{display:flex;align-items:baseline;gap:8px 12px;flex-wrap:wrap;min-width:0}.course-heading>span{font-size:11px;color:var(--text-secondary)}.preview-label{margin-left:auto;color:var(--text-secondary);font-size:10px;white-space:nowrap}
  .profile-body{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:20px;align-items:center}.distance-profile{min-width:0;container:course-breakdown / inline-size}.breakdown-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap}.breakdown-heading h3{margin:0;font-size:13px;font-weight:600}.course-distances{display:flex;gap:8px 16px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary)}
  .timeline{min-width:0}
  .bands{display:grid;min-width:0;gap:0}.profile-row{display:grid;grid-template-columns:var(--profile-label-width) minmax(0,1fr);gap:10px;align-items:center}.row-label{display:flex;align-items:center;align-self:stretch;font-size:10px;color:var(--text-secondary)}.band{position:relative;height:34px;background:var(--surface-2);overflow:hidden}.profile-row:first-child .band{border-radius:var(--radius-sm) var(--radius-sm) 0 0}.profile-row[data-band='sections'] .band{height:48px}.profile-row[data-band='phase'] .band{height:42px}.profile-row[data-band='race-sections'] .band{height:28px;border-radius:0 0 var(--radius-sm) var(--radius-sm)}.profile-row[data-band='race-sections'] .segment{padding:0;font-size:9px;font-weight:400;background:color-mix(in srgb,var(--segment-color) 10%,var(--surface-1));border-bottom-width:1px}.profile-row[data-band='race-sections'] .segment-name{display:none}.profile-row[data-band='race-sections'] .segment-short{display:block;visibility:visible}
  .band:after{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to right,transparent 0,transparent calc(25% - 1px),color-mix(in srgb,var(--text-primary) 8%,transparent) calc(25% - 1px),color-mix(in srgb,var(--text-primary) 8%,transparent) 25%)}
  .segment{position:absolute;top:0;height:100%;display:flex;justify-content:center;align-items:center;min-width:0;padding:0 3px;overflow:hidden;white-space:nowrap;border:0;border-right:1px solid color-mix(in srgb,var(--segment-color) 35%,var(--surface-1));border-bottom:3px solid var(--segment-color);background:color-mix(in srgb,var(--segment-color) 24%,var(--surface-1));color:var(--text-primary);font:inherit;font-size:11px;font-weight:600;cursor:pointer;container:course-segment / inline-size}
  .segment-name{overflow:hidden;text-overflow:clip}.segment-short{display:none}.segment-distance{position:absolute;bottom:3px;left:4px;font-size:8px;font-weight:400;color:var(--text-secondary)}.segment:has(.segment-distance){padding-bottom:10px}.segment.unspecified{background:repeating-linear-gradient(135deg,transparent,transparent 4px,color-mix(in srgb,var(--segment-color) 16%,transparent) 4px,color-mix(in srgb,var(--segment-color) 16%,transparent) 6px);color:var(--text-secondary)}.segment.flat{background:color-mix(in srgb,var(--segment-color) 10%,var(--surface-1));color:var(--text-secondary);font-weight:400}.segment:hover,.segment:focus-visible,.segment.selected{filter:brightness(1.15);outline:2px solid var(--segment-color);outline-offset:-2px;z-index:1}
  .axis{position:relative;height:24px;margin-left:calc(var(--profile-label-width) + 10px);font-size:9px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.axis span{position:absolute;top:9px;transform:translateX(-50%);white-space:nowrap}.axis span:before{content:'';position:absolute;top:-9px;left:50%;height:5px;border-left:1px solid var(--border-secondary)}.axis span:first-child{transform:none}.axis span:first-child:before{left:0}.axis span:last-child{transform:translateX(-100%)}.axis span:last-child:before{left:calc(100% - 1px)}
  .section-detail{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;min-height:20px;margin:8px 0 0 calc(var(--profile-label-width) + 10px);font-size:10px;line-height:1.5;color:var(--text-secondary)}.section-detail strong{font-weight:600;color:var(--text-primary)}.section-detail i{width:8px;height:8px;border-radius:2px;flex:none}.profile-empty{display:grid;place-items:center;min-height:132px;font-size:11px;color:var(--text-secondary)}
  .outline :global(figure){border:0;background:transparent;padding:0}.outline :global(svg){height:100px}.without-outline .profile-body{grid-template-columns:minmax(0,1fr)}
  .compact{padding:0}.compact header{padding:16px var(--setup-panel-padding,20px);margin:0;border-bottom:1px solid var(--border-subtle)}.compact h2{font-size:17px}.compact .course-heading{display:grid;gap:4px}.compact .profile-body{grid-template-columns:min(36%,380px) minmax(0,1fr);gap:20px;padding:0 var(--setup-panel-padding,20px)}.compact .distance-profile{padding-block:16px}.compact .outline{order:-1;display:flex;align-items:center;align-self:stretch;min-width:0;padding:16px 20px 16px 0;border-right:1px solid var(--border-subtle)}.compact .outline :global(figure){width:100%;height:100%}.compact .outline :global(svg){height:100%}.compact.without-outline .profile-body{grid-template-columns:minmax(0,1fr)}
  @container course-segment (max-width:78px){.segment:has(.segment-short) .segment-name{display:none}.segment-short{display:block}.segment{font-size:10px}}
  @container course-segment (max-width:46px){.segment-distance{display:none}.segment:has(.segment-distance){padding-bottom:0}}
  @container course-segment (max-width:23px){.segment-name,.segment-short{visibility:hidden}}
  @container course-profile (max-width:900px){.compact .profile-body{grid-template-columns:200px minmax(0,1fr);gap:16px}.compact .outline{padding-right:16px}}
  @container course-profile (max-width:580px){.profile-body,.compact .profile-body{grid-template-columns:minmax(0,1fr)}.compact header{padding:14px}.preview-label{display:none}.compact .profile-body{padding:0 14px;gap:0}.compact .outline{padding:14px 0;border-right:0;border-bottom:1px solid var(--border-subtle)}.compact .outline :global(figure){max-width:360px;height:auto;margin:auto}.compact .outline :global(svg){height:180px}.compact .distance-profile{padding-block:14px}.outline{display:none}}
  @media(max-width:767px){.profile{--profile-label-width:48px}.profile:not(.compact){padding:14px}.profile-row{gap:8px}.axis,.section-detail{margin-left:calc(var(--profile-label-width) + 8px)}.row-label{font-size:9px}}
  @container course-breakdown (max-width:450px){.profile-row[data-band='race-sections'] .segment{font-size:8px}}
  @container course-breakdown (max-width:350px){.profile-row{grid-template-columns:minmax(0,1fr);gap:4px}.row-label{font-size:9px;line-height:1.4}.axis,.section-detail{margin-left:0}.bands{gap:4px}}
</style>
