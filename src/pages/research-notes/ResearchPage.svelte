<script lang="ts">
  import Spinner from '@/components/Spinner.svelte';
  import { tick } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import Icon from '@/components/Icon.svelte';
  import { router } from '@/routes/router';
  import manifest from '../../../public/hakuraku/notes/manifest.json';
  import { researchBlocks } from './research-markdown';
  import 'katex/dist/katex.min.css';
  const topics:Record<string,string>={affinity:'Inheritance',events:'Race mechanics',sparks:'Inheritance','shop-refresh':'Training',spark_generation:'Inheritance','spot-struggle':'Race mechanics',dueling:'Race mechanics','plus-sparks':'Inheritance','light-hello':'Training','new-age-umamusume-data':'Data & analysis'};
  const categories=['All research','Race mechanics','Inheritance','Training','Data & analysis'];
  const params=new URLSearchParams(location.search);
  let sort=$state(params.get('sort')??'newest');
  const topicTabs=categories.map(name=>({id:name,label:name,badge:String(name==='All research'?manifest.length:manifest.filter(n=>topics[n.id]===name).length)}));
  const ordered=[...manifest].sort((a,b)=>b.date.localeCompare(a.date));
  let search=$state(params.get('q')??''),topic=$state(categories.includes(params.get('topic')??'')?params.get('topic')!:'All research'),error=$state(''),loading=$state(false),attempt=$state(0),blocks=$state<{title?:string;html:string}[]>([]),outline=$state<{id:string;title:string;level:number}[]>([]),active=$state(''),readingTime=$state(0),progress=$state(0);
  let article=$state<HTMLElement>();
  const noteId=$derived((router.route.params as Record<string,string>).noteId);
  const selected=$derived(manifest.find(n=>n.id===noteId));
  const notes=$derived(ordered.filter(n=>(topic==='All research'||topics[n.id]===topic)&&(n.title+' '+n.description+' '+topics[n.id]).toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date)));
  const libraryQuery=$derived(new URLSearchParams({...search?{q:search}:{},...topic!=='All research'?{topic}:{},...sort!=='newest'?{sort}:{}}).toString());
  const libraryHref=$derived('/research'+(libraryQuery?'?'+libraryQuery:''));
  $effect(()=>{if(!noteId)history.replaceState(history.state,'',libraryHref);});
  const adjacent=$derived(selected?ordered.indexOf(selected):-1);
  const newer=$derived(ordered[adjacent-1]),older=$derived(ordered[adjacent+1]);
  const tools=$derived(selected?.id==='new-age-umamusume-data'?[{href:'/competitive/cm-data',label:'CM Data'},{href:'/competitive/race-analysis',label:'Race Analysis'}]:selected&&topics[selected.id]==='Race mechanics'?[{href:'/competitive/race-analysis',label:'Race Analysis'}]:selected&&topics[selected.id]==='Inheritance'?[{href:'/tools/lineage-planner',label:'Lineage Planner'}]:[]);
  const related=$derived(ordered.filter(n=>selected&&n.id!==selected.id&&topics[n.id]===topics[selected.id]).slice(0,3));
  const published=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  $effect(()=>{
    const entry=selected;attempt;blocks=[];outline=[];error='';loading=false;progress=0;
    active='';readingTime=0;
    if(!entry)return;
    const controller=new AbortController();loading=true;
    fetch('/hakuraku/notes/'+entry.filename,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('Note unavailable ('+response.status+')');
      const text=await response.text();if(controller.signal.aborted)return;
      readingTime=Math.max(1,Math.ceil(text.split(/\s+/).length/220));
      const headings:typeof outline=[];let index=0;
      blocks=researchBlocks(text).map(block=>{
        const document=new DOMParser().parseFromString(block.html,'text/html');
        document.querySelector('h1')?.remove();
        if(!block.title)for(const heading of document.querySelectorAll('h2,h3')){
          const id='section-'+index++;heading.id=id;headings.push({id,title:heading.textContent??'',level:Number(heading.tagName[1])});
        }
        return {...block,html:document.body.innerHTML};
      });outline=headings;
    }).catch(reason=>{if(!controller.signal.aborted)error=reason instanceof Error?reason.message:'Could not load note.';}).finally(()=>{if(!controller.signal.aborted)loading=false;});
    return()=>controller.abort();
  });
  $effect(()=>{
    blocks;let observer:IntersectionObserver|undefined,cancelled=false;
    void tick().then(()=>{
      if(cancelled||!article)return;
      observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)active=entry.target.id;},{rootMargin:'-80px 0px -60% 0px'});
      article.querySelectorAll('h2[id],h3[id]').forEach(h=>observer!.observe(h));
    });
    return()=>{cancelled=true;observer?.disconnect();};
  });
  function updateProgress(){if(article){const rect=article.getBoundingClientRect();progress=Math.max(0,Math.min(100,-rect.top/Math.max(1,rect.height-window.innerHeight)*100));}}
