<script lang="ts">
  import { tick } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
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
  const ordered=[...manifest].sort((a,b)=>b.date.localeCompare(a.date));
  let search=$state(''),topic=$state('All research'),error=$state(''),loading=$state(false),attempt=$state(0),blocks=$state<{title?:string;html:string}[]>([]),outline=$state<{id:string;title:string;level:number}[]>([]),active=$state(''),readingTime=$state(0),progress=$state(0);
  let article=$state<HTMLElement>();
  const noteId=$derived((router.route.params as Record<string,string>).noteId);
  const selected=$derived(manifest.find(n=>n.id===noteId));
  const notes=$derived(ordered.filter(n=>(topic==='All research'||topics[n.id]===topic)&&(n.title+' '+n.description+' '+topics[n.id]).toLowerCase().includes(search.toLowerCase())));
  const related=$derived(ordered.filter(n=>selected&&n.id!==selected.id&&topics[n.id]===topics[selected.id]).slice(0,3));
  const published=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  $effect(()=>{
    const entry=selected;attempt;blocks=[];outline=[];error='';loading=false;progress=0;
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
<svelte:head><title>{selected?.title??'Research'} · uma.moe</title><meta name="description" content={selected?.description??'Hakuraku research on racing, inheritance, training, and game mechanics.'}/></svelte:head>
<AppPage routeId="research" title={selected?.title??'Research'} description={selected?.description??'A closer look at how Umamusume works. Mechanics, experiments, and the data behind them.'} eyebrow={selected?topics[selected.id]:'Hakuraku archive'} width="wide">
{#if selected}
  <div class="article-meta"><a href="/research">← Research library</a><span>{published(selected.date)}</span><span>{readingTime||'…'} min read</span><a href={'https://hakuraku.moe/notes/'+selected.id} target="_blank" rel="noreferrer">Original by Hakuraku ↗</a></div>
  <div class="reader">
    <div class="article-column">
      {#if loading}<p role="status">Loading research note…</p>{:else if error}<Banner title="Note could not be loaded" tone="danger" reportable={false}>{error}<Button variant="secondary" onclick={()=>attempt++}>Retry</Button></Banner>{:else}
        <article bind:this={article} class="markdown">{#each blocks as block,index}{#if block.title}<Disclosure compact id={'research-detail-'+index} title={block.title}><div>{@html block.html}</div></Disclosure>{:else}<div>{@html block.html}</div>{/if}{/each}</article>
        <footer class="article-end"><span>END OF NOTE</span><p>Published {published(selected.date)}. Findings reflect the evidence available at publication.</p><a href="/research">← Back to all research</a></footer>
        {#if related.length}<section class="related"><h2>Continue reading</h2>{#each related as note}<a href={'/research/'+note.id}><span>{note.title}<small>{note.description}</small></span><Icon name="arrow-right" size={16}/></a>{/each}</section>{/if}
      {/if}
    </div>
    <aside class="reading-sidebar"><div class="reading-sticky"><span class="eyebrow">IN THIS NOTE</span><div class="reading-progress" aria-label="Reading progress"><span style:width={progress+'%'}></span></div><nav aria-label="Article outline">{#each outline as item}<a class:active={active===item.id} class:subsection={item.level===3} href={'#'+item.id}>{item.title}</a>{/each}</nav><div class="source-note"><Icon name="book" size={18}/><strong>Hakuraku research</strong><p>Original notes and supporting figures, preserved in the uma.moe library.</p></div></div></aside>
  </div>
{:else if noteId}
  <EmptyState icon="book" title="Research note not found" description="Choose a note from the research library."/><Button href="/research">Browse research</Button>
{:else}
  <div class="library">
    <aside class="topics"><div class="topic-heading"><Icon name="book" size={16}/><span>Browse the library</span></div><nav aria-label="Research topics">{#each categories as name}<button class:active={topic===name} aria-pressed={topic===name} onclick={()=>topic=name}><span>{name}</span><small>{name==='All research'?manifest.length:manifest.filter(n=>topics[n.id]===name).length}</small></button>{/each}</nav><div class="source-note"><strong>Hakuraku research</strong><p>Replay evidence, observed rates, and documented game behavior. Original work from Hakuraku.</p><a href="https://github.com/ayaliz/hakuraku/" target="_blank" rel="noreferrer">Source archive ↗</a></div></aside>
    <div class="library-main">
      {#if !search&&topic==='All research'}<a class="featured" href={'/research/'+ordered[0]!.id}><div><span class="eyebrow">LATEST RESEARCH · {published(ordered[0]!.date)}</span><h2>{ordered[0]!.title}</h2><p>{ordered[0]!.description}</p><span class="read-link">Read the note <span aria-hidden="true">→</span></span></div></a>{/if}
      <div class="library-controls"><div><h2>{topic}</h2><p>{notes.length} notes in the library</p></div><TextField id="research-search" label="Search research" type="search" placeholder="Mechanics, inheritance, training…" bind:value={search}/></div>
      <div class="notes">{#each notes as note}<a class="note" href={'/research/'+note.id}><div class="note-date"><time datetime={note.date}>{published(note.date)}</time><span>{topics[note.id]}</span></div><div class="note-copy"><h2>{note.title}</h2><p>{note.description}</p></div><span class="note-arrow" aria-hidden="true">↗</span></a>{:else}<EmptyState icon="search" title="No matching research" description="Try another topic or search term."/>{/each}</div>
    </div>
  </div>
{/if}
<p class="attribution">Research and attachments by <a href="https://github.com/ayaliz/hakuraku/" target="_blank" rel="noreferrer">Hakuraku</a> · <a href="/hakuraku/LICENSE">MIT license</a></p>
</AppPage>
<style>
.library{display:grid;grid-template-columns:205px minmax(0,1fr);gap:36px}.library-main{min-width:0}.topic-heading{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:600;margin-bottom:16px}.topics nav{display:grid;gap:4px}.topics button{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;font-size:12px;padding:12px 0;background:transparent;border:0;color:var(--text-secondary);cursor:pointer}.topics button.active{color:var(--accent-primary);background:transparent;font-weight:650}.topics small{font-size:10px;opacity:.7}.source-note{border-top:1px solid var(--border-subtle);padding-top:18px;margin-top:26px;font-size:11px;line-height:1.7;color:var(--text-secondary)}.source-note strong{display:block;color:var(--text-primary);margin:6px 0}.source-note a{font-size:11px}.featured{display:block;padding:8px 0 30px;border-bottom:1px solid var(--border-subtle);text-decoration:none;color:var(--text-primary)}.featured h2{font-size:clamp(28px,3vw,40px);font-weight:650;letter-spacing:-.04em;line-height:1.2;max-width:22ch;margin:14px 0}.featured p{max-width:56ch;font-size:13px;line-height:1.7;color:var(--text-secondary)}.eyebrow{font-size:9px;letter-spacing:.1em;font-weight:600;color:var(--text-secondary)}.read-link{display:flex;gap:18px;color:var(--accent-primary);font-size:12px;margin-top:22px}.library-controls{display:flex;gap:16px;align-items:center;justify-content:space-between;margin:30px 0 12px}.library-controls h2{font-size:15px;margin:0 0 5px}.library-controls p{font-size:11px;margin:0;color:var(--text-secondary)}.library-controls :global(.field){width:min(100%,360px)}.notes{border-top:1px solid var(--border-primary)}.note{display:grid;grid-template-columns:130px minmax(0,1fr) 20px;gap:24px;padding:24px 6px;border-bottom:1px solid var(--border-subtle);color:var(--text-primary);text-decoration:none}.note:hover h2{color:var(--accent-primary)}.note-date{display:grid;align-content:start;gap:9px;font-size:11px;color:var(--text-secondary)}.note-date>span{font-size:9px;color:var(--accent-primary)}.note h2{font-size:16px;letter-spacing:-.015em;font-weight:600;margin:0 0 8px}.note p{font-size:12px;line-height:1.65;color:var(--text-secondary);margin:0;max-width:74ch}.note-arrow{color:var(--text-secondary);font-size:19px}.article-meta{display:flex;flex-wrap:wrap;gap:12px 24px;padding-bottom:18px;border-bottom:1px solid var(--border-subtle);font-size:11px;color:var(--text-secondary)}a{color:var(--accent-primary)}.reader{display:grid;grid-template-columns:minmax(0,780px) 220px;justify-content:center;gap:clamp(25px,5vw,80px)}.article-column{min-width:0}.markdown{font-size:15px;line-height:1.85;overflow-wrap:anywhere}.markdown :global(h2){font-size:22px;line-height:1.4;letter-spacing:-.025em;margin:40px 0 16px;padding-top:12px;border-top:1px solid var(--border-subtle);scroll-margin-top:90px}.markdown :global(h3){font-size:17px;line-height:1.5;margin:28px 0 12px;scroll-margin-top:90px}.markdown :global(p){margin:0 0 18px}.markdown :global(img){display:block;max-width:100%;height:auto;margin:24px auto}.markdown :global(pre){padding:18px 20px;overflow:auto;background:var(--surface-2);font-size:12px;line-height:1.7}.markdown :global(code){font-size:.85em;color:var(--accent-primary)}.markdown :global(blockquote){margin:24px 0;padding:14px 20px;border-left:3px solid var(--accent-primary);background:color-mix(in srgb,var(--accent-primary) 5%,transparent);color:var(--text-secondary)}.markdown :global(blockquote p:last-child){margin-bottom:0}.markdown :global(table){display:block;max-width:100%;overflow:auto;border-collapse:collapse;font-size:12px;margin:24px 0}.markdown :global(th),.markdown :global(td){padding:10px 14px;border:1px solid var(--border-primary);white-space:normal}.markdown :global(th){background:var(--surface-2);text-align:left}.markdown :global(a){color:var(--accent-primary);text-underline-offset:3px}.markdown :global(.katex-display){overflow:auto;padding:14px 4px}.reading-sticky{position:sticky;top:85px;padding-top:15px}.reading-progress{height:2px;background:var(--border-subtle);margin:14px 0}.reading-progress>span{display:block;height:100%;background:var(--accent-primary)}.reading-sidebar nav{display:grid;gap:2px;max-height:55vh;overflow:auto}.reading-sidebar nav a{font-size:11px;line-height:1.5;padding:6px 8px;color:var(--text-secondary);text-decoration:none;border-left:2px solid transparent}.reading-sidebar nav a.active{color:var(--accent-primary);border-color:var(--accent-primary)}.reading-sidebar nav a.subsection{padding-left:20px;font-size:10px}.article-end{margin-top:40px;padding:22px 0;border-top:1px solid var(--border-primary);font-size:12px;color:var(--text-secondary)}.article-end>span{font-size:9px;letter-spacing:.15em}.related{margin:20px 0}.related h2{font-size:16px}.related>a{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--border-subtle);text-decoration:none;font-size:13px;color:var(--text-primary)}.related small{display:block;font-size:11px;color:var(--text-secondary);margin-top:5px}.attribution{font-size:10px;color:var(--text-secondary);padding-top:20px;border-top:1px solid var(--border-subtle)}
@media(max-width:950px){.library{grid-template-columns:165px minmax(0,1fr);gap:22px}.featured{grid-template-columns:1fr}.reader{grid-template-columns:minmax(0,1fr) 180px;gap:25px}.note{grid-template-columns:100px 1fr 16px;gap:16px}}
@media(max-width:700px){.library,.reader{grid-template-columns:1fr}.topics nav{display:flex;overflow:auto;gap:4px}.topics button{white-space:nowrap;padding:10px 12px}.topics .source-note,.topic-heading{display:none}.reading-sidebar{display:none}.featured{padding:8px 0 24px}.featured h2{font-size:25px}.library-controls{align-items:stretch;flex-direction:column}.library-controls :global(.field){width:100%}.note{grid-template-columns:1fr 16px;gap:10px;padding:20px 0}.note-date{grid-column:1/-1;display:flex;gap:12px;align-items:center}.note-copy{grid-column:1}.markdown{font-size:14px;line-height:1.85}.article-meta{gap:10px 18px}.reader{padding-inline:4px}}
</style>
