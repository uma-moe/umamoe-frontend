<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import FileDrop from '@/components/FileDrop.svelte';
  import Button from '@/components/Button.svelte';
  import Banner from '@/components/Banner.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Icon from '@/components/Icon.svelte';
  import { readRaceCaptureFile, type ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
  import { loadCharacterCatalog } from '@/lib/catalog/character-catalog';
  import { loadSkillCatalog } from '@/lib/catalog/skill-catalog';
  import { runnerName } from './race-character-display';
  import { demoSkills, makeDemoRaces } from '@/pages/competitive/demo-races';
  import RaceStatistics from '@/pages/competitive/RaceStatistics.svelte';
  import RaceReplay from './RaceReplay.svelte';
  import { loadReplayCourses,resolveReplayCourses,type CourseData } from './replay-course';
  let courses=$state<CourseData>();
  onMount(()=>{void loadReplayCourses().then(value=>courses=value).catch(()=>{});});
  let captures = $state.raw<ParsedRaceCapture[]>([]), errors = $state<string[]>([]), loading = $state(false), demo = $state(false);
  let selected = $state('0'), group = $state('all'), tab = $state('summary'), uploadsOpen=$state(true);
  let skillNames = $state.raw(new Map<number,string>());
  onMount(()=>{ void loadSkillCatalog().then(catalog=>skillNames=new Map([...catalog].map(([id,skill])=>[id,skill.name]))).catch(()=>{}); });
  const resolvedCaptures:ParsedRaceCapture[]=$derived(captures.map(capture=>({...capture,raceDistance:courses?.courses[capture.courseId??'']?.distance??capture.raceDistance})));
  const groups = $derived(groupMultiRaceCaptures(resolvedCaptures));
  const filtered = $derived(group === 'all' ? resolvedCaptures : groups.find(item=>item.key===group)?.captures ?? []);
  const active = $derived(resolvedCaptures[Number(selected)]);
  function examples(count:number) { uploadsOpen=false; captures=makeDemoRaces(count); demo=true; selected='0'; group='all'; tab='summary'; errors=[]; }
  async function receive(files:FileList) {
    loading=true; errors=[];
    const loaded:ParsedRaceCapture[]=[];
    // Sequential decoding keeps memory bounded when importing a whole session.
    for(const file of Array.from(files)) {
      try { if(file.size>50*1024*1024) throw new Error('File exceeds the 50 MB limit.'); loaded.push(await readRaceCaptureFile(file)); }
      catch(error) { errors.push(`${file.name}: ${error instanceof Error?error.message:'Unable to read capture.'}`); }
    }
    if(loaded.length) {
      await resolveReplayCourses(loaded);
      try { const characters=await loadCharacterCatalog(); for(const capture of loaded) for(const runner of capture.runners) runner.name=runnerName(runner,characters); } catch { /* IDs remain usable offline. */ }
      uploadsOpen=false; captures=demo?loaded:[...captures,...loaded]; demo=false; group='all'; selected='0'; tab='summary';
    }
    loading=false;
  }
  function remove() { captures=captures.filter((_,index)=>index!==Number(selected)); selected='0'; group='all'; if(!captures.length){uploadsOpen=true;demo=false;} }
</script>
<svelte:head><title>Race Analysis · uma.moe</title><meta name="description" content="Upload one or multiple race captures for local replay and race analysis."/></svelte:head>
<AppPage routeId="race-analysis" title="Race Analysis" description={captures.length?undefined:"Replay a race. Understand the field. Upload multiple captures to explore a whole session."} eyebrow={captures.length?undefined:"Competitive"} width="wide">
  <div class="race-files" class:loaded={captures.length>0}>
  <details class="upload-section" bind:open={uploadsOpen}><summary>{captures.length?(demo?'Synthetic demo · ':'')+captures.length+(captures.length===1?' race loaded':' races loaded')+' · Add race files':'Upload race captures'}<span>JSON / GZIP · Local processing</span></summary><FileDrop id="race-upload" label="Drop one or multiple race files" description="HorseACT or game API captures · .json and .json.gz · Processed locally in your browser" actionLabel={loading?'Reading captures…':'Choose race files'} accept=".json,.gz" multiple disabled={loading} onfiles={receive}/>
  <div class="actions"><Button variant="secondary" disabled={loading} onclick={()=>examples(1)}>Try one demo race</Button><Button variant="secondary" disabled={loading} onclick={()=>examples(24)}>Try 24 demo races</Button>{#if captures.length}<Button variant="ghost" disabled={loading} onclick={()=>{captures=[];errors=[];demo=false;uploadsOpen=true;}}>Clear races</Button>{/if}<a href="https://github.com/ayaliz/horseACT#installation" target="_blank" rel="noreferrer">How to capture races ↗</a></div>
  </details></div>
  {#if errors.length}<Banner title="Some files could not be imported" tone="danger" reportable={false}><ul>{#each errors as error}<li>{error}</li>{/each}</ul></Banner>{/if}
  {#if captures.length>1}
    <Tabs items={[{id:'summary',label:`Combined analysis (${captures.length} races)`},{id:'replay',label:'Individual replay'}]} bind:value={tab} label="Analysis mode" controls="race-analysis-content" variant="underline"/>
  {/if}
  <div id="race-analysis-content" class="content">
    {#if captures.length>1&&tab==='summary'}
      {#if groups.length>1}<SelectField id="race-group" label="Course and conditions" options={[{value:'all',label:`All conditions (${captures.length} races)`},...groups.map(item=>({value:item.key,label:`Course ${item.captures[0]?.courseId ?? 'unknown'} · ${item.captures[0]?.raceDistance ?? '?'}m · ${item.captures[0]?.track.condition ?? '?'} · ${item.captures[0]?.track.weather ?? '?'} · ${item.captures.length} races`}))]} bind:value={group}/>{/if}
      <RaceStatistics captures={filtered} skillNames={demo?demoSkills:skillNames} onreplay={index=>{selected=String(resolvedCaptures.indexOf(filtered[index]!));tab='replay';}}/>
    {:else if active}
      <div class="race-select">{#if captures.length>1}<SelectField id="selected-race" label="Race" options={captures.map((capture,index)=>({value:String(index),label:capture.fileName}))} bind:value={selected}/>{:else}<span class="file-name">{active.fileName}</span>{/if}<Button variant="ghost" icon="trash" onclick={remove}>Remove race</Button></div>
      <RaceReplay capture={active} skillNames={demo?demoSkills:skillNames}/>
    {:else}<div class="analysis-start"><div><Icon name="race" size={24}/><h2>Follow every moment</h2><p>Watch lane positions, inspect skill activations, and follow a runner’s speed and HP through the race.</p><Button variant="ghost" onclick={()=>examples(1)}>Explore a replay →</Button></div><div><Icon name="chart" size={24}/><h2>Understand the whole session</h2><p>Upload multiple races for familiar strategy, Uma, skill, and team analysis. Drill into any build and return to its race.</p><Button variant="ghost" onclick={()=>examples(24)}>Explore race analytics →</Button></div></div>{/if}
  </div>
</AppPage>
<style>
  .race-files{background:var(--surface-1);padding:20px;border-radius:var(--radius-lg);display:grid;gap:14px}.race-files.loaded{padding:12px 16px;gap:10px}.race-files.loaded .actions :global(button){min-height:28px;font-size:10px;padding:4px 8px}.analysis-start{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:30px 12px}.analysis-start>div{max-width:440px}.analysis-start :global(svg){color:var(--accent-primary);margin-bottom:8px}.analysis-start h2{font-size:20px;letter-spacing:-.025em}.analysis-start p{font-size:13px;line-height:1.8;color:var(--text-secondary)}
  .upload-section{padding:0}.upload-section summary{cursor:pointer;font-size:12px;font-weight:600;padding:4px}.upload-section summary>span{float:right;font-size:10px;font-weight:400;color:var(--text-secondary)}.upload-section[open] summary{margin-bottom:12px}.file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:11px}.actions{margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.actions a{font-size:12px;color:var(--accent-primary);margin-left:auto}.content{display:grid;gap:var(--space-4);min-width:0}.race-select{display:flex;gap:12px;align-items:end}.race-select :global(.field){flex:1;min-width:0}ul{padding-left:18px;margin:6px 0}li{overflow-wrap:anywhere}@media(max-width:767px){.race-files,.content,.actions{margin-inline:12px}.race-files .actions{margin-inline:0}.analysis-start{grid-template-columns:1fr;gap:20px;padding:16px 0}.race-files{padding:14px}.race-files.loaded{padding:12px}.actions a{font-size:10px}}@media(max-width:600px){.upload-section summary>span{display:none}}
</style>
