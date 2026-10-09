<script lang="ts">
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import DataTable from '@/components/DataTable.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import SimulatorCourseProfile from './SimulatorCourseProfile.svelte';
  import { loadReplayCourses, courseSegments, type Course } from '@/pages/race-analysis/replay-course';
  import { selectedCourse } from './simulator-session.svelte';
  import { describeCourse, trackName } from '@/lib/catalog/course-catalog';
  let { open = $bindable(false) }: {open?:boolean} = $props();
  let course = $state.raw<Course>(), error = $state(''), loading = $state(false);
  const selected = $derived(selectedCourse());
  $effect(() => {
    if (!open || !selected) return;
    const id = selected.course_id; let active = true; loading = true; error = '';
    void loadReplayCourses().then(data => {if(active)course=data.courses[id];}).catch(reason => {if(active)error=(reason as Error).message;}).finally(()=>{if(active)loading=false;});
    return () => {active=false;};
  });
  const segments = $derived(courseSegments(course));
  const rows = $derived(course ? [
    ...segments.map((segment,index) => ({id:'s'+index,section:segment.label,start:segment.start,end:segment.end,slope:'—'})),
    ...course.slopes.filter(slope=>slope.slope).map((slope,index) => ({id:'h'+index,section:slope.slope>0?'Uphill':'Downhill',start:slope.start,end:slope.start+slope.length,slope:slope.slope/10000+'%'}))
  ].sort((a,b)=>a.start-b.start) : []);
</script>
<Dialog bind:open title="Course breakdown" maxWidth="1000px" maxHeight="90dvh">
  {#if selected}<h3>{trackName(selected.race_track_id)}, {describeCourse(selected)}</h3>{/if}
  {#if loading}<Spinner centered label="Loading course profile…"/>{:else if error}<p role="alert">{error}</p>
  {:else if course}
    <SimulatorCourseProfile course={selected}/>
    <DataTable caption="Course sections and slopes" plain compact {rows} columns={[
      {key:'section',label:'Section'},{key:'start',label:'Start (m)',numeric:true},{key:'end',label:'End (m)',numeric:true},{key:'slope',label:'Slope',numeric:true}
    ]}/>
  {:else}<p>Course details are unavailable.</p>{/if}
  {#snippet actions()}<Button variant="secondary" onclick={()=>open=false}>Close</Button>{/snippet}
</Dialog>
<style>h3{font-size:16px;margin:0 0 12px}p{font-size:11px;color:var(--text-secondary);line-height:1.6}</style>
