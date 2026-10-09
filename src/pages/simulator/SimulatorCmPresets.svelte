<script lang="ts">
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import TextField from '@/components/TextField.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import { timelineRepository, type TimelineRecord } from '@/pages/timeline/timeline-repository';
  import { describeCourse } from '@/lib/catalog/course-catalog';
  import { simulatorCatalog, simulatorSession } from './simulator-session.svelte';
  import { cmPreset } from './cm-presets';
  let { open = $bindable(false) }: { open?: boolean } = $props();
  let events = $state.raw<TimelineRecord[]>([]), error = $state(''), loading = $state(false), query = $state(''), selected = $state<TimelineRecord>(), courseId = $state('');
  $effect(() => {
    if (!open) return;
    let active = true; loading = true; error = ''; selected = undefined;
    void timelineRepository.load().then(data => { if (active) events = data.events.filter(event => event.eventType === 'champions_meeting').sort((a,b)=>{const now=Date.now(),aFuture=a.date.getTime()>=now,bFuture=b.date.getTime()>=now;return Number(bFuture)-Number(aFuture)||(aFuture?a.date.getTime()-b.date.getTime():b.date.getTime()-a.date.getTime());}); })
      .catch(reason => { if (active) error = (reason as Error).message; }).finally(() => { if (active) loading = false; });
    return () => { active = false; };
  });
  const presets = $derived(events.map(event => ({event,preset:cmPreset(event,[...simulatorCatalog.courses.values()])})));
  const matches = $derived(presets.filter(({event,preset}) => [event.title,event.dateLabel,...preset.facts.map(fact => fact.primary)].join(' ').toLowerCase().includes(query.toLowerCase())));
  const chosen = $derived(presets.find(item => item.event.id === selected?.id));
  function choose(event:TimelineRecord) {
    selected = event; const preset = presets.find(item => item.event.id === event.id)!.preset;
    courseId = preset.candidates.length === 1 ? String(preset.candidates[0]!.course_id) : '';
  }
  function apply() {
    if (!chosen) return;
    simulatorSession.courseId = courseId;
    simulatorSession.sourceCourseId = ''; simulatorSession.raceInstanceId = 0;
    if (chosen.preset.season) simulatorSession.season = chosen.preset.season;
    if (chosen.preset.weather) simulatorSession.weather = chosen.preset.weather;
    if (chosen.preset.ground) simulatorSession.ground = chosen.preset.ground;
    simulatorSession.importNotice = (selected?.predicted ? 'Estimated CM dates. ' : '') + (!courseId ? 'Select the CM course before running. ' : '') + (!chosen.preset.ground ? 'Review the ground condition before running.' : '');
    open = false;
  }
</script>
<Dialog bind:open title="Champions Meeting presets" maxWidth="820px" maxHeight="90dvh">
  <TextField id="cm-preset-search" label="Find a meeting" hideLabel placeholder="Search meeting, track or date…" bind:value={query}/>
  {#if loading}<Spinner centered label="Loading meeting schedule…"/>{:else if error}<p role="alert">{error}</p>
  {:else}<div class="presets">{#each matches as {event,preset}}
    <button class:selected={selected?.id === event.id} onclick={() => choose(event)}>
      <div><strong>{event.title}</strong><span>{event.dateLabel}{event.predicted ? ' (estimated)' : ''}</span></div>
      <p>{preset.facts.map(fact => [fact.primary,fact.secondary].filter(Boolean).join(', ')).join('; ') || 'Course details have not been announced.'}</p>
    </button>
  {/each}</div>{/if}
  {#if chosen}
    {#if chosen.preset.candidates.length > 1}<SelectField id="cm-preset-course" label="Course layout" bind:value={courseId} options={chosen.preset.candidates.map(course => ({value:String(course.course_id),label:describeCourse(course)}))}/>{/if}
    {#if !chosen.preset.candidates.length}<p class="hint">An exact course could not be resolved from the published description. The preset loads its available conditions; choose the course manually.</p>{/if}
  {/if}
  {#snippet actions()}<Button variant="secondary" onclick={() => open = false}>Cancel</Button><Button disabled={!chosen || chosen.preset.candidates.length > 1 && !courseId} onclick={apply}>Use meeting</Button>{/snippet}
</Dialog>
<style>
  .presets{display:grid;gap:6px;margin-top:14px}.presets button{padding:12px 14px;text-align:left;font:inherit;color:var(--text-primary);background:var(--surface-1);border:1px solid var(--border-subtle);border-left:3px solid transparent;border-radius:var(--radius-md);cursor:pointer}.presets button:hover{background:var(--surface-3)}.presets button.selected{background:var(--color-accent-soft);border-color:color-mix(in srgb,var(--accent-primary) 30%,var(--border-subtle));border-left-color:var(--accent-primary)}.presets button:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.presets button>div{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;font-size:13px}.presets span,.hint{font-size:11px;color:var(--text-secondary)}.presets p{font-size:11px;line-height:1.6;margin:6px 0 0;color:var(--text-secondary)}
</style>
