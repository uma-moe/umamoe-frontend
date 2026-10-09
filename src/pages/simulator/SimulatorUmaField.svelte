<script lang="ts">
  import {onMount,type Snippet} from 'svelte';
  import Button from '@/components/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import SimulatorTeamPicker from './SimulatorTeamPicker.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import SkillChip from '@/components/SkillChip.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import {loadCharacterCatalog,type CharacterCatalogEntry} from '@/lib/catalog/character-catalog';
  import {loadSkillCatalog,resolveEncodedSkill,skillPointTotal,skillImage,skillRarity,type SkillCatalogEntry} from '@/lib/catalog/skill-catalog';
  import RunnerLineupRow from '@/pages/competitive/RunnerLineupRow.svelte';
  import {styleColors,stats} from '@/pages/competitive/analysis-view';
  import SimulatorUmaEditor from './SimulatorUmaEditor.svelte';
  import SimulatorVeteranPicker from './SimulatorVeteranPicker.svelte';
  import {simulatorUmaSummary,type SimulatorUma} from './simulator-uma';
  import {simulatorRoster,createRosterUma,ensureSimulatorRoster,importSimulatorUmas,simulatorTeamLabel} from './simulator-roster.svelte';
  import {selectedCourse} from './simulator-session.svelte';
  let {actions}:{actions?:Snippet}=$props();
  let editing=$state<SimulatorUma>(),editorOpen=$state(false),veteransOpen=$state(false),error=$state('');
  const course=$derived(selectedCourse());
  let skills=$state.raw(new Map<number,SkillCatalogEntry>());
  let characters=$state.raw(new Map<number,CharacterCatalogEntry>());
  let visibleSkills=$state<Record<string,number>>({});
  function rankSkills(ids:number[]){return ids.map(encoded=>{const {skill,inherited}=resolveEncodedSkill(skills,encoded);return {encoded,unique:skillRarity(skill,inherited)==='unique-main',cost:skillPointTotal(skills,[encoded])??-1};}).sort((a,b)=>Number(b.unique)-Number(a.unique)||b.cost-a.cost||a.encoded-b.encoded);}
  function fitSkills(node:HTMLElement,params:{id:string;skills:{encoded:number;cost:number}[]}){
    let id=params.id;
    const measure=()=>{
      const bounds=node.getBoundingClientRect();let count=0;
      for(const child of node.children){const box=child.getBoundingClientRect(),shown=box.bottom<=bounds.bottom+.5&&box.right<=bounds.right+.5;child.setAttribute('aria-hidden',String(!shown));if(shown&&child.classList.contains('skill-item'))count++;}
      if(visibleSkills[id]!==count)visibleSkills[id]=count;
    };
    const observer=new ResizeObserver(measure);
    const observe=()=>{observer.disconnect();observer.observe(node);for(const child of node.children)observer.observe(child);};
    observe();
    return {update(next:typeof params){id=next.id;observe();},destroy(){observer.disconnect();}};
  }
  onMount(()=>{let active=true;void loadSkillCatalog().then(value=>{if(active)skills=value;}).catch(()=>{});void loadCharacterCatalog().then(value=>{if(active)characters=value;}).catch(()=>{});return()=>{active=false;};});
  async function edit(uma:SimulatorUma){await ensureSimulatorRoster().catch(()=>{});editing=uma;editorOpen=true;}
  async function add(){await ensureSimulatorRoster().catch(()=>{});editing=createRosterUma('Uma '+(simulatorRoster.umas.length+1));editorOpen=true;}
  function remove(uma:SimulatorUma){if(simulatorRoster.umas.length<=2)return;simulatorRoster.umas=simulatorRoster.umas.filter(item=>item.id!==uma.id);simulatorRoster.configured=true;}
  function duplicate(uma:SimulatorUma){if(simulatorRoster.umas.length>=18)return;const copy=structuredClone($state.snapshot(uma));copy.id=crypto.randomUUID();copy.name+=' copy';copy.frameOrder=undefined;simulatorRoster.umas.push(copy);simulatorRoster.configured=true;}
  function addVeteran(uma:SimulatorUma){try{importSimulatorUmas([uma]);error='';}catch(reason){error=(reason as Error).message;}}
