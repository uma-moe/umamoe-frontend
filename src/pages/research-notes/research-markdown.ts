import { Marked, type RendererExtension } from 'marked';
import markedKatex from 'marked-katex-extension';
import { sanitizeContentHtml } from '@/lib/content-html';

export function renderResearchMarkdown(markdown:string):string {
  const math=new Map<string,string>();
  const extension=markedKatex({throwOnError:false,trust:false,nonStandard:true,output:'htmlAndMathml'});
  // Sanitize authored HTML before inserting KaTeX's trusted generated markup.
  for(const item of extension.extensions??[]) {
    if(!('renderer' in item)||!item.renderer)continue;
    const render=item.renderer;
    item.renderer=function(this:ThisParameterType<RendererExtension['renderer']>,token){const key=`MATH${crypto.randomUUID()}END`;math.set(key,String(render.call(this,token)));return key;};
  }
  const parsed=new Marked(extension).parse(markdown,{async:false});
  const document=new DOMParser().parseFromString(sanitizeContentHtml(parsed),'text/html');
  for(const element of document.querySelectorAll('a,img')) {
    const attr=element.tagName==='A'?'href':'src';
    const original=element.getAttribute(attr)??'';
    const value=original.replace(/^https:\/\/hakuraku\.moe(?=\/)/,'');
    if(value.startsWith('/attachments/'))element.setAttribute(attr,`/hakuraku/notes${value}`);
    else if(value.startsWith('/notes/'))element.setAttribute(attr,value.replace('/notes/','/research/'));
    else if(['/racedata','/multirace'].includes(value))element.setAttribute(attr,'/competitive/race-analysis');
    else if(['/simdata','/umalogs'].includes(value))element.setAttribute(attr,'/competitive/cm-data');
    else if(value==='/masterdata')element.setAttribute(attr,'/tools/master-data');
    else if(value.startsWith('/')&&!value.startsWith('/hakuraku/'))element.setAttribute(attr,`https://hakuraku.moe${value}`);
  }
  let html=document.body.innerHTML;
  for(const [key,value] of math)html=html.replaceAll(key,value);
  return html;
}

export function researchBlocks(markdown:string):{title?:string;html:string}[] {
  return markdown.split(/(^:::details[^\n]*\r?\n[\s\S]*?^:::\s*$)/m).filter(Boolean).map(block=>{
    const details=/^:::details\s+([^\n]*)\r?\n([\s\S]*?)^:::\s*$/m.exec(block);
    return details?{title:details[1]!.trim(),html:renderResearchMarkdown(details[2]!)}:{html:renderResearchMarkdown(block)};
  });
}
