<script lang="ts">
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import SimulatorCoursePreview from '../SimulatorCoursePreview.svelte';
  import { trackName, describeCourse, coursesForTrack, SURFACE_NAMES, DISTANCE_NAMES, TURN_NAMES } from '@/lib/catalog/course-catalog';
  import SimulatorCmPresets from '../SimulatorCmPresets.svelte';
  import SimulatorCourseDetails from '../SimulatorCourseDetails.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import { GROUND_OPTIONS, SEASON_OPTIONS, TIME_OPTIONS, WEATHER_OPTIONS, courseOptions, selectTrack,
    selectedCourse, optionLabel, selectedTrackId, simulatorCatalog, simulatorSession, trackOptions } from '../simulator-session.svelte';
  let { note, workspace = false, sidebar = false, inlineConditions = false }: { note?: string; workspace?: boolean; sidebar?: boolean; inlineConditions?: boolean } = $props();
  let trackSelection = $state(''), presetsOpen = $state(false), detailsOpen = $state(false), conditionsOpen = $state(false);
  const tracks = $derived(trackOptions()), courses = $derived(courseOptions());
  const course = $derived(selectedCourse());
  let trackAnchor = $state<HTMLDivElement>(), courseAnchor = $state<HTMLDivElement>();
  const trackPreviews = $derived(new Map(tracks.map(track => {
    const available = coursesForTrack(simulatorCatalog.courses, Number(track.value));
    return [track.value, { course: available.filter(course => course.surface === 1 && course.turn !== 4).at(-1) ?? available.at(-1), count: available.length }];
  })));
  $effect(() => { trackSelection = selectedTrackId() === undefined ? '' : String(selectedTrackId()); });
</script>

