import { createServer } from 'vite';
import fs from 'node:fs';
// Isolated calculation benchmark; browser interaction/paint budgets remain in interaction.spec.ts.
const server=await createServer({configLoader:'runner',mode:'beta',server:{middlewareMode:true},logLevel:'error'});
try {
 const {withTimelineRewardFallbacks}=await server.ssrLoadModule('/src/lib/timeline/events/timeline-reward-summary.ts');
 const {applyGlobalRewardPrecedence}=await server.ssrLoadModule('/src/lib/carat-planner/rewards/planner-reward-precedence.ts');
 const {profileVeteranAffinity}=await server.ssrLoadModule('/src/lib/profile/veterans/profile-veteran-metrics.ts');
 const {VeteranAffinityEngine}=await server.ssrLoadModule('/src/lib/veterans/affinity/affinity-engine.ts');
 const events=Array.from({length:4000},(_,i)=>({id:`event-${i}`,eventType:'character_banner',date:new Date(Date.UTC(2026,7,1+Math.floor(i/5)))}));
 const rewards=events.map((event,i)=>({id:`reward-${i}`,event_id:event.id,label:`Campaign ${i} missions and presents`,category:'campaign',currency:'free_jewels',amount:150,available_at:event.date.toISOString(),provenance:'jp_fallback'}));
 const globalLogins=Array.from({length:100},(_,i)=>({id:`global-${i}`,label:'Login bonus',currency:'free_jewels',amount:150,available_at:new Date(Date.UTC(2026,0,i*7+1)).toISOString(),provenance:'global_news'}));
 const veteran={id:1,card_id:101101,factors:Array.from({length:60},(_,i)=>200000+i*10+3),win_saddle_id_array:[1,2,3],succession_chara_array:[{position_id:10,card_id:106701,factor_id_array:[103,200003],win_saddle_id_array:[2]},{position_id:20,card_id:108801,factor_id_array:[103,200003],win_saddle_id_array:[3]}]};
 const engine=new VeteranAffinityEngine({chars:[1011,1067,1088],aff2:[0,10,15,10,0,20,15,20,0],aff3:Array(27).fill(0)}),groups=new Map([[1,1],[2,2],[3,3]]);
 const runs={fallback:()=>withTimelineRewardFallbacks({rewards},events),precedence:()=>applyGlobalRewardPrecedence({rewards:[...rewards,...globalLogins]}),affinity:()=>{for(let i=0;i<200;i++)profileVeteranAffinity(veteran,engine,groups,106701);}};
 const report={};for(const [name,run] of Object.entries(runs)) {for(let i=0;i<3;i++)run();const times=[];for(let i=0;i<15;i++){const start=performance.now();run();times.push(performance.now()-start);}times.sort((a,b)=>a-b);report[name]={medianMs:+times[7].toFixed(2),minMs:+times[0].toFixed(2),maxMs:+times.at(-1).toFixed(2)};}
 const output=process.argv[2]??'.tmp/profile-hotspots.json';
 fs.mkdirSync('.tmp',{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(report);
} finally {await server.close();}
