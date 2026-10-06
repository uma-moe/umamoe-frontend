import { setupCatalogFixtures } from '../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { expect, it } from 'vitest';
import { filterParents, groupParentFilters, manualBestFits, manualParent, parseManualParents, parentAffinity, parentCharacter, parentFactors, parentSparkMatched, type ManualParent, type ParentFactorFilter, type ParentPickerState } from './parent-picker';
import { VeteranAffinityEngine } from './affinity-engine';
import { normalizeVeteranRecord } from './veteran-normalizer';
import { parsePlannerTransfer } from '@/lib/lineage/planner';

const entry: ManualParent = { id:'legacy-id',label:'Parent',mainCardId:100101,ownSparkIds:[101],p1CardId:100201,p1SparkIds:[103],p2CardId:100301,p2SparkIds:[202],mainWinSaddleIds:[16],p1WinSaddleIds:[15],createdAt:'2026-01-01' };
it.each(['bookmark','partner'] as const)('searches %s usernames while preserving Uma search, sorting and spark filters',share_source=>{
  const parents=['ZBorrower','ABorrower',undefined,''].map((trainerName,index)=>({
    ...manualParent({...entry,id:String(index),mainCardId:100601,ownSparkIds:index===0?[103]:[101]}),
    share_source,trainerName
  }));
  const matches=(query:string,factors:ParentFactorFilter[]=[])=>filterParents(parents,{query,sort:'name',factors},()=> 'Oguri Cap',()=>0);
  expect(matches('  zBoRr  ')).toEqual([parents[0]]);
  expect(matches('aborrower')).toEqual([parents[1]]);
  expect(matches('borrower')).toEqual(parents.slice(0,2));
  expect(matches('OGURI')).toEqual(parents);
  expect(matches('missing')).toEqual([]);
  expect(matches('undefined')).toEqual([]);
  expect(matches('   ')).toEqual(parents);
  expect(matches('borrower',[{factorId:10,scope:'own',minLevel:3}])).toEqual([parents[0]]);
  expect(matches('borrower',[{factorId:20,scope:'own',minLevel:3}])).toEqual([]);
});
it('matches alternatives within each color while requiring every color group',()=>{
  const parents=[
    manualParent({...entry,id:'speed-mile',ownSparkIds:[103,3202],p1SparkIds:[],p2SparkIds:[]}),
    manualParent({...entry,id:'stamina-medium',ownSparkIds:[203,3302],p1SparkIds:[],p2SparkIds:[]}),
    manualParent({...entry,id:'blue-only',ownSparkIds:[103,203],p1SparkIds:[],p2SparkIds:[]}),
    manualParent({...entry,id:'red-only',ownSparkIds:[3202,3302],p1SparkIds:[],p2SparkIds:[]}),
    manualParent({...entry,id:'both-blue',ownSparkIds:[103,203,3202],p1SparkIds:[],p2SparkIds:[]})
  ];
  // Deliberately interleave colors: display order must not change the matching groups.
  const factors:ParentFactorFilter[]=[10,320,20,330].map(factorId=>({factorId,scope:'own',minLevel:2,maxLevel:3}));
  const matches=(factorOperators:ParentPickerState['factorOperators'])=>filterParents(parents,{query:'',sort:'name',factors,factorOperators},()=>'',()=>0).map(p=>p.share_local_id);
  expect(matches(undefined)).toEqual([]);
  expect(matches({blue:'or',pink:'or'})).toEqual(['speed-mile','stamina-medium','both-blue']);
  expect(matches({blue:'and',pink:'or'})).toEqual(['both-blue']);
  expect(matches({blue:'or',pink:'and'})).toEqual([]);
  expect(groupParentFilters(factors).map(group=>[group.tone,group.entries.map(entry=>entry.index)])).toEqual([['blue',[0,2]],['pink',[1,3]]]);
  factors.push({factorId:10,scope:'p1',minLevel:1});
  expect(matches({blue:'and',pink:'or'})).toEqual([]);
  expect(filterParents(parents,{query:'',sort:'name',factors:[],factorOperators:{blue:'or'}},()=>'',()=>0)).toEqual(parents);
});
it('sorts newest parents first and leaves unknown dates at the end',()=>{
  const old=manualParent(entry), newest=manualParent({...entry,id:'new',createdAt:'2026-09-20'});
  const unknown={...old,pickerId:'unknown',creation_time:null}, invalid={...old,pickerId:'invalid',creation_time:'invalid'};
  expect(filterParents([unknown,old,invalid,newest],{query:'',sort:'creation_time',factors:[]},()=>'',()=>0)).toEqual([newest,old,unknown,invalid]);
});
it('resolves missing outfits from the Angular trained-character ID without changing the saved record',()=>{
  const characters=new Map([[100101,{id:'100101',name:'Special Week',image:''}],[100102,{id:'100102',name:'Special Week (Summer)',image:''}]]);
  const parent=manualParent(entry);parent.card_id=null;parent.trained_chara_id=1001;
  expect(parentCharacter(parent,characters)).toEqual({cardId:100101,name:'Special Week'});
  expect(parent.card_id).toBeNull();
  expect(parentCharacter({...parent,card_id:100102},characters)).toEqual({cardId:100102,name:'Special Week (Summer)'});
  expect(parentCharacter({...parent,trained_chara_id:9999},characters)).toEqual({cardId:undefined,name:'Uma #9999'});
  expect(parentCharacter({...parent,trained_chara_id:null},characters)).toEqual({cardId:undefined,name:'Unknown'});
  expect(filterParents([parent],{query:'Special Week',sort:'name',factors:[]},p=>parentCharacter(p,characters).name,()=>0)).toEqual([parent]);
});
it('uses the Angular picker factor precedence and highest-star ordering for display and filters',()=>{
  const parent=manualParent(entry);
  parent.inheritance={blue_sparks:[101,203,103],pink_sparks:[],green_sparks:[],white_sparks:[],blue_stars_sum:7,pink_stars_sum:0,green_stars_sum:0,white_stars_sum:0};
  expect(parentFactors(parent).map(f=>f.encodedId)).toEqual([203,103,101]);
  parent.factor_info_array=[{factor_id:102,level:2}];
  expect(parentFactors(parent).map(f=>f.encodedId)).toEqual([102]);
  expect(filterParents([parent],{query:'',sort:'blue',factors:[{factorId:10,scope:'own',minLevel:2}]},()=>'',()=>0)).toEqual([parent]);
  parent.factors=[];
  expect(normalizeVeteranRecord(parent).factors).toEqual([{id:10,level:2}]);
  expect(parsePlannerTransfer({veteran:parent})?.payload.find(node=>node.position==='p2')?.sparks).toEqual([{factorId:10,name:'Speed',type:0,level:2}]);
});
it('retains Angular manual payloads and filters individual star levels in the correct source',()=>{
  expect(parseManualParents(JSON.stringify([entry]))).toEqual([entry]);
  expect(()=>parseManualParents('[{"id":"bad"}]')).toThrow(/untouched/);
  const parent=manualParent(entry);
  parent.succession_chara_array!.push({position_id:11,card_id:100401,rank:0,rarity:null,talent_level:null,factor_id_array:[303]});
  const filter=(scope:'any'|'own'|'p1'|'p2',factorId=10,minLevel=3)=>filterParents([parent],{query:'',sort:'total',factors:[{factorId,scope,minLevel}]},()=>entry.label,()=>0);
  expect(filter('own')).toEqual([]);expect(filter('p1')).toEqual([parent]);expect(filter('p2')).toEqual([]);expect(filter('any')).toEqual([parent]);
  expect(filter('any',30)).toEqual([]); // Great-grandparents are not P1/P2 picker sources.
  expect(parent.factors).toEqual([101]);expect(parent.succession_chara_array?.[0]?.factor_id_array).toEqual([103]);
  parent.factor_info_array=[];
  expect(normalizeVeteranRecord(parent).factors).toEqual([{id:10,level:1}]);
  parent.inheritance={blue_sparks:[104,303],pink_sparks:[],green_sparks:[],white_sparks:[],blue_stars_sum:7,pink_stars_sum:0,green_stars_sum:0,white_stars_sum:0};
  expect(parsePlannerTransfer({veteran:parent})?.payload.find((node)=>node.position==='p2')?.sparks.map((spark)=>[spark.factorId,spark.level])).toEqual([[10,1]]);
});
it('combines stars across Own, P1 and P2 while keeping per-slot requirements independent',()=>{
  const parent=manualParent({...entry,ownSparkIds:[102,200012],p1SparkIds:[103,200011],p2SparkIds:[101,200013]});
  parent.succession_chara_array!.push({position_id:11,card_id:100401,rank:0,rarity:null,talent_level:null,factor_id_array:[103]});
  const filter=(factors:ParentFactorFilter[],query='')=>filterParents([parent],{query,sort:'name',factors},()=>entry.label,()=>0);
  expect(filter([{factorId:10,scope:'combined',minLevel:6}])).toEqual([parent]);
  expect(filter([{factorId:10,scope:'combined',minLevel:7}])).toEqual([]);
  expect(filter([{factorId:10,scope:'combined',minLevel:5,maxLevel:6}])).toEqual([parent]);
  expect(filter([{factorId:10,scope:'combined',minLevel:6,maxLevel:6}])).toEqual([parent]);
  expect(filter([{factorId:10,scope:'combined',minLevel:1,maxLevel:5}])).toEqual([]);
  expect(filter([{factorId:10,scope:'own',minLevel:1,maxLevel:1}])).toEqual([]);
  expect(filter([{factorId:10,scope:'p1',minLevel:1,maxLevel:2}])).toEqual([]);
  expect(filter([{factorId:10,scope:'any',minLevel:1,maxLevel:2}])).toEqual([parent]);
  expect(filter([{factorId:10,scope:'any',minLevel:4}])).toEqual([]);
  expect(filter([{factorId:10,scope:'combined',minLevel:6},{factorId:20001,scope:'combined',minLevel:6},{factorId:10,scope:'p1',minLevel:3}],'Parent')).toEqual([parent]);
  expect(filter([{factorId:10,scope:'combined',minLevel:6},{factorId:10,scope:'own',minLevel:3}])).toEqual([]);
  expect(filter([{factorId:10,scope:'combined',minLevel:6}],'missing')).toEqual([]);
  const nine=manualParent({...entry,ownSparkIds:[103],p1SparkIds:[103],p2SparkIds:[103]});
  expect(filterParents([nine],{query:'',sort:'name',factors:[{factorId:10,scope:'combined',minLevel:9}]},()=>entry.label,()=>0)).toEqual([nine]);
});
it('uses the planner calculation including grouped G1 race bonuses',()=>{
  const engine=new VeteranAffinityEngine({chars:[1001,1002,1003,1004],aff2:Array(16).fill(2),aff3:Array(64).fill(3)});
  expect(parentAffinity(manualParent(entry),1004,engine,new Map([[16,1],[15,1]]))).toBe(11);
  expect(parentAffinity(manualParent(entry),undefined,engine,new Map())).toBe(0);
});
it('highlights only contributing slots and levels, including combined star ranges',()=>{
  const parent=manualParent({...entry,ownSparkIds:[101,202],p1SparkIds:[103],p2SparkIds:[102]});
  parent.succession_chara_array!.push({position_id:11,card_id:100401,rank:0,rarity:null,talent_level:null,factor_id_array:[103]});
  const matches=(scope:ParentFactorFilter['scope'],minLevel:number,maxLevel:number)=>[
    parentSparkMatched(parent,{id:10,level:1},'own',[{factorId:10,scope,minLevel,maxLevel}]),
    parentSparkMatched(parent,{id:10,level:3},'p1',[{factorId:10,scope,minLevel,maxLevel}]),
    parentSparkMatched(parent,{id:10,level:2},'p2',[{factorId:10,scope,minLevel,maxLevel}])
  ];
  expect(matches('combined',6,6)).toEqual([true,true,true]);
  expect(matches('combined',7,9)).toEqual([false,false,false]);
  expect(matches('combined',1,5)).toEqual([false,false,false]);
  expect(matches('any',2,3)).toEqual([false,true,true]);
  expect(matches('own',1,3)).toEqual([true,false,false]);
  expect(matches('p1',1,3)).toEqual([false,true,false]);
  expect(matches('p2',1,3)).toEqual([false,false,true]);
  expect(matches('p1',1,2)).toEqual([false,false,false]);
  expect(parentSparkMatched(parent,{id:20,level:2},'own',[{factorId:10,scope:'combined',minLevel:6}])).toBe(false);
  expect(parentSparkMatched(parent,{id:10,level:1},'own',[])).toBe(false);
});
it('ranks manual fits like Angular: affinity IDs first, stable ties, twenty before outfit resolution, no occupied or release filtering',()=>{
  const chars=Array.from({length:22},(_,index)=>1001+index);
  const engine=new VeteranAffinityEngine({chars,aff2:Array(22**2).fill(2),aff3:Array(22**3).fill(3)});
  const characters=new Map(chars.slice(1).map(charaId=>[charaId*100+1,{id:String(charaId*100+1),name:`Uma ${charaId}`,image:'',isReleased_en:false}]));
  characters.set(100202,{id:'100202',name:'Released alternate',image:'',isReleased_en:true});
  const fits=manualBestFits([100201,null,null],1,100301,engine,characters);
  expect(fits).toHaveLength(19);
  expect(fits.map(fit=>fit.charaId)).toEqual(chars.slice(1,20));
  expect(fits[0]).toMatchObject({charaId:1002,totalAffinity:5,individualAffinity:3,character:{id:'100201'}});
  // Preserve Angular's gp2Left mapping for the manual fitter, not the normal lineage calculation.
  expect(manualBestFits([null,100201,100301],0,1004,engine,characters)[0]).toMatchObject({totalAffinity:5,individualAffinity:2});
  expect(manualBestFits([100201,100301,null],2,1004,engine,characters)[0]).toMatchObject({totalAffinity:5,individualAffinity:3});
  expect(manualBestFits([],0,undefined,engine,characters)).toEqual([]);
});
it('sorts manual Total by owned colored stars, not absent career stats or grandparent stars',()=>{
  const first=manualParent(entry);const second=manualParent({...entry,id:'second',ownSparkIds:[102],p1SparkIds:[],p2SparkIds:[]});
  expect(filterParents([first,second],{query:'',sort:'total',factors:[]},()=>'',()=>0)).toEqual([second,first]);
});
it('retains Angular tab-specific Total and Affinity ordering',()=>{
  const first=manualParent(entry), second=manualParent({...entry,id:'second',ownSparkIds:[103]});
  const sorted=(sort:'total'|'affinity')=>filterParents([first,second],{query:'',sort,factors:[]},()=>'',parent=>parent===second?100:1);
  for(const source of ['manual','bookmark'] as const){
    first.share_source=source;second.share_source=source;
    expect(sorted('affinity')).toEqual([first,second]);
  }
  for(const source of ['veteran','partner'] as const){
    first.share_source=source;second.share_source=source;
    first.speed=1200;second.speed=100;
    expect(sorted('total')).toEqual([first,second]);
    expect(sorted('affinity')).toEqual([second,first]);
    first.speed=null;second.speed=null;
    expect(sorted('total')).toEqual([first,second]);
  }
});