</script>
<section class="field" aria-label="Race field">
  <header>
    <div class="field-heading"><h2>Race field <span>{simulatorRoster.umas.length}/18</span></h2></div>
    <div class="field-actions"><Button variant="secondary" size="sm" icon="add" ariaLabel="Add Uma" disabled={simulatorRoster.umas.length>=18} onclick={add}>Add Uma</Button><Button variant="secondary" size="sm" icon="veterans" disabled={simulatorRoster.umas.length>=18} onclick={()=>veteransOpen=true}>Choose from Veterans</Button>{@render actions?.()}</div>
  </header>
  <div class="column-headings" aria-hidden="true"><span>Runner <small>select to edit</small></span><span>Build stats</span><span>Learned skills</span><span class="action-headings"><span>Team</span><span>Actions</span></span></div>
  <div class="runners">
    {#each simulatorRoster.umas as uma,index (uma.id)}
      {@const summary=simulatorUmaSummary(uma,index,course)}
      {@const encodedSkills=uma.skills.map(skill=>skill.skillId*10+(skill.level??1))}
      {@const preview=rankSkills(encodedSkills)}
      {@const sp=skillPointTotal(skills,encodedSkills)}
      {@const outfit=characters.get(uma.cardId??0)?.subtitle}
      <article class="runner" data-uma-id={uma.id} title={simulatorTeamLabel(uma.teamId)}>
        <button class="summary" aria-label={'Edit '+uma.name} title={outfit} onclick={()=>edit(uma)}><RunnerLineupRow runner={summary} {outfit} color={styleColors[Number(summary.raw.runningStyle)]} showStats={false}/></button>
        <div class="build-stats"><StatStrip items={[...stats(summary),{id:'sp',label:'SP',value:sp?.toLocaleString()??'—'}]} presentation="values" compact label={uma.name+' build stats'}/></div>
        <div class="skill-summary">
          <div class="skill-preview preview-skills" use:fitSkills={{id:uma.id,skills:preview}}>
            {#each preview as item (item.encoded)}
              {@const resolved=resolveEncodedSkill(skills,item.encoded)}
              <span class="skill-item" data-sp={item.cost} data-owned-unique={item.unique}><SkillChip name={resolved.skill?.name??'Skill '+Math.floor(item.encoded/10)} icon={skillImage(resolved.skill?.icon)} rarity={skillRarity(resolved.skill,resolved.inherited)} level={item.unique?'Lv '+resolved.level:undefined} compact/></span>
            {:else}<span class="no-skills">No skills added</span>{/each}
          </div>
          <InspectPopover label={'Skills for '+uma.name} align="end">
            {#snippet trigger()}
              <span class="more-skills">{uma.skills.length>(visibleSkills[uma.id]??0)?'+'+(uma.skills.length-(visibleSkills[uma.id]??0))+' more':'Skills'}<Icon name="chevron" size={12}/></span>
            {/snippet}
            <div class="skill-list-heading"><div><strong>Learned skills <span>{uma.skills.length}</span></strong><small>{uma.name}</small></div><span title="Edit build and skills"><Button variant="secondary" size="sm" icon="edit" ariaLabel={'Edit skills for '+uma.name} onclick={()=>edit(uma)}/></span></div>
            {#if preview.length}<ul class="all-skills">{#each preview as item}
              {@const resolved=resolveEncodedSkill(skills,item.encoded)}
              <li class:owned-unique={item.unique}><SkillChip name={resolved.skill?.name??'Skill '+Math.floor(item.encoded/10)} icon={skillImage(resolved.skill?.icon)} rarity={skillRarity(resolved.skill,resolved.inherited)} level={item.unique||resolved.level>1?'Lv '+resolved.level:undefined} compact/><span class="skill-cost">{item.unique?'Own unique':item.cost>=0?item.cost.toLocaleString()+' SP':'—'}</span></li>
            {/each}</ul><p class="skill-list-note">Own unique first · remaining skills by base SP cost, before hint discounts.</p>{:else}<p class="empty-skills">No skills added yet.</p>{/if}
          </InspectPopover>
        </div>
        <div class="row-actions">
          <div class="team-control"><SimulatorTeamPicker value={uma.teamId??0} label={'Assign team for '+uma.name} onchange={id=>{uma.teamId=id;simulatorRoster.configured=true;}}/></div>
          <div class="row-buttons" role="group" aria-label={'Actions for '+uma.name}>
            <span title="Edit build"><Button variant="secondary" size="sm" icon="edit" ariaLabel={'Edit build for '+uma.name} onclick={()=>edit(uma)}/></span>
            <span title={simulatorRoster.umas.length>=18?'The race field is full':'Copy runner'}><Button variant="secondary" size="sm" icon="copy" ariaLabel={'Copy '+uma.name} disabled={simulatorRoster.umas.length>=18} onclick={()=>duplicate(uma)}/></span>
            <span class="delete-control" title={simulatorRoster.umas.length<=2?'Keep at least two runners':'Delete runner'}><Button variant="secondary" size="sm" icon="trash" ariaLabel={'Delete '+uma.name} disabled={simulatorRoster.umas.length<=2} onclick={()=>remove(uma)}/></span>
          </div>
        </div>
      </article>
    {/each}
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
</section>
<SimulatorVeteranPicker bind:open={veteransOpen} onselect={addVeteran}/>
{#if editing}<SimulatorUmaEditor uma={editing} bind:open={editorOpen} onsave={uma=>{if(simulatorRoster.umas.some(item=>item.id===uma.id))simulatorRoster.umas=simulatorRoster.umas.map(item=>item.id===uma.id?uma:item);else if(simulatorRoster.umas.length<18)simulatorRoster.umas.push(uma);simulatorRoster.configured=true;}}/>{/if}
<style>
  .field{--roster-columns:220px 180px minmax(0,1fr) 176px;min-width:0;padding:16px var(--setup-panel-padding,20px);background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);container:setup-field / inline-size}
  header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}h2{display:flex;align-items:center;gap:10px;font-size:17px;margin:0}h2 span{font-size:11px;font-weight:400;color:var(--text-secondary)}.field-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.field-actions :global(.ui-button){height:32px;min-height:32px;padding-inline:10px;border-radius:var(--radius-sm);font-size:11px}.field-actions :global(.ui-button svg){width:14px;height:14px}
  .field-heading{display:flex;align-items:center;gap:12px}.column-headings,.runner{display:grid;grid-template-columns:var(--roster-columns);align-items:center;gap:16px}.column-headings{padding:0 0 9px;color:var(--text-secondary);font-size:10px}.column-headings small{margin-left:6px;font-size:10px;color:var(--text-muted)}.action-headings{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;text-align:center}.runners{display:grid}.runner{min-width:0;padding:6px 0;border-top:1px solid var(--border-subtle)}.runner>div{min-width:0}.runner:hover{background:color-mix(in srgb,var(--accent-primary) 3%,transparent)}
  .summary{display:block;min-width:0;width:100%;padding:0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}.summary:hover :global(h3){color:var(--accent-primary)}.summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}.summary :global(.compact h3){font-size:13px}.summary :global(.compact .art){width:56px;height:52px}.summary :global(.compact){grid-template-columns:56px minmax(0,1fr);gap:9px}.summary :global(.compact .member-meta>small){align-items:center;gap:4px;font-size:10px}.summary :global(.member-meta>small>span:first-child:not(:last-child)){max-width:100%;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary :global(.member-meta>small>span:first-child:not(:last-child):after){content:"·";margin-left:4px;color:var(--text-muted)}
  .build-stats :global(.values.compact){grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.build-stats :global(.values.compact>div){justify-content:flex-start;gap:4px}.build-stats :global(.values.compact dd){font-size:12px;line-height:1.4}.build-stats :global(.values.compact img){width:20px;height:20px;flex:none}.build-stats :global([data-stat='sp'] dt){order:-1;flex:none;width:20px;color:var(--text-secondary);font-size:10px;font-weight:600;letter-spacing:0}
  .skill-summary{--inspect-popover-width:420px;--inspect-popover-padding:0;display:grid;grid-template-columns:minmax(0,1fr) 80px;gap:10px;align-items:center}.preview-skills{display:flex;flex-wrap:wrap;align-content:flex-start;align-items:center;gap:4px;min-width:0;max-height:44px;overflow:hidden}.skill-item{display:inline-flex;flex:none;min-width:0;max-width:min(220px,100%)}.skill-item :global(.skill-chip.compact){min-width:0;min-height:20px;font-size:10px}.skill-item :global(.skill-chip.compact img){width:20px;height:20px}.skill-item :global(.skill-chip.compact .skill-body){min-height:20px;align-items:center;padding:2px 5px;gap:3px;border-radius:4px}.skill-item :global(.skill-chip.compact.with-icon .skill-body){padding-left:4px;border-radius:0 4px 4px 0}.skill-item :global(.skill-chip.compact .skill-level){font-size:8px;padding-left:3px}.no-skills{font-size:11px;color:var(--text-secondary)}.skill-summary :global(.inspect){display:flex;min-width:0}.skill-summary :global(.inspect>.trigger){width:80px;height:var(--setup-control-height,36px);min-height:var(--setup-control-height,36px);padding:4px 7px;border:1px solid var(--factor-field-border);border-radius:var(--radius-sm);background:var(--factor-field-bg)}.skill-summary :global(.inspect>.trigger:hover){border-color:var(--border-secondary);background:var(--surface-2)}.more-skills{display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:11px;line-height:1;white-space:nowrap;color:var(--text-primary)}.more-skills :global(svg){flex:none;color:var(--text-secondary)}
  .skill-list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 52px 10px 12px;border-bottom:1px solid var(--border-subtle)}.skill-list-heading>div{display:grid;gap:4px;min-width:0}.skill-list-heading strong{font-size:13px;font-weight:600}.skill-list-heading strong>span{margin-left:5px;color:var(--text-secondary);font-size:11px;font-weight:400}.skill-list-heading small{color:var(--text-secondary);font-size:10px}.skill-list-heading>span{display:flex}.skill-list-heading :global(.ui-button){width:36px;min-height:36px;height:36px;padding:0;border-radius:var(--radius-sm)}.skill-summary :global(.popover>.close){top:10px;right:10px;width:36px;height:36px}.all-skills{display:grid;list-style:none;margin:0;padding:0;max-height:min(360px,calc(100dvh - 152px));overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}.all-skills li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0;padding:5px 12px;border-bottom:1px solid var(--border-subtle)}.all-skills li:last-child{border-bottom:0}.all-skills li.owned-unique{background:color-mix(in srgb,var(--accent-primary) 5%,transparent)}.all-skills :global(.skill-chip){width:fit-content;min-width:0;min-height:22px;font-size:11px}.all-skills :global(.skill-chip img){width:22px;height:22px}.all-skills :global(.skill-body){min-height:22px;align-items:center;padding-block:3px}.skill-cost{font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}.skill-list-note{margin:0;padding:10px 12px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:10px;line-height:1.5}.empty-skills{margin:0;padding:16px 12px;font-size:12px;color:var(--text-secondary)}
  .row-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px}.team-control{flex:none}.team-control :global(.inspect>.trigger),.team-control :global(.team-indicator){height:var(--setup-control-height,36px);min-height:var(--setup-control-height,36px)}.row-buttons{display:grid;grid-template-columns:repeat(3,36px);align-items:center;gap:6px}.row-buttons>span{display:flex}.row-buttons :global(.ui-button){width:100%;min-width:36px;min-height:36px;height:36px;padding:0;border-radius:var(--radius-sm);color:var(--text-primary)}.row-buttons :global(svg){width:16px;height:16px}.row-buttons :global(.ui-button:hover:not(:disabled)){color:var(--text-primary)}.delete-control :global(.ui-button:hover:not(:disabled)){color:var(--color-danger);background:var(--color-danger-soft);border-color:color-mix(in srgb,var(--color-danger) 38%,transparent)}
  :global(:root:not([data-theme='light'])) .skill-summary :global(.skill-chip:not(.rarity-unique-main) .skill-body){background:color-mix(in srgb,var(--skill-text) 4%,var(--surface-1));box-shadow:none}
  .field>p{font-size:12px;color:var(--color-danger)}
  @container setup-field (max-width:1150px){.column-headings,.runner{grid-template-columns:200px 180px minmax(0,1fr) 176px;gap:12px}}
  @container setup-field (max-width:900px){.column-headings{display:none}.runner{grid-template-columns:minmax(0,1fr) 180px 176px;gap:6px 12px;padding:8px 0}.skill-summary{grid-column:1 / -1;grid-row:2;margin-left:65px}.row-actions{grid-column:3;grid-row:1}}
  @container setup-field (max-width:580px){.runner{grid-template-columns:minmax(0,1fr) 140px;gap:7px 8px;padding:10px 0}.summary{grid-column:1 / -1;grid-row:1;padding-right:52px}.build-stats{grid-column:1 / -1;grid-row:2;max-width:210px}.row-actions{display:contents}.team-control{grid-column:2;grid-row:1;justify-self:end;z-index:1}.skill-summary{grid-column:1 / -1;grid-row:3;margin-left:0;gap:8px}.row-buttons{grid-column:2;grid-row:4;grid-template-columns:repeat(3,44px);justify-content:flex-end;gap:4px}.row-buttons :global(.ui-button){width:44px;min-width:44px;min-height:44px;height:44px}.summary :global(.compact h3){font-size:12px}}
  @container setup-field (min-width:300px) and (max-width:580px){.build-stats{grid-column:1;max-width:168px}.row-buttons{grid-row:2}}
  @media(max-width:767px){.skill-list-heading{padding-right:64px}.skill-list-heading :global(.ui-button),.skill-summary :global(.popover>.close){width:44px;min-height:44px;height:44px}}
  @media(max-width:650px){.field{padding:14px}header{margin-bottom:14px}.field-heading{width:100%;justify-content:space-between}.field-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;gap:8px}.field-actions :global(.ui-button){width:100%;min-height:44px;height:44px;padding-inline:8px;font-size:11px}}
</style>
