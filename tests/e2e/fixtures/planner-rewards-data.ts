import type { CaratPlan, PlannerRewardResource } from '../../../src/lib/carat-planner/carat-planner';
import type { TimelineRecord } from '../../../src/pages/timeline/timeline-repository';

export const rewardEvents = [
  ['first', 'character_banner', 'First banner', '2026-09-01', '2026-09-09'],
  ['second', 'support_card_banner', 'Second banner', '2026-09-10', '2026-09-20'],
  ['champions-meeting-101', 'champions_meeting', 'Mile Champions Meeting', '2026-09-03', '2026-09-09'],
  ['legend-race-201', 'legend_race', 'Legend Race', '2026-09-07', '2026-09-14'],
  ['story-event-301', 'story_event', 'Autumn Story Event', '2026-09-02', '2026-09-12'],
  ['campaign-501', 'campaign', 'Celebration Login', '2026-08-28', '2026-09-06'],
  ['past', 'campaign', 'Previous celebration', '2026-08-01', '2026-08-10'],
].map(([id,type,title,start,end]) => ({ id:id!,type:type!,title:title!,global_release_date:start+'T00:00:00Z',jp_release_date:start+'T00:00:00Z',estimated_end_date:end+'T00:00:00Z',is_confirmed:true,planner_data_available:true,planner_reward_available:true,...(id==='first'?{image_path:'assets/images/character/banner/2021_30002.webp'}:{}) }));
export const normalizedRewardEvents = (): TimelineRecord[] => rewardEvents.map(event => ({ id:event.id,eventType:event.type,typeLabel:event.type,dateLabel:event.global_release_date,title:event.title,date:new Date(event.global_release_date),estimatedEndDate:new Date(event.estimated_end_date),gachaIds:[],pickupCardIds:[],relatedCharacters:[],relatedSupportCards:[],relatedSupportCardNames:[],tags:[],plannerRewardAvailable:true }));
export const plannerRewardsData: PlannerRewardResource = {
  rewards: [
    {id:'login',event_id:'campaign-501',label:'Celebration login Carats',currency:'free_jewels',amount:1500,available_at:'2026-09-01',available_until:'2026-09-06',default_enabled:true,provenance:'global_news',source_url:'https://umamusume.com/news/celebration',evidence:'10 days × 150 Carats = 1,500 Carats; claimed login rewards'},
    {id:'story',event_id:'story-event-301',label:'Autumn story missions',currency:'free_jewels',amount:600,available_at:'2026-09-12',default_enabled:true,provenance:'jp_master',source_items:[{item_category:90,item_id:43,amount:600},{item_category:40,item_id:111,amount:2},{item_category:2,item_id:999999,amount:5}]},
    {id:'old-gift',event_id:'past',label:'Previous gift',currency:'free_jewels',amount:300,available_at:'2026-08-05',default_enabled:true},
    {id:'unknown',label:'Unannounced reward',currency:'free_jewels',amount:null,available_at:'2026-09-15',default_enabled:true},
    {id:'no-date',label:'Reward without a date',currency:'free_jewels',amount:5,available_at:'',default_enabled:true},
  ],
  competitive_variants: [
    {id:'cm',event_id:'champions-meeting-101',competition:'champions_meeting',master_event_id:101,label:'Champions final',available_at:'2026-09-09',source_items:[{item_category:90,item_id:43,amount:1200}],provenance:'jp_master'},
    {id:'legend-one',event_id:'legend-race-201',competition:'legend_race',master_event_id:201,label:'Opponent 1',available_at:'2026-09-14',source_items:[{item_category:90,item_id:43,amount:100}]},
    {id:'legend-two',event_id:'legend-race-201',competition:'legend_race',master_event_id:201,label:'Opponent 2',available_at:'2026-09-14',source_items:[{item_category:90,item_id:43,amount:200}]},
    {id:'legend-mission',event_id:'legend-race-201',competition:'legend_race',master_event_id:201,label:'Event missions',available_at:'2026-09-14',source_items:[{item_category:40,item_id:41,amount:1}]},
  ],
  event_benefits: [
    {id:'managed-pulls',event_id:'first',campaign_id:'anniversary',kind:'free_pulls',label:'Campaign free pulls',amount:100,available_at:'2026-09-01',planner_effect:'free_pulls'},
    {id:'independent-pulls',event_id:'second',kind:'free_pulls',label:'Published support pulls',amount:10,available_at:'2026-09-10',planner_effect:'free_pulls',provenance:'global_news',source_url:'https://umamusume.com/news/support'},
    {id:'selector',event_id:'second',kind:'support_selector',label:'Support selector',amount:1,available_at:'2026-09-10',planner_effect:'linked_inventory_benefit'},
  ],
  free_pull_campaigns: [
    {id:'anniversary',label:'Anniversary free pulls',total_pulls:100,pulls_per_day:10,stockable:true,default_allocations:[{event_id:'first',pulls:40},{event_id:'second',pulls:60}],source_url:'https://umamusume.com/news/pulls'},
    {id:'unavailable',label:'Unresolved campaign',total_pulls:10,default_allocations:[{event_id:'missing',pulls:10}]},
  ]
};
export function plannerRewardsPlan(): CaratPlan {
  return {
    id:'planner-rewards',name:'Rewards plan',createdAt:'2026-08-29T12:00:00Z',updatedAt:'2026-08-29T12:00:00Z',projectionStartDate:'2026-09-01',
    balances:{freeJewels:15000,paidJewels:0,umaTickets:0,supportTickets:0,rainbowCrystals:0,goldCrystals:0,rainbowFullCrystals:0,goldFullCrystals:0},
    enabledIncomeRuleIds:[],enabledRewardIds:[],disabledRewardIds:[],enabledRewardEventIds:[],disabledEventIds:[],
    scenarioSelections:{champions_meeting_result:'none',legend_race_clears:'all'},variableRewardSelections:{},freePullCampaignSelections:{},resourceDefaultsApplied:true,customIncome:[],targets:[]
  };
}