</script>
<svelte:window onscroll={updateProgress}/>
<svelte:head><title>{selected?.title??'Research'} · uma.moe</title><meta name="description" content={selected?.description??'Research by Aya on racing, inheritance, training, and game mechanics.'}/></svelte:head>
{#snippet contents()}
  <nav aria-label="Article outline">{#each outline as item}<a class:active={active===item.id} class:subsection={item.level===3} aria-current={active===item.id?'location':undefined} href={'#'+item.id}>{item.title}</a>{/each}</nav>
{/snippet}
<div class="research-page" class:reading={Boolean(selected)}>
<AppPage routeId="research" title={selected?.title??'Research'} description={selected?.description??'Game mechanics, experiments, and findings by Aya.'} eyebrow={selected?topics[selected.id]:'uma.moe Research'} width="wide">
{#if selected}
  <div class="article-meta"><Button href={libraryHref} variant="secondary" size="sm" icon="arrow-left">Back to research</Button><span class="article-author">By Aya</span><time datetime={selected.date}>{published(selected.date)}</time><span>{readingTime||'…'} min read</span></div>
  {#if outline.length}<div class="mobile-contents"><Disclosure compact title="In this note" id="mobile-note-outline">{@render contents()}</Disclosure></div>{/if}
  <div class="reader">
    <div class="article-column">
      {#if loading}<Spinner size={48} centered label="Loading research note…"/>{:else if error}<Banner title="Note could not be loaded" tone="danger" reportable={false}>{error}<Button variant="secondary" onclick={()=>attempt++}>Retry</Button></Banner>{:else}
        <article bind:this={article} class="markdown">{#each blocks as block,index}{#if block.title}<Disclosure compact id={'research-detail-'+index} title={block.title}><div>{@html block.html}</div></Disclosure>{:else}<div>{@html block.html}</div>{/if}{/each}</article>
        <nav class="adjacent-notes" aria-label="More research notes">{#if newer}<a href={'/research/'+newer.id+(libraryQuery?'?'+libraryQuery:'')}><small>← Newer note</small><strong>{newer.title}</strong></a>{/if}{#if older}<a class="older-note" href={'/research/'+older.id+(libraryQuery?'?'+libraryQuery:'')}><small>Older note →</small><strong>{older.title}</strong></a>{/if}</nav>
        <footer class="article-end"><p>Published {published(selected.date)} by Aya. Findings reflect the evidence available at publication.</p><Button href={libraryHref} variant="secondary" size="sm" icon="arrow-left">Back to all notes</Button></footer>
        {#if related.length}<section class="related"><h2>Related research</h2>{#each related as note}<a href={'/research/'+note.id+(libraryQuery?'?'+libraryQuery:'')}><span>{note.title}<small>{note.description}</small></span><Icon name="arrow-right" size={16}/></a>{/each}</section>{/if}
      {/if}
    </div>
    <aside class="reading-sidebar"><div class="reading-sticky">
      {#if outline.length}<strong class="aside-title">In this note</strong><div class="reading-progress" aria-label="Reading progress"><span style:width={progress+'%'}></span></div>{@render contents()}{/if}
      {#if tools.length}<div class="note-tools"><strong>Explore in uma.moe</strong>{#each tools as tool}<Button href={tool.href} variant="secondary" size="sm" icon="arrow-right">{tool.label}</Button>{/each}</div>{/if}
      <div class="source-note">{#if related.length}<strong>More in {topics[selected.id]}</strong>{/if}{#each ordered.filter(n=>n.id!==selected.id&&topics[n.id]===topics[selected.id]) as note}<a href={'/research/'+note.id}>{note.title}</a>{/each}<a href={libraryHref}>Browse all {manifest.length} notes →</a></div>
    </div></aside>
  </div>
{:else if noteId}
  <EmptyState icon="book" title="Research note not found" description="Choose a note from the research library."/><Button href="/research">Browse research</Button>
{:else}
  <section class="library" aria-label="Research library">
    <div class="library-controls"><TextField id="research-search" label="Search research" type="search" prefixIcon="search" placeholder="Mechanic, topic, or note title…" bind:value={search}/><SelectField id="research-sort" label="Sort notes" bind:value={sort} options={[{value:'newest',label:'Newest first'},{value:'oldest',label:'Oldest first'},{value:'title',label:'Title A–Z'}]}/></div>
    <Tabs items={topicTabs} bind:value={topic} label="Research topics" variant="underline" controls="research-notes"/>
    <div class="list-summary"><span>{notes.length} of {manifest.length} notes</span><span>Original findings & supporting evidence</span></div>
    <div class="notes" id="research-notes">{#each notes as note}
      <a class="note" href={'/research/'+note.id+(libraryQuery?'?'+libraryQuery:'')}>
        <div class="note-date"><time datetime={note.date}>{published(note.date)}</time><span>{topics[note.id]}</span></div>
        <div class="note-copy"><h2>{note.title}{#if note.id===ordered[0]?.id}<span class="latest">Latest</span>{/if}</h2><p>{note.description}</p></div>
        <Icon name="arrow-right" size={18}/>
      </a>
    {:else}<EmptyState icon="search" title="No matching research" description="Try another topic or search term."/><Button variant="secondary" onclick={()=>{search='';topic='All research';}}>Reset filters</Button>{/each}</div>
  </section>
{/if}
</AppPage>
</div>
<style>
.library{min-width:0}.library-controls{display:flex;align-items:end;gap:12px;margin-bottom:12px}.library-controls>:global(.field:first-child){flex:1}.library-controls>:global(.field:last-child){width:180px}.list-summary{display:flex;justify-content:space-between;gap:12px;margin:14px 0;color:var(--text-secondary);font-size:11px}.notes{display:grid;gap:8px}.note{display:grid;grid-template-columns:125px minmax(0,1fr) 20px;gap:20px;align-items:center;padding:18px 20px;background:var(--surface-1);border-radius:var(--radius-md);color:var(--text-primary);text-decoration:none}.note:hover,.note:focus-visible{background:var(--surface-2)}.note:hover h2{color:var(--accent-primary)}.note-date{display:grid;gap:7px;font-size:11px;color:var(--text-secondary)}.note-date>span{font-size:10px;color:var(--accent-primary)}.note h2{font-size:15px;line-height:1.5;font-weight:600;margin:0 0 4px;overflow-wrap:anywhere}.note p{font-size:12px;line-height:1.6;color:var(--text-secondary);margin:0}.note>:global(svg){color:var(--text-secondary)}.latest{display:inline-block;vertical-align:middle;font-size:9px;font-weight:600;color:var(--accent-primary);background:var(--color-accent-soft);padding:2px 6px;border-radius:4px;margin-left:10px}
a{color:var(--accent-primary)}
.reading :global(.page-heading){width:min(100%,1200px);margin-inline:auto;padding:18px 0 12px}
.article-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;width:min(100%,1200px);margin-inline:auto;padding-bottom:12px;border-bottom:1px solid var(--border-subtle);font-size:11px;color:var(--text-secondary)}
.article-meta :global(.ui-button){text-decoration:none}
.article-author{font-weight:600;color:var(--text-primary)}
.reader{display:grid;grid-template-columns:minmax(0,1fr) 248px;gap:24px;align-items:start;width:min(100%,1200px);margin-inline:auto}
.article-column{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:22px 24px}
.mobile-contents{display:none}
.markdown{font-size:15px;line-height:1.7;overflow-wrap:anywhere}.markdown :global(h2){font-size:22px;line-height:1.4;letter-spacing:-.025em;margin:28px 0 12px;padding-top:12px;border-top:1px solid var(--border-subtle);scroll-margin-top:90px}.markdown :global(h3){font-size:17px;line-height:1.5;margin:22px 0 10px;scroll-margin-top:90px}.markdown :global(p){margin:0 0 16px}.markdown :global(img){display:block;max-width:100%;height:auto;margin:24px auto}.markdown :global(pre){padding:18px 20px;overflow:auto;background:var(--surface-2);font-size:12px;line-height:1.7}.markdown :global(code){font-size:.85em;color:var(--accent-primary)}.markdown :global(blockquote){margin:24px 0;padding:14px 20px;border-left:3px solid var(--accent-primary);background:color-mix(in srgb,var(--accent-primary) 5%,transparent);color:var(--text-secondary)}.markdown :global(blockquote p:last-child){margin-bottom:0}.markdown :global(table){display:block;width:max-content;max-width:100%;overflow:auto;border-collapse:collapse;font-size:12px;margin:24px 0}.markdown :global(th),.markdown :global(td){padding:10px 14px;border:1px solid var(--border-primary);white-space:normal}.markdown :global(th){background:var(--surface-2);text-align:left}.markdown :global(a){color:var(--accent-primary);text-underline-offset:3px}.markdown :global(.katex-display){overflow:auto;padding:14px 4px}
.reading-sidebar{min-width:0;align-self:stretch}.reading-sticky{position:sticky;top:80px;padding:16px;background:var(--surface-1);border-radius:var(--radius-lg)}.aside-title{font-size:12px}.reading-progress{height:2px;background:var(--border-subtle);margin:12px 0}.reading-progress>span{display:block;height:100%;background:var(--accent-primary)}nav{display:grid;gap:2px}nav a{font-size:12px;line-height:1.5;padding:7px 10px;color:var(--text-secondary);text-decoration:none;border-left:2px solid transparent}nav a.active{color:var(--accent-primary);border-color:var(--accent-primary);background:var(--color-accent-soft)}nav a.subsection{padding-left:22px;font-size:11px}.source-note{display:grid;gap:8px;border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:16px;font-size:11px;line-height:1.6}.source-note a{text-decoration:none;color:var(--text-secondary)}.source-note a:hover{color:var(--accent-primary)}
.note-tools{display:grid;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);font-size:12px}.note-tools:first-child{margin-top:0;padding-top:0;border:0}.note-tools>:global(.ui-button){justify-content:start;font-size:11px;min-height:30px}
.adjacent-notes{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:none;margin-top:30px}.adjacent-notes a{display:grid;gap:8px;padding:16px;border:0;border-radius:var(--radius-md);background:var(--surface-1)}.adjacent-notes a:hover{background:var(--color-accent-soft)}.adjacent-notes small{font-size:10px;color:var(--accent-primary)}.adjacent-notes strong{font-size:13px;line-height:1.5;color:var(--text-primary)}.older-note{grid-column:2}
.article-end{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:24px;padding:16px 0;border-top:1px solid var(--border-subtle);font-size:11px;color:var(--text-secondary)}.article-end p{margin:0;max-width:65ch;line-height:1.6}.related h2{font-size:16px}.related>a{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--border-subtle);text-decoration:none;font-size:13px;color:var(--text-primary)}.related small{display:block;font-size:12px;color:var(--text-secondary);margin-top:5px}
@media(max-width:950px){.reader{grid-template-columns:minmax(0,1fr) 210px;gap:16px}.article-column{padding:18px}.reading-sticky{padding:12px}.note{gap:14px;padding:16px}}
@media(max-width:700px){.library,.article-meta,.reader,.mobile-contents{margin-inline:12px}.article-meta,.reader{width:auto}.reading :global(.page-heading){width:calc(100% - 24px);padding:12px 0}.reader{grid-template-columns:1fr}.article-column{padding:16px}.reading-sidebar{display:none}.mobile-contents{display:block}.library-controls{gap:8px}.library-controls>:global(.field:last-child){width:135px}.list-summary>span:last-child{display:none}.note{grid-template-columns:minmax(0,1fr) 18px;gap:8px 12px;padding:14px}.note-date{grid-column:1/-1;display:flex;gap:12px;flex-wrap:wrap}.note-copy{grid-column:1}.note h2{font-size:14px}.note p{font-size:12px}.markdown{font-size:14px;line-height:1.7}.article-meta{gap:8px 12px}}
</style>
