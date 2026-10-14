import type { Page } from '@playwright/test';
import { mockDatabase, mockAffinity, mockStatistics, record } from '../e2e/fixtures/api';
import { mockTimelineDetails, detailTimeline, detailGachas } from '../e2e/fixtures/timeline-details';
import { plannerGoalsPlan } from '../e2e/fixtures/planner-goals';
import factors from '../fixtures/resources/factors.json' with { type: 'json' };
import { resourceFixtures } from '../fixtures/resource-data';

export async function stressCatalogs(page: Page) {
  const characters = [...resourceFixtures.character as object[], ...Array.from({ length: 250 }, (_, i) => ({ id: String(200001 + i * 100), name: `Stress Uma ${i}`, rarity: 3, isReleased_en: true, image: 'chara_stand_100101.png' }))];
  const supports = [...resourceFixtures['support-cards-db'] as object[], ...Array.from({ length: 500 }, (_, i) => ({ id: String(40000 + i), name: `Stress Support ${i}`, rarity: 3, type: 'speed', isReleased_en: true }))];
  const skills = [...resourceFixtures.skills as object[], ...Array.from({ length: 2000 }, (_, i) => ({ skill_id: 700000 + i, name: `Stress Skill ${i}`, rarity: 1, icon: 'utx_ico_skill_10011.png' }))];
  const expandedFactors = [...factors, ...Array.from({ length: 1200 }, (_, i) => ({ id: String(900000 + i), text: `Stress Factor ${i}`, type: 3 }))];
  for (const [name, json] of Object.entries({ character: characters, character_names: resourceFixtures.character_names, 'support-cards-db': supports, skills, factors: expandedFactors })) await page.route(`**/resources/*/${name}.json*`, route => route.fulfill({ json }));
}

export async function stressData(page: Page) {
  await mockDatabase(page);
  await mockAffinity(page);
  await mockStatistics(page);
  await mockTimelineDetails(page);
  const whites = factors.filter(f => [2, 3, 4].includes(f.type)).slice(0, 60);
  const records = Array.from({ length: 1200 }, (_, i) => {
    const item = record(String(123456789012 + i));
    item.trainer_name = `Stress trainer ${i + 1}`;
    item.inheritance.inheritance_id = i + 1;
    item.inheritance.main_win_saddles = [16, 20];
    item.inheritance.main_white_factors = whites.slice(0, 40).map((f, n) => Number(f.id) * 10 + (n + i) % 3 + 1);
    item.inheritance.left_white_factors = whites.slice(20, 50).map(f => Number(f.id) * 10 + 2);
    item.inheritance.right_white_factors = whites.slice(30).map(f => Number(f.id) * 10 + 3);
    item.inheritance.white_sparks = whites.map(f => Number(f.id) * 10 + 3);
    item.inheritance.white_count = whites.length;
    return item;
  });
  await page.route('**/search/query?*', route => {
    const query = new URL(route.request().url()).searchParams;
    const current = Number(query.get('page')) || 0, limit = Number(query.get('limit')) || 12;
    return route.fulfill({ json: { items: records.slice(current * limit, (current + 1) * limit), total: records.length, page: current, limit, total_pages: Math.ceil(records.length / limit) } });
  });
  const events = Array.from({ length: 4000 }, (_, i) => ({
    ...detailTimeline.events[i % detailTimeline.events.length]!, id: `stress-${i}`, gacha_id: 10000 + i,
    title: `Release ${i}`, global_release_date: new Date(Date.UTC(2026, 7, 1 + Math.floor(i / 5))).toISOString(),
    estimated_end_date: new Date(Date.UTC(2026, 7, 11 + Math.floor(i / 5))).toISOString()
  }));
  const plan = plannerGoalsPlan();
  plan.targets = Array.from({ length: 30 }, (_, i) => ({ ...plan.targets[0]!, id: `target-${i}`, eventId: `stress-${i * 5 + 1}`, gachaId: 10001 + i * 5, title: `Support plan ${i}`, bannerStart: events[i * 5 + 1]!.global_release_date.slice(0, 10), bannerEnd: events[i * 5 + 1]!.estimated_end_date.slice(0, 10) }));
  plan.projectionStartDate = '2026-08-01';
  await page.addInitScript(plan => { try { localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })); } catch {} }, plan);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.route('**/resources/test/planner_core.json*', route => route.fulfill({ json: { jewel_cost_per_pull: 150, gacha_shard_by_event: Object.fromEntries(events.map(e => [e.id, '2026'])) } }));
  await page.route('**/resources/test/planner_gacha_2026.json*', route => route.fulfill({ json: { gachas: plan.targets.map(t => ({ ...detailGachas.gachas[1], event_id: t.eventId, gacha_id: t.gachaId, start_date: t.bannerStart, end_date: t.bannerEnd, pickups: [{ pickup_id: 30028, rate: .0075 }, { pickup_id: 30001, rate: .0075 }] })) } }));
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: { rewards: events.map(e => ({ id: `reward-${e.id}`, event_id: e.id, currency: 'free_jewels', amount: 150, available_at: e.global_release_date.slice(0, 10), label: e.title, default_enabled: true })) } }));
  const metric = (start: number, count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [String(start + i), { count: 3000 - i, total: 3000 - i }]));
  const scope = { total_entries: 1000000, uma_distribution: metric(100101, 200), support_cards: metric(10001, 500), skills: metric(200132, 2000), stat_averages: Object.fromEntries(['speed', 'stamina', 'power', 'guts', 'wiz'].map((s, i) => [s, { mean: 1000 - i * 100, count: 1000000, histogram: { '600-900': 500000, '900-1200': 500000 } }])) };
  const by_distance = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i + 1), { by_team_class: Object.fromEntries([3, 4, 5, 6].map(c => [String(c), { overall: scope, by_scenario: { '1': scope, '2': scope, '5': scope } }])) }]));
  await page.route('**/assets/statistics/datasets.json', route => route.fulfill({ json: { datasets: [{ id: 'fixture', name: 'Stress data', basePath: '/assets/statistics/fixture', format_version: 4, index: { distances: Object.keys(by_distance), character_ids: ['100101'], total_entries: 24000000 } }] } }));
  await page.route('**/assets/statistics/fixture/global/global.json*', route => route.fulfill({ json: { metadata: { total_entries: 24000000 }, by_distance, scenario_distribution: { '1': { count: 8000000 }, '2': { count: 8000000 }, '5': { count: 8000000 } } } }));
}
