import type { Pair } from './hakuraku-types';

export type SkillOverviewRow = [number,string,number,number,number,number,number,number,number,number,number];
export type SkillOverview = { snapshotId:string;races:number;players:number;courseDistance:number;rows:SkillOverviewRow[];allPlayerCounts:Record<string,number> };
export type SkillDetail = { snapshotId:string;skillId:number;bucketCount:number;courseDistance:number;styles:Record<string,[number,number,number,number,number][]> };
export const skillStyles:Record<string,number> = { Oonige:5,Nige:1,Senko:2,Sashi:3,Oikomi:4 };
export const percentagePoints=(value:number)=>(value>0?'+':'')+(value*100).toFixed(1)+' pp';

export function fieldRows(pairs:Pair[],minimum:number,search:string) {
  const groups=new Map<number,{card:number;name:string;outfit:string;share:number;cells:Map<number,Pair>}>();
  const query=search.trim().toLowerCase();
  for(const pair of pairs) {
    if(pair.owners<minimum||![pair.name,pair.outfit,String(pair.card)].join(' ').toLowerCase().includes(query))continue;
    const row=groups.get(pair.card)??{card:pair.card,name:pair.name,outfit:pair.outfit,share:0,cells:new Map()};
    row.share+=pair.pop;row.cells.set(pair.style,pair);groups.set(pair.card,row);
  }
  return [...groups.values()].sort((a,b)=>b.share-a.share);
}
export function activationBins(detail:SkillDetail,style='all'):number[] {
  const result=Array<number>(100).fill(0);
  for(const [key,bins] of Object.entries(detail.styles)) {
    if(style!=='all'&&skillStyles[key]!==Number(style))continue;
    for(const [index,count] of bins) {
      // The source places events before the first distance bucket at -1.
      const bucket=index===-1?0:index;
      if(Number.isInteger(bucket)&&bucket>=0&&bucket<100&&Number.isFinite(count)&&count>=0)result[bucket]!+=count;
    }
  }
  return result;
}
export function centralActivationWindow(bins:number[],distance:number) {
  const total=bins.reduce((sum,n)=>sum+n,0);if(!total)return undefined;
  let cumulative=0,start=-1,end=99;
  for(let i=0;i<bins.length;i++) {
    cumulative+=bins[i]!;
    if(start<0&&cumulative>=total*.1)start=i;
    if(cumulative>=total*.9){end=i;break;}
  }
  return [Math.round(start*distance/100),Math.round((end+1)*distance/100)] as const;
}
