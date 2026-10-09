<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import { cmGet,loadCmSummary,pct,number,styleNames,type Manifest } from './cm-data';
  import type { Summary,Snapshot } from './hakuraku-types';
  import { portrait } from './analysis-view';

  let snapshot=$state<Snapshot>(),data=$state<Summary>(),error=$state('');
  let controller:AbortController|undefined;
  const sample=$derived([...(data?.pairs??[])].sort((a,b)=>b.pop-a.pop).slice(0,5));
  const cmHref=$derived('/competitive/cm-data'+(snapshot?'?snapshot='+encodeURIComponent(snapshot.snapshotId):''));
  async function loadPreview(){
    controller?.abort();
    const request=new AbortController();controller=request;error='';data=undefined;
    try{
      const manifest=await cmGet<Manifest>('/manifest',request.signal);
      const current=manifest.snapshots[0];
      if(!current)throw new Error('No Champions Meeting dataset is available yet.');
      const summary=await loadCmSummary(current.snapshotId,request.signal);
      if(!request.signal.aborted){snapshot=current;data=summary;}
    }catch(e){if(!request.signal.aborted)error=e instanceof Error?e.message:'The dataset could not be loaded.';}
  }
  onMount(()=>{void loadPreview();return()=>controller?.abort();});
</script>