{#snippet conditions()}
  <div class="conditions">
    <div class="ground"><SelectField id="sim-ground" label="Ground" options={GROUND_OPTIONS} bind:value={simulatorSession.ground}/></div>
    <div><span class="label">Weather</span><SegmentedControl label="Weather" options={WEATHER_OPTIONS} bind:value={simulatorSession.weather}/></div>
    <div><span class="label">Season</span><SegmentedControl label="Season" options={SEASON_OPTIONS} bind:value={simulatorSession.season}/></div>
    {#if sidebar || inlineConditions}<div><SelectField id="sim-time" label="Time of day" options={[{value:'1',label:'Morning'},...TIME_OPTIONS]} bind:value={simulatorSession.startTime}/></div>{:else}<div><span class="label">Time</span><SegmentedControl label="Time" options={TIME_OPTIONS} bind:value={simulatorSession.startTime}/></div>{/if}
    {#if note}<span class="note">{note}</span>{/if}
  </div>
{/snippet}
<section class="race-bar" class:course-card={workspace} class:sidebar class:inline-conditions={inlineConditions} aria-label="Race conditions">
  {#if workspace}<header><h2><Icon name="race" size={19}/>Course</h2><Button variant="secondary" size="sm" icon="calendar" onclick={() => presetsOpen=true}>CM presets</Button></header>{/if}
  {#if simulatorCatalog.loading}<Spinner label="Loading courses…"/>
  {:else}
    {#if workspace && !inlineConditions}<div class="course-visual"><SimulatorCoursePreview {course}/><div class="course-name"><strong>{course ? trackName(course.race_track_id) : 'Select a course'}</strong><span>{course ? describeCourse(course) : 'Courses load from game resources'}</span></div></div>{/if}
    <div class="controls"><div class="course-row">
      {#if !workspace && !sidebar}<Button variant="secondary" size="sm" icon="calendar" onclick={() => presetsOpen=true}>CM presets</Button>{/if}
      <div class="course-picker" bind:this={trackAnchor}>
        <Combobox id="sim-track" label="Track" options={tracks} placeholder="Search tracks…" disabled={!tracks.length} popupAnchor={trackAnchor} bind:value={trackSelection} onchange={selectTrack}>
          {#snippet optionContent(option)}
            {@const preview = trackPreviews.get(option.value)}
            <div class="track-option">
              <SimulatorCoursePreview course={preview?.course} compact/>
              <strong>{option.label}</strong><small>{preview?.count} {preview?.count === 1 ? 'course' : 'courses'}</small>
            </div>
          {/snippet}
        </Combobox>
        <span class="selected-outline" aria-hidden="true"><SimulatorCoursePreview course={trackPreviews.get(trackSelection)?.course} compact/></span><span class="picker-arrow" aria-hidden="true"><Icon name="chevron" size={14}/></span>
      </div>
      <div class="course-picker" bind:this={courseAnchor}>
        <Combobox id="sim-course" label="Course" options={courses} placeholder="Search distances or surfaces…" emptyText="No courses on this track" popupAnchor={courseAnchor} bind:value={simulatorSession.courseId}>
          {#snippet optionContent(option)}
            {@const item = simulatorCatalog.courses.get(Number(option.value))}
            <div class="course-option">
              <SimulatorCoursePreview course={item} compact/>
              <span class="course-copy">
                <strong>{item ? (SURFACE_NAMES[item.surface] ?? 'Unknown')+' '+item.distance.toLocaleString('en-US')+' m' : option.label}</strong>
                <span class="course-meta">
                  {#if item}
                    <span>{DISTANCE_NAMES[item.distance_type]}</span><span>{TURN_NAMES[item.turn]}</span>
                    {#if option.label.includes('layout')}<span>Layout {item.course}</span>{/if}
                  {/if}
                </span>
              </span>
            </div>
          {/snippet}
        </Combobox>
        <span class="selected-outline" aria-hidden="true"><SimulatorCoursePreview {course} compact/></span><span class="picker-arrow" aria-hidden="true"><Icon name="chevron" size={14}/></span>
      </div>
      {#if !workspace && !sidebar}<Button variant="ghost" size="sm" icon="chart" disabled={!simulatorSession.courseId} onclick={()=>detailsOpen=true}>Course breakdown</Button>{/if}
    </div>
    {#if sidebar || inlineConditions}{@render conditions()}
    {:else if workspace}<div class="toolbar-actions">
      <button class="conditions-summary" onclick={()=>conditionsOpen=true} aria-label="Edit race conditions">
        <span>{optionLabel(GROUND_OPTIONS,simulatorSession.ground)}<span class="condition-label">ground</span></span>
        {#each [[WEATHER_OPTIONS,simulatorSession.weather],[SEASON_OPTIONS,simulatorSession.season],[TIME_OPTIONS,simulatorSession.startTime]] as [options,value]}
          {@const selected=(options as typeof WEATHER_OPTIONS).find(option=>option.value===value)}
          <span title={selected?.label ?? (value==='1'?'Morning':'Unspecified')}>{#if selected}<img src={selected.image} alt={sidebar ? selected.label : ''}/><span class="condition-label">{selected.label}</span>{:else}{value==='1'?'Morning':'Unspecified'}{/if}</span>
        {/each}<Icon name="tune" size={14}/>
      </button>
      <Button variant="ghost" size="sm" icon="chart" ariaLabel="Course breakdown" disabled={!simulatorSession.courseId} onclick={()=>detailsOpen=true}>Course breakdown</Button>
    </div>{:else}{@render conditions()}{/if}
    </div>
  {/if}
</section>

{#if !sidebar}<SimulatorCmPresets bind:open={presetsOpen}/><SimulatorCourseDetails bind:open={detailsOpen}/>{/if}
{#if !sidebar}<Dialog bind:open={conditionsOpen} title="Race conditions" maxWidth="540px">{@render conditions()}{#snippet actions()}<Button onclick={()=>conditionsOpen=false}>Done</Button>{/snippet}</Dialog>{/if}
<style>
  .course-picker{position:relative;min-width:0;--combobox-max-height:320px}.course-picker :global(input){padding-left:62px;padding-right:28px;font-size:12px}.course-picker :global(.combo-panel button){min-height:44px;padding:6px 10px}.selected-outline{position:absolute;left:10px;bottom:6px;pointer-events:none}.picker-arrow{position:absolute;right:10px;bottom:12px;display:flex;pointer-events:none;color:var(--text-secondary)}
  .track-option,.course-option{width:100%;display:flex;align-items:center;gap:10px;min-width:0}.track-option strong,.course-copy strong{font-size:12px;font-weight:600}.track-option small{margin-left:auto;flex:none;font-size:10px;color:var(--text-secondary)}.course-copy{display:grid;gap:3px;text-align:left}.course-meta{display:flex;gap:12px;color:var(--text-secondary);font-size:10px}
  .race-bar{min-width:0;padding:12px 16px;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-md)}
  .controls{display:grid;gap:10px;min-width:0}.course-row{display:grid;grid-template-columns:auto minmax(140px,.5fr) minmax(0,1fr) auto;gap:12px;align-items:end}
  .conditions{display:flex;align-items:end;flex-wrap:wrap;gap:8px 20px}.conditions>div{display:flex;align-items:center;gap:8px}.ground{width:120px}.label{font-size:11px;color:var(--text-secondary)}.note{font-size:11px;color:var(--text-secondary);margin-left:auto;padding-bottom:8px}
  .race-bar :global(.field){gap:4px}.race-bar :global(.field label){font-size:11px}.race-bar :global(.segments button){min-width:30px;min-height:30px}.race-bar :global(.segments img){width:24px;height:24px}
  @media(max-width:767px){.race-bar{padding:10px 12px}.course-row{grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);gap:8px}.course-row>:global(.ui-button:first-child){grid-row:2}.course-row>:global(.ui-button:last-child){grid-row:2;justify-self:end}.conditions{gap:8px 12px}.conditions>div{gap:5px}.ground{width:105px}.note{margin-left:0}}
  .course-card{padding:16px;border-radius:var(--radius-lg);align-self:start}.course-card header{display:flex;align-items:center;justify-content:space-between;gap:12px}.course-card h2{display:flex;align-items:center;gap:8px;font-size:16px;margin:0}.course-card h2 :global(svg){color:var(--accent-primary)}.course-visual{display:grid;grid-template-columns:105px minmax(0,1fr);gap:12px;align-items:center;margin:12px 0 16px}.course-visual :global(figure){border:0;border-radius:var(--radius-md);padding:12px 8px;background:color-mix(in srgb,var(--accent-secondary) 6%,var(--surface-2))}.course-visual :global(svg){height:82px}.course-visual :global(figcaption){display:none}.course-name{display:grid;gap:4px;margin-top:0}.course-name strong{font-size:17px;letter-spacing:-.02em}.course-name span{font-size:11px;color:var(--text-secondary)}.course-card .course-row{grid-template-columns:minmax(0,1fr)}.course-card :global(.select-control){font-size:12px}.course-card :global(.field label){color:var(--text-secondary)}.conditions-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;padding:10px 0;margin:2px 0 0;border:0;border-top:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);text-align:left;cursor:pointer;font:inherit;font-size:10px}.conditions-summary span{display:flex;align-items:center;gap:4px;white-space:nowrap}.conditions-summary img{width:18px;height:18px}.conditions-summary :global(svg){margin-left:auto;flex:none}.conditions-summary:hover{color:var(--text-primary)}.conditions-summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}.course-card .controls>:global(.ui-button){justify-self:start;padding-left:0;min-height:28px}
  .toolbar-actions{display:grid;gap:6px}.toolbar-actions>:global(.ui-button){justify-self:start;min-height:28px;padding-left:0}.sidebar{padding:12px;border:0;border-bottom:1px solid var(--border-subtle);border-radius:0;background:transparent;flex:none}.sidebar .controls{gap:12px}.sidebar .course-row{grid-template-columns:minmax(0,1fr);gap:10px}.sidebar .conditions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sidebar .conditions>div{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0;width:auto}.sidebar .label{font-size:11px;font-weight:600;color:var(--color-text)}.sidebar .conditions :global(.segments){width:100%;box-sizing:border-box;padding:3px;gap:4px}.sidebar .conditions :global(.segments button){flex:1;min-width:28px;min-height:28px}.sidebar .conditions :global(.segments img){width:22px;height:22px}.sidebar :global(.select-control),.sidebar :global(.combo-input){font-size:12px;min-height:36px}
  @media(max-width:1050px) and (min-width:768px){.course-visual{grid-template-columns:85px minmax(0,1fr);gap:8px}.course-visual :global(svg){height:78px}.course-card{padding:12px}.course-card header{gap:6px}.course-card header :global(.ui-button){font-size:10px;padding-inline:6px}}
  @media(max-width:767px){.course-card{padding:12px}.course-visual{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;align-items:center;margin:10px 0 12px}.course-visual :global(svg){height:72px}.course-visual :global(figure){padding:6px}.course-visual :global(figcaption){display:none}.course-name{margin-top:0}.course-name strong{font-size:16px}.course-card .course-row{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)}.conditions-summary{gap:6px 10px;padding:8px 0}.course-card .controls>:global(.ui-button){justify-self:start}}
  @media(max-width:767px){.sidebar .course-row{grid-template-columns:minmax(0,1fr)}.sidebar .course-row>:global(.ui-button){grid-row:auto}}
  .inline-conditions{container:course-conditions / inline-size}.inline-conditions .conditions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.inline-conditions .conditions>div{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0;width:auto}.inline-conditions .label{font-weight:600;color:var(--color-text)}.inline-conditions .conditions :global(.segments){width:100%;padding:3px;gap:2px}.inline-conditions .conditions :global(.segments button){flex:1;min-width:24px}.inline-conditions .conditions :global(.segments img){width:22px;height:22px}.inline-conditions .course-visual{grid-template-columns:64px minmax(0,1fr);margin:12px 0}.inline-conditions .course-visual :global(svg){height:44px}.inline-conditions .course-visual :global(figure){padding:6px}.inline-conditions .controls{gap:10px;margin-top:12px}
  @media(max-width:500px){.inline-conditions .course-row{grid-template-columns:minmax(0,1fr)}}
  @container course-conditions (min-width:500px){.inline-conditions .course-row{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)}.inline-conditions .conditions{grid-template-columns:repeat(4,minmax(0,1fr))}}
  .inline-conditions.course-card{padding:16px var(--setup-panel-padding,16px);--control-height:var(--setup-control-height,36px)}.inline-conditions.course-card header :global(.ui-button){min-height:var(--setup-control-height,36px);height:var(--setup-control-height,36px);padding-inline:12px;font-size:12px;border-radius:var(--radius-sm)}.inline-conditions.course-card h2{font-size:17px}.inline-conditions.course-card .conditions{gap:12px}.inline-conditions.course-card .controls{gap:12px;margin-top:16px}.inline-conditions.course-card :global(.segments){min-height:var(--setup-control-height,36px)}
  @media(max-width:767px){.inline-conditions.course-card{padding-block:14px}}
</style>
