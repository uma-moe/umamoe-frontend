import { describe, expect, it } from 'vitest';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { buildPlannerRewardGroups } from './planner-reward-groups';
import { cycleRewardOption, plannerRewardSummary, rewardGroupActive, updateRewardGroup } from './planner-reward-groups';
import { buildPlannerCampaigns, campaignState, selectPlannerCampaign } from '../planner-campaigns';
import { projectPlan } from '../carat-planner';
import { normalizedRewardEvents, plannerRewardsData, plannerRewardsPlan } from '../../../../tests/e2e/fixtures/planner-rewards-data';

describe('Angular planner reward groups', () => {
  it('recognizes resource timestamps and offsets, excludes expired rewards, and retains only usable rows in mixed groups', () => {
    const plan = plannerRewardsPlan(); plan.projectionStartDate = '2026-09-01';
    const reward = (id: string, available_at: string, event_id?: string) => ({ id, label: id, currency: 'free_jewels' as const, amount: 100, default_enabled: true, available_at, event_id });
    const groups = buildPlannerRewardGroups([
      reward('past', '2026-08-31T23:59:59+00:00'),
      reward('offset', '2026-09-01T00:30:00+09:00'),
      reward('old-part', '2026-08-31T23:59:59Z', 'mixed'),
      reward('new-part', '2026-09-02T03:00:00Z', 'mixed'),
      reward('unknown', 'unavailable'),
    ], [], [], [], [], plan.projectionStartDate, '2026-09-01', plan);
    expect(groups.filter(group => group.isPast).flatMap(group => group.rewards.map(row => row.id)).sort()).toEqual(['offset', 'past']);
    expect(groups.find(group => group.eventId === 'mixed')!.rewards.map(row => row.id)).toEqual(['new-part']);
    expect(plannerRewardSummary(plan, groups, [])).toEqual({ count: 2, totalLabel: '200 Carats' });
  });

  it('counts active groups and ready campaigns rather than saved overrides, and totals only Carats and tickets', () => {
    const plan=plannerRewardsPlan(),data=plannerRewardsData,events=normalizedRewardEvents();
    const campaigns=buildPlannerCampaigns(data.free_pull_campaigns!,events,plan.projectionStartDate,'2026-08-29');
    const summary=()=>plannerRewardSummary(plan,buildPlannerRewardGroups(data.rewards,data.event_benefits!,data.competitive_variants!,data.free_pull_campaigns!,events,plan.projectionStartDate,'2026-08-29',plan),campaigns);
    expect(plan.enabledRewardIds).toEqual([]);expect(summary()).toEqual({count:5,totalLabel:'2,405 Carats · 3 tickets'});
    selectPlannerCampaign(plan,campaigns[0]!,false,data);expect(summary()).toEqual({count:7,totalLabel:'2,405 Carats · 3 tickets'});
    plan.disabledEventIds.push('story-event-301');expect(summary()).toEqual({count:6,totalLabel:'1,805 Carats · 1 ticket'});
    plan.freePullCampaignSelections.anniversary='__excluded__';expect(summary().count).toBe(5);
  });
  it('keeps event-end result selections, source totals and per-event exclusion without rewriting assumptions', () => {
    const plan = plannerRewardsPlan(), data = plannerRewardsData, events = normalizedRewardEvents();
    const groups = () => buildPlannerRewardGroups(data.rewards, data.event_benefits!, data.competitive_variants!, data.free_pull_campaigns!, events, plan.projectionStartDate, '2026-08-29', plan);
    const cm = () => groups().find(group => group.eventId === 'champions-meeting-101')!;
    cycleRewardOption(plan, cm(), 1);
    expect(plan.variableRewardSelections['champions-meeting-101']).toMatchObject({ optionId:'assumption:champions_meeting_result:champion',availableAt:'2026-09-09',amounts:{free_jewels:2500,uma_ticket:5,support_ticket:5} });
    expect(rewardGroupActive(plan,cm())).toBe(true);
    cycleRewardOption(plan,cm(),-1);cycleRewardOption(plan,cm(),-1);
    expect(cm().selectedOption.id).toBe('__not_counted__');expect(rewardGroupActive(plan,cm())).toBe(false);
    expect(plan.scenarioSelections).toEqual(plannerRewardsPlan().scenarioSelections);
    const legend=groups().find(group=>group.eventId==='legend-race-201')!;
    expect(legend.variableOptions.map(option=>option.amounts)).toEqual([{free_jewels:100},{free_jewels:300},{free_jewels:300,uma_ticket:1}]);
    const story=groups().find(group=>group.eventId==='story-event-301')!;
    expect(story.benefits.map(benefit=>benefit.text)).toEqual(['2 Support tickets','600 Carats','Additional item rewards']);
    updateRewardGroup(plan,story,false);expect(plan.disabledEventIds).toContain('story-event-301');
    updateRewardGroup(plan,story,true);expect(plan.disabledEventIds).not.toContain('story-event-301');
  });

  it('uses one campaign allocation and preserves configured targets when switching or excluding it', () => {
    const plan=plannerRewardsPlan(),data=plannerRewardsData,events=normalizedRewardEvents();
    const campaign=buildPlannerCampaigns(data.free_pull_campaigns!,events,plan.projectionStartDate,'2026-08-29')[0]!;
    selectPlannerCampaign(plan,campaign,false,data);
    const projections=()=>projectPlan(plan,{core:{},income:{rules:[]},rewards:data,timelineEvents:events}).targets.map(target=>target.freePullsUsed);
    expect(projections()).toEqual([40,60]);expect(campaignState(plan,campaign).ready).toBe(true);
    plan.targets[0]!.plannedPulls=123;const ids=plan.targets.map(target=>target.id);
    selectPlannerCampaign(plan,campaign,true,data);expect(projections()).toEqual([0,100]);
    selectPlannerCampaign(plan,campaign,true,data);expect(projections()).toEqual([0,0]);
    expect(plan.targets.map(target=>target.id)).toEqual(ids);expect(plan.targets[0]!.plannedPulls).toBe(123);
    selectPlannerCampaign(plan,campaign,false,data);expect(projections()).toEqual([40,60]);
    const unavailable=buildPlannerCampaigns(data.free_pull_campaigns!,events,plan.projectionStartDate,'2026-08-29')[1]!;
    const unchanged=JSON.stringify(plan);selectPlannerCampaign(plan,unavailable,false,data);expect(JSON.stringify(plan)).toBe(unchanged);
  });
  it('groups event rewards and benefits with timeline identity and claim window', () => {
    const event = { id: 'anniversary', title: '1.5th Anniversary', date: new Date('2030-08-01T00:00:00Z'), estimatedEndDate: new Date('2030-08-10T00:00:00Z'), image: '/anniversary.webp', gachaIds: [] } as unknown as TimelineRecord;
    const groups = buildPlannerRewardGroups(
      [
        { id: 'jewels', label: 'Anniversary Carats', event_id: 'anniversary', currency: 'free_jewels', amount: 1500, available_at: '2030-08-10' },
        { id: 'ticket', label: 'Support ticket', event_id: 'anniversary', currency: 'support_ticket', amount: 2, available_at: '2030-08-10' },
      ],
      [{ id: 'selector', event_id: 'anniversary', kind: 'trainee_selector', label: '3-star trainee selector', amount: 1, available_at: '2030-08-01', planner_effect: 'informational' }],
      [], [], [event], '2030-08-05', '2030-08-05',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ title: '1.5th Anniversary', availableAt: '2030-08-01', availableUntil: '2030-08-10', isPast: false, imagePath: '/anniversary.webp' });
    expect(groups[0]?.benefits.map((benefit) => benefit.text)).toEqual(['2 Support tickets', '1,500 Carats']);
  });

  it('separates past rewards and provides a readable generic campaign title', () => {
    const groups = buildPlannerRewardGroups([
      { id: 'campaign-carats', event_id: 'campaign-999', label: 'Limited-time mission rewards', currency: 'free_jewels', amount: 150, available_at: '2029-12-31' },
      { id: 'campaign-items', event_id: 'campaign-999', label: 'Limited-time mission rewards item details', currency: 'free_jewels', amount: null, available_at: '2029-12-31' },
    ], [], [], [], [], '2030-01-01', '2030-01-01');
    expect(groups[0]).toMatchObject({ title: 'Campaign rewards', isPast: true });
  });
});