<svelte:head><title>Competitive · uma.moe</title><meta name="description" content="Race replays, Champions Meeting results, and captured team builds in uma.moe."/></svelte:head>
<AppPage routeId="competitive" title="Competitive" description="Review your races. Explore CM results. Find your next team." width="wide">
  <nav class="tools" aria-label="Competitive tools">
    <a class="tool" href="/competitive/race-analysis">
      <span class="tool-icon"><Icon name="race" size={23}/></span>
      <div><h2>Race Analysis</h2><p>Upload captures to replay races and compare runners, builds, and skill timings.</p><small><Icon name="info" size={11}/> Resimulation sends captures to the simulator</small></div>
      <Icon name="arrow-right" size={18}/>
    </a>
    <a class="tool" href="/competitive/cm-data">
      <span class="tool-icon gold"><Icon name="trophy" size={23}/></span>
      <div><h2>CM Data</h2><p>Compare running styles, Umas, and skills across published Champions Meeting datasets.</p><small>Strategies · Results · Captured builds</small></div>
      <Icon name="arrow-right" size={18}/>
    </a>
    <a class="tool" href="/competitive/cm-data?tab=lobby">
      <span class="tool-icon green"><Icon name="users" size={23}/></span>
      <div><h2>Lobby Builder</h2><p>Choose three captured teams, adjust builds, and arrange a nine-runner room.</p><small>Teams · Build edits · Gate assignments</small></div>
      <Icon name="arrow-right" size={18}/>
    </a>
  </nav>

  <section class="meeting" aria-labelledby="current-meeting-title" aria-busy={!data&&!error}>
    <div class="meeting-summary">
      <span class="eyebrow"><Icon name="trophy" size={15}/> Current Champions Meeting</span>
      <h2 id="current-meeting-title">{snapshot?.cmId.toUpperCase()??'Champions Meeting'}</h2>
      <p class="course">{snapshot?.meta.course??'The latest published dataset'}</p>
      {#if snapshot}<p class="conditions">{snapshot.meta.conditions}</p>{/if}
      {#if data}
        <dl class="dataset-facts">
          <div><dt>Simulated races</dt><dd>{number(data.meta.populationRaces)}</dd></div>
          <div><dt>Evaluated teams</dt><dd>{number(data.meta.evaluatedTeams)}</dd></div>
          <div><dt>Players</dt><dd>{number(data.meta.evaluatedOwners)}</dd></div>
        </dl>
      {/if}
      <div class="meeting-actions"><Button href={cmHref+(snapshot?'&':'?')+'tab=archetypes'} size="sm">Browse captured teams</Button><a href="/competitive/cm-data">All datasets →</a></div>
    </div>
    <div class="field-preview">
      {#if data}
        <div class="field-title"><h3>Most used Umas</h3><a href={cmHref+(snapshot?'&':'?')+'tab=character'}>See all Umas →</a></div>
        <p class="field-key">Runner wins: this Uma finishes first. Team wins: any teammate finishes first.</p>
        <table>
          <caption class="sr-only">Five most used Umas in {snapshot?.cmId.toUpperCase()}, with field share and win rates</caption>
          <thead><tr><th scope="col">Uma / running style</th><th scope="col" class="numeric">Field share</th><th scope="col" class="numeric">Runner wins</th><th scope="col" class="numeric">Team wins</th></tr></thead>
          <tbody>{#each sample as row}<tr>
            <td><div class="runner"><Artwork src={portrait(row.card)} alt="" size="xs"/><div><strong>{row.name}</strong><small>{row.outfit} · {styleNames[row.style]}</small></div></div></td>
            <td class="numeric">{pct(row.pop)}</td><td class="numeric">{pct(row.individual)}</td><td class="numeric team-rate">{pct(row.team)}</td>
          </tr>{/each}</tbody>
        </table>
      {:else if error}
        <div class="preview-state" role="alert"><Icon name="warning" size={24}/><strong>CM preview unavailable</strong><p>{error}</p><Button variant="secondary" size="sm" onclick={()=>void loadPreview()}>Retry</Button></div>
      {:else}<Spinner size={40} centered label="Loading the latest CM results…"/>{/if}
    </div>
  </section>

  <nav class="resources" aria-label="Competitive reference">
    <a href="/research"><Icon name="book" size={21}/><div><h3>Research</h3><p>Race mechanics, experiments, and analysis by Aya.</p></div><Icon name="arrow-right" size={16}/></a>
    <a href="/tools/master-data"><Icon name="database" size={21}/><div><h3>Master Data</h3><p>Search game tables and follow their field references.</p></div><Icon name="arrow-right" size={16}/></a>
  </nav>
</AppPage>

<style>
  .tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .tool{display:flex;align-items:flex-start;gap:12px;padding:18px 16px;border:1px solid var(--border-subtle);border-radius:var(--radius-lg);background:var(--surface-1);color:var(--text-primary);text-decoration:none;min-width:0}
  .tool>div{flex:1;min-width:0}.tool>:global(svg){flex:none;align-self:center;color:var(--text-secondary)}
  .tool-icon{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:var(--radius-md);color:var(--accent-primary);background:color-mix(in srgb,var(--accent-primary) 12%,transparent)}
  .gold{color:var(--accent-warning);background:color-mix(in srgb,var(--accent-warning) 12%,transparent)}
  .green{color:var(--accent-success);background:color-mix(in srgb,var(--accent-success) 12%,transparent)}
  .tool h2{font-size:17px;margin:0 0 7px;letter-spacing:-.02em}.tool p{font-size:12px;line-height:1.6;margin:0;color:var(--text-secondary)}
  .tool small{display:flex;align-items:center;gap:5px;margin-top:10px;font-size:10px;color:var(--text-secondary)}
  .tool:hover,.resources a:hover{border-color:var(--accent-primary);background:var(--surface-2)}
  .meeting{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.45fr);gap:24px;padding:20px;border-radius:var(--radius-lg);background:var(--surface-1);min-width:0}
  .meeting-summary{display:flex;flex-direction:column;align-items:flex-start;min-width:0}.eyebrow{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--accent-warning)}
  .meeting h2{font-size:30px;letter-spacing:-.035em;line-height:1.2;margin:10px 0 7px}.course{font-size:13px;font-weight:550;line-height:1.5;margin:0}.conditions{font-size:11px;line-height:1.5;color:var(--text-secondary);margin:4px 0 0}
  .dataset-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;width:100%;margin:20px 0}
  .dataset-facts dt{font-size:10px;color:var(--text-secondary)}.dataset-facts dd{margin:6px 0 0;font-size:20px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  .meeting-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:auto;padding-top:14px}.meeting-actions>a,.field-title>a{font-size:11px;color:var(--accent-primary);text-decoration:none}.meeting-actions>a:hover,.field-title>a:hover{text-decoration:underline}
  .field-preview{min-width:0;border-left:1px solid var(--border-subtle);padding-left:24px}
  .field-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.field-title h3{font-size:14px;margin:0}
  .field-key{font-size:10px;line-height:1.5;color:var(--text-secondary);margin:6px 0 10px}
  table{width:100%;border-collapse:collapse;text-align:left;font-size:12px;table-layout:fixed}th{font-size:10px;font-weight:500;color:var(--text-secondary);padding:4px 0 7px;white-space:nowrap}th:first-child{width:52%}th:not(:first-child){width:16%}
  td{border-top:1px solid var(--border-subtle);padding:7px 0}.numeric{text-align:right;font-variant-numeric:tabular-nums}.team-rate{color:var(--accent-primary);font-weight:600}
  .runner{display:flex;align-items:center;gap:9px;min-width:0}.runner>div{min-width:0}.runner strong{display:block;font-size:12px;font-weight:600}.runner small{display:block;font-size:10px;margin-top:3px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .preview-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:250px;text-align:center;color:var(--text-secondary);font-size:12px}.preview-state p{max-width:42ch;margin:0;line-height:1.6}.preview-state strong{color:var(--text-primary)}
  .resources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .resources a{display:flex;align-items:center;gap:12px;min-width:0;padding:14px 16px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-secondary);text-decoration:none}
  .resources a>div{flex:1}.resources a>:global(svg){flex:none}.resources h3{font-size:13px;color:var(--text-primary);margin:0 0 4px}.resources p{font-size:11px;line-height:1.5;margin:0}
  @media(max-width:1100px){.tool{gap:9px;padding:14px 12px}.tool-icon{width:32px;height:32px}.meeting{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:18px}.field-preview{padding-left:18px}.dataset-facts{grid-template-columns:1fr;gap:10px}.dataset-facts>div{display:flex;justify-content:space-between;align-items:center;gap:12px}.dataset-facts dd{font-size:17px;margin:0}}
  @media(max-width:850px){.tools{grid-template-columns:1fr}.tool{padding:14px;align-items:center}.tool small{margin-top:6px}.meeting{grid-template-columns:1fr;padding:16px;gap:20px}.field-preview{border-left:0;padding-left:0;border-top:1px solid var(--border-subtle);padding-top:16px}.dataset-facts{grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 0}.dataset-facts>div{display:block}.dataset-facts dd{margin-top:5px}.meeting-actions{padding-top:0}.resources{grid-template-columns:1fr}}
  @media(max-width:479px){.tool h2{font-size:15px}.tool p{font-size:11px}.tool small{font-size:9px}.meeting h2{font-size:26px}th{font-size:9px;white-space:normal}th:first-child{width:49%}th:not(:first-child){width:17%}.runner{gap:6px}.runner strong{font-size:11px}.runner small{font-size:9px}.runner :global(.art){width:24px;height:28px}td{font-size:11px}.dataset-facts{gap:8px}.dataset-facts dd{font-size:16px}.dataset-facts dt{font-size:9px}.resources p{font-size:10px}}
</style>

