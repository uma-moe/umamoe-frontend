import tierlist from '../../fixtures/resources/tierlist.json' with { type: 'json' };
import { resourceFixtures } from '../../fixtures/resource-data';
import type { Page, BrowserContext } from '@playwright/test';

// Keep third-party ads/CMP out of deterministic workflow tests, including popups.
// The production loader and reserved ad geometry still run against this API stub.
export async function mockAdvertising(target: Page | BrowserContext): Promise<void> {
  // Browser regression failures must never reach the real monitoring project.
  await target.route('https://*.ingest.*.sentry.io/**', route => route.fulfill({ json: {} }));
  await target.route('https://www.googletagmanager.com/gtag/js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await target.route('https://cdn.fuseplatform.net/**/fuse.js', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.fusetag = { que: [], registerZone() {}, pageInit() {} };' }));
}

export const homeStats = { today: { tasks_24h: 4521 }, freshness: { accounts_24h: 8123, accounts_7d: 34567, umas_tracked: 2456789 } };

export function record(accountId = '123456789012', stale = false) {
  return {
    account_id: accountId,
    trainer_name: stale ? 'Modified Trainer' : 'Parity Trainer',
    follower_num: 734,
    borrow_view_count: 42,
    borrow_copy_count: 7,
    last_updated: '2026-08-28T12:00:00Z',
    is_stale: stale,
    inheritance: {
      inheritance_id: stale ? 2 : 1,
      main_parent_id: 101301,
      parent_left_id: 100601,
      parent_right_id: 106701,
      parent_rank: 29412,
      parent_rarity: 5,
      scenario_id: 5,
      blue_sparks: [105, 203],
      pink_sparks: [1205, 1102],
      green_sparks: [10010105, 10010202],
      white_sparks: [2000102, 3000102, 1000102],
      main_blue_factors: 103,
      main_pink_factors: 1203,
      main_green_factors: 10010103,
      main_white_factors: [2000102],
      left_blue_factors: 102,
      left_pink_factors: 1202,
      left_green_factors: 10010102,
      left_white_factors: [3000102],
      right_blue_factors: 203,
      right_pink_factors: 1102,
      right_green_factors: 10010202,
      right_white_factors: [1000102],
      main_win_saddles: [100, 101], left_win_saddles: [100], right_win_saddles: [101], race_results: [100, 101, 200],
      win_count: 8, white_count: 14, affinity_score: 83
    },
    support_card: { support_card_id: 30189, limit_break_count: 4, experience: 45000 }
  };
}

export async function mockDatabase(page: Page): Promise<void> {
  await mockSupportCatalog(page);
  await page.route('**/search/query?*', (route) => route.fulfill({ json: { items: [record()], total: 25, page: 0, limit: 12, total_pages: 3 } }));
  await page.route('**/api/borrow/views', (route) => route.fulfill({ json: { success: true, accepted_count: 1 } }));
  await page.route('**/api/borrow/*/copy', (route) => route.fulfill({ json: { success: true, accepted: true, trainer_id: '123456789012', copy_count: 8 } }));
}

export const supportCards = [
  { id:'30028', name:'Kitasan Black', card_title:'Fire at My Heels', rarity:3, type:'speed', release_date:'2026-08-01', isReleased_en:true },
  { id:'10028', name:'Kitasan Black', rarity:1, type:'speed', release_date:'2025-01-01', isReleased_en:true },
  { id:'30189', name:'Fine Motion', card_full_name:'[Wave of Gratitude] Fine Motion', rarity:3, type:'wisdom', release_date:'2026-07-01', isReleased_en:true },
  { id:'30003', name:'Tokai Teio', cardTitle:'Dreams Do Come True', rarity:3, type:'speed', release_date:'2026-07-01', isReleased_en:true },
  { id:'20001', name:'Daiwa Scarlet', rarity:2, type:'intelligence', release_date:'2025-01-01', isReleased_en:true },
  { id:'30291', name:'Unreleased Support', rarity:3, type:'group', release_date:'2026-09-01', isReleased_en:false }
];

export async function mockSupportCatalog(page: Page): Promise<void> {
  await page.route('**/resources/*/support-cards-db.json*', route => route.fulfill({json:supportCards}));
}

export async function mockAffinity(page: Page): Promise<void> {
  await mockCharacterCatalog(page);
  await page.route('**/resources/manifest.json*', (route) => route.fulfill({ json: { version: 'test', files: { affinity: '/resources/test/affinity.json', character:'/resources/test/character.json', character_names:'/resources/test/character_names.json', factors:'/resources/test/factors.json.gz' } } }));
  await page.route('**/resources/test/affinity.json', (route) => route.fulfill({ json: { chars: [1013, 1006, 1067], aff2: Array(9).fill(2), aff3: Array(27).fill(3) } }));
}

// Catalog fixtures: released outfit variants, an unreleased character,
// and names that must be resolved from the names resource rather than raw data.
export async function mockCharacterCatalog(page: Page): Promise<void> {
  const characters = [
    ['100101','Special Week'], ['100102','Special Week'], ['101301','Mejiro McQueen'], ['101302','Mejiro McQueen'],
    ['100601','Oguri Cap'], ['100701','Gold Ship'], ['101101','Grass Wonder'], ['106701','Satono Diamond'], ['108801','Satono Crown']
  ].map(([id,name]) => ({ id, name:`Raw ${name}`, rarity:3, release_date:'2025-01-01', image:`chara_stand_${id}.png`, isReleased_en:true }));
  const names = Object.fromEntries(characters.map(character => [String(Math.floor(Number(character.id)/100)), {name:character.name.slice(4),skins:String(character.id).startsWith('1001') ? {'01':'Original','02':'Summer'} : {}}]));
  await page.route('**/resources/*/character.json*', route => route.fulfill({json:[...characters,{id:'113301',name:'Chrono Genesis',isReleased_en:false}]}));
  await page.route('**/resources/*/character_names.json*', route => route.fulfill({json:names}));
}

const clubs = [
  { circle_id: 7, name: 'Team Sirius', comment: 'Daily players welcome', leader_viewer_id: 7001, leader_name: 'McQueen', member_count: 29, join_style: 1, policy: 3, monthly_rank: 1, yesterday_rank: 2, monthly_point: 1_000_000, yesterday_points: 900_000, live_points: 1_100_000, club_rank: 1 },
  { circle_id: 8, name: 'Closed Track', comment: 'Top racers', leader_viewer_id: 8001, leader_name: 'Oguri', member_count: 30, join_style: 3, policy: 2, monthly_rank: 2, yesterday_rank: 1, monthly_point: 800_000, yesterday_points: 760_000, live_points: 820_000, club_rank: 2 }
];

export async function mockCommunity(page: Page): Promise<void> {
  await page.route('**/api/v4/circles/list?*', (route) => route.fulfill({ json: { circles: clubs, total: 120, page: Number(new URL(route.request().url()).searchParams.get('page') ?? 0), limit: Number(new URL(route.request().url()).searchParams.get('limit') ?? 100), total_pages: 6 } }));
  await page.route('**/api/v4/rankings/*?*', (route) => {
    const url = new URL(route.request().url()); const tab = url.pathname.split('/').at(-1);
    const common = { viewer_id: 9001, trainer_name: 'Parity Trainer', circle_id: 7, circle_name: 'Team Sirius', rank: 4, total_fans: 4_200_000, monthly_gain: 640_000, active_days: 18, avg_daily: 35_555, total_gain: 2_100_000, avg_day: 28_000, avg_week: 196_000, avg_month: 840_000, gain_3d: 90_000, gain_7d: 260_000, gain_30d: 1_100_000, rank_3d: 8, rank_7d: 6, rank_30d: 4, rank_total_fans: 9, rank_total_gain: 7, rank_avg_day: 6, rank_avg_week: 5, rank_avg_month: 4 };
    route.fulfill({ json: { rankings: [{ ...common, rank: tab === 'monthly' ? 4 : undefined }], total: 121, page: Number(url.searchParams.get('page') ?? 0), limit: Number(url.searchParams.get('limit') ?? 100), total_pages: 7 } });
  });
  await page.route('**/api/v4/circles?*', (route) => {
    const url = new URL(route.request().url()); const year = Number(url.searchParams.get('year')); const month = Number(url.searchParams.get('month'));
    route.fulfill({ json: { circle: { ...clubs[0], created_at: '2025-01-01T00:00:00Z', last_updated: '2026-08-28T12:00:00Z', last_month_rank: 3, last_month_point: 700_000 }, club_rank: 1, fans_to_next_tier: 250_000, fans_to_lower_tier: 500_000, members: [
      { viewer_id: 7001, trainer_name: 'McQueen', membership: 3, year, month, daily_fans: [100_000, 140_000, 190_000], last_updated: '2026-08-28T12:00:00Z' },
      { viewer_id: 7002, trainer_name: 'Gold Ship', membership: 1, year, month, daily_fans: [80_000, 120_000, 165_000], last_updated: '2026-08-28T12:00:00Z' }
    ] } });
  });
}

const metric = (id: string, value: number) => ({ [id]: { id, total: value, count: value } });
const stat = (mean: number) => ({ count: 10, mean, histogram: { '0-60': 1, '60-120': 4, '120-180': 5 } });
const scope = {
  total_entries: 10,
  total_trained_umas: 10,
  uma_distribution: metric('100101', 10),
  stat_averages: { speed: stat(1200), stamina: stat(900), power: stat(1000), guts: stat(700), wiz: stat(850) },
  support_cards: metric('10001', 10),
  support_card_combinations: { mixed: { count: 10, composition: { speed: 2, stamina: 1, power: 1, wisdom: 2 } } },
  support_card_type_distribution: metric('speed', 10),
  skills: metric('200132', 10)
};
const globalStats = {
  metadata: { generated_at: '2026-01-01T00:00:00Z', total_entries: 10, total_trainers: 2 },
  scenario_distribution: { '1': { count: 10, percentage: 100 } },
  team_class_distribution: { '6': { count: 2, percentage: 100, trained_umas: 10 } },
  by_distance: { '1': { by_team_class: { '6': { overall: scope, by_scenario: { '1': scope } } } } }
};
const characterStats = {
  metadata: { total_entries: 10 },
  global: { distance_distribution: { '1': { count: 10 } }, team_class_distribution: { '6': { count: 10 } } },
  overall: scope,
  by_distance: { '1': { by_team_class: { '6': { overall: scope, by_scenario: { '1': scope } } } } }
};

export async function mockStatistics(page: Page, formatVersion = 4) {
  await mockCharacterCatalog(page);
  await page.route('**/resources/*/support-cards-db.json*', route => route.fulfill({ json: [...supportCards, { id: '10001', name: 'Special Week', rarity: 1, type: 'guts', isReleased_en: true }] }));
  await page.route('**/resources/*/skills.json*', route => route.fulfill({ json: [...(resourceFixtures.skills as object[]), { skill_id: 200132, name: 'Standard Distance ○', rarity: 1, icon: 'utx_ico_skill_10011.webp' }] }));
  await page.route('**/assets/statistics/datasets.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ datasets: [{ id: 'fixture', name: 'Parity fixture', basePath: '/assets/statistics/fixture', format_version: formatVersion, index: { distances: ['1'], character_ids: ['100101'], total_entries: 10 } }] }) }));
  await page.route('**/assets/statistics/fixture/global/global.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(formatVersion >= 4 ? globalStats : { ...globalStats, by_distance: undefined }) }));
  await page.route('**/assets/statistics/fixture/distance/1.json', (route) => route.fulfill({ json: globalStats.by_distance['1'] }));
  await page.route('**/assets/statistics/fixture/characters/100101.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(characterStats) }));
}

export const accountId = '123456789012';
export const profile = {
  trainer: { account_id: accountId, name: 'Parity Trainer', follower_num: 412, own_follow_num: 81, best_team_class: 7, team_class: 6, team_evaluation_point: 126_400, leader_chara_dress_id: 101101, rank_score: 29_412, comment: 'Profile parity fixture' },
  circle: { circle_id: 7, name: 'Team Sirius', member_count: 29, monthly_rank: 12, monthly_point: 1_240_000, last_month_rank: 18, last_month_point: 980_000, live_points: 1_310_000, live_rank: 9 },
  circle_history: [
    { year: 2026, month: 8, circle_id: 7, circle_name: 'Team Sirius', circle_rank: 12, circle_points: 1_240_000 },
    { year: 2026, month: 7, circle_id: 7, circle_name: 'Team Sirius', circle_rank: 18, circle_points: 980_000 },
    { year: 2026, month: 6, circle_id: 8, circle_name: 'Old Track', circle_rank: 41, circle_points: 620_000 }
  ],
  fan_history: {
    monthly: [{ year: 2026, month: 8, total_fans: 42_000_000, monthly_gain: 4_200_000, active_days: 27, avg_daily: 155_555, rank: 121, circle_id: 7, circle_name: 'Team Sirius' }],
    rolling: { gain_3d: 440_000, gain_7d: 1_140_000, gain_30d: 4_200_000, rank_3d: 99, rank_7d: 108, rank_30d: 121 },
    alltime: { total_fans: 42_000_000, total_gain: 31_000_000, active_days: 310, avg_day: 100_000, avg_week: 700_000, avg_month: 3_000_000, rank_total_fans: 121, rank_total_gain: 119, rank_avg_day: 130, rank_avg_week: 128, rank_avg_month: 124 }
  },
  inheritance: {
    inheritance_id: 501, account_id: accountId, main_parent_id: 101101, parent_left_id: 106701, parent_right_id: 108801, parent_rank: 29_412, parent_rarity: 5,
    affinity_score: 83, blue_sparks: [103], pink_sparks: [1203], green_sparks: [10013], white_sparks: [200012],
    main_blue_factors: 103, main_pink_factors: 1203, main_green_factors: 10013, main_white_factors: [200012],
    left_blue_factors: 102, left_pink_factors: 1202, left_green_factors: 10012, left_white_factors: [200012],
    right_blue_factors: 103, right_pink_factors: 1203, right_green_factors: 10013, right_white_factors: [200012],
    blue_stars_sum: 3, pink_stars_sum: 3, green_stars_sum: 3, white_stars_sum: 2, win_count: 8, white_count: 11,
    main_win_saddles: [1001, 2001], left_win_saddles: [1001], right_win_saddles: [2001], race_results: [1001, 2001]
  },
  support_card: { support_card_id: 30291, limit_break_count: 3, experience: 45_000 },
  borrow_stats: { view_count: 76, copy_count: 19 },
  team_stadium: [{ id: 1, distance_type: 4, card_id: 101101, running_style: 2, speed: 1542, stamina: 1312, power: 1184, guts: 702, wiz: 1138, rank_score: 29_412, skills: [200011], scenario_id: 5, rarity: 5, talent_level: 5, proper_ground_turf: 7, proper_ground_dirt: 1, proper_distance_short: 2, proper_distance_mile: 4, proper_distance_middle: 6, proper_distance_long: 7, proper_running_style_nige: 2, proper_running_style_senko: 7, proper_running_style_sashi: 4, proper_running_style_oikomi: 1 }],
  veterans: []
};

export const fullTeamStadium = [101101, 101301, 100601, 106701, 108801, 100701, 100101, 100201, 100301, 100401, 100501, 100801, 100901, 101001, 101201].map((card_id, index) => ({
  ...profile.team_stadium[0]!, id: index + 1, card_id, distance_type: Math.floor(index / 3) + 1,
  running_style: index % 3 + 1, speed: 1542 - index * 24, stamina: 1312 + index * 8
}));

export async function mockOwnerProfile(page: Page, visibilityBodies: unknown[]): Promise<void> {
  await page.route('**/api/v4/circles?*', route => {
    const query = new URL(route.request().url()).searchParams, year = Number(query.get('year')), month = Number(query.get('month'));
    const days = new Date(year, month, 0).getDate();
    return route.fulfill({json:{circle:{circle_id:7}, members:[{viewer_id:Number(accountId), trainer_name:'Parity Trainer', year, month, daily_fans:Array.from({length:days + 1}, (_, day) => 37_800_000 + Math.round(4_200_000 * day / days)), last_updated:'2026-09-01T00:00:00Z'}]}});
  });
  await page.route('**/api/borrow/views', route => route.fulfill({ json: { success: true, accepted_count: 1 } }));
  await page.route('**/api/borrow/*/copy', route => route.fulfill({ json: { success: true, accepted: true, copy_count: 20 } }));
  await page.addInitScript(() => localStorage.setItem('auth_token', 'profile-parity-token'));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 'owner', display_name: 'Owner', created_at: '2025-01-01T00:00:00Z' } }));
  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [{ id: 1, account_id: accountId, verification_status: 'verified', verified_at: '2025-01-01T00:00:00Z', trainer_name: 'Parity Trainer' }] }));
  await page.route(`**/api/v4/user/profile/${accountId}`, (route) => route.fulfill({ json: profile }));
  await page.route(`**/api/v4/user/profile/${accountId}/visibility`, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON(); visibilityBodies.push(body); await route.fulfill({ json: body }); return;
    }
    await route.fulfill({ json: { profile_hidden: false, hidden_sections: [] } });
  });
  await page.route(`**/api/tasks/report-unavailable/${accountId}`, (route) => route.fulfill({ json: { ok: true } }));
}

const score = {
  viewer_id: 42, trainer_name: 'Mejiro Analyst', circle_id: 7, circle_name: 'Spica', circle_monthly_rank: 12,
  first_seen: '2026-06-01T00:00:00Z', last_seen: '2026-08-28T18:00:00Z', days_observed: 60, days_active: 54,
  total_active_seconds: 388800, total_fan_gain: 126000000, total_careers: 462, avg_careers_per_day: 7.7, careers_per_active_hour: 4.3,
  career_rate_breakdown: { last_20: { careers_per_hour: 5.8, sample_count: 20, sample_seconds: 12400 }, last_3d: { careers_per_hour: 5.2, sample_count: 31, sample_seconds: 22000 }, last_7d: { careers_per_hour: 4.9, sample_count: 62, sample_seconds: 46000 }, last_30d: { careers_per_hour: 4.4, sample_count: 210, sample_seconds: 170000 } },
  avg_career_length_last20_seconds: 750, career_length_buckets: [2, 5, 8, 12, 20, 28, 38, 51, 47, 42, 36, 31, 28, 24, 20, 18, 16, 14, 12],
  short_high_fan_careers: 9, short_fan_gain_score: 29.4, short_fan_gain_score_buckets: [6, 11, 12.4], short_career_avg_fan_gain: 720000,
  short_career_p50_fan_gain: 700000, short_career_p90_fan_gain: 910000, short_career_p95_fan_gain: 980000, short_career_max_fan_gain: 1050000,
  recent_fan_gain_3d: 8300000, baseline_fan_gain_14d: 24100000, recent_fans_per_day: 2766667, baseline_fans_per_day: 1721428,
  fan_gain_spike_ratio: 1.61, behavior_change_score: 18.5, fans_per_active_minute: 68500, peak_fans_per_minute: 128000,
  high_fan_rate_windows: 11, high_fan_rate_total_fan_gain: 12100000, high_fan_rate_total_seconds: 6800, max_daily_active_seconds: 43200, max_daily_careers: 31,
  max_session_seconds: 39600, max_online_streak_seconds: 46800, days_over_16h: 2, days_over_20h: 0, reset_recovery_windows: 4, reset_breaks: 2,
  max_reset_recovery_seconds: 5200, reset_break_score: 7.3, probe_score: 24.8, distinct_weekly_hour_buckets: 92,
  flag_no_sleep: false, flag_extreme_session: true, flag_inhuman_career_rate: true, flag_247: false, flag_marathon: true, suspicion_score: 84, is_suspicious: true,
  probe_metrics: { career_fan_gain_samples: 200, career_fan_gain_mode_share: .42, career_fan_gain_cv: .18, career_fan_gain_score: 8.2, career_rhythm_samples: 180, career_rhythm_cv: .21, career_length_cv: .19, career_regularity_score: 7.8, login_gap_samples: 140, login_gap_cv: .34, login_gap_mode_share: .26, login_regularity_score: 5.4, post_login_latency_samples: 98, post_login_latency_median_seconds: 480, post_login_latency_cv: .32, post_login_latency_score: 4.1, max_zero_idle_fan_gain_streak: 13, max_zero_idle_active_seconds: 14400, zero_idle_score: 8.5, weekday_weekend_similarity: .91, hourly_entropy: .77, night_active_ratio: .28, night_active_seconds: 82000, schedule_shape_score: 6.2, max_careers_30m: 5, burst_career_windows: 12, burst_career_score: 5.9, service_gap_resume_events: 3, service_gap_resume_score: 2.2, distinct_circles_seen: 2, circle_churn_score: 1.4, coactivity_cluster_size: 4, coactivity_cluster_score: 3.1 },
  evidence: { verdict: 'very_high_suspicion', summary: 'Several high-rate short career windows were reconstructed.', strongest_signal: 'short_high_fan_careers', caveats: ['Snapshots can include idle gaps and missed changes.'], reasons: [
    { key: 'short_high_fan_careers', label: 'Short high-fan careers', severity: 'high', confidence: 'strong', message: 'Repeated short windows.', display_value: '9 careers', caveat: 'Career boundaries are estimated.' },
    { key: 'fan_gain_rate', label: 'Fan gain rate', severity: 'high', confidence: 'medium', message: 'High output pace.', display_value: '128K/min', caveat: null },
    { key: 'heatmap_coverage', label: 'Broad schedule coverage', severity: 'medium', confidence: 'contextual', message: 'Activity spans much of the week.', display_value: '92 / 168', caveat: null }
  ] }
};

const daily = Array.from({ length: 20 }, (_, index) => ({ day: `2026-08-${String(index + 1).padStart(2, '0')}`, active_seconds: 7200 + index * 600, careers: 7 + index, fan_gain: 900000 + index * 110000, sessions: 2 + index % 3, longest_session_sec: 4200 + index * 120, distinct_hours: 4 + index % 8 }));
const heatmap = Array.from({ length: 7 * 24 }, (_, index) => ({ dow: Math.floor(index / 24), hour: index % 24, active_seconds: index % 4 === 0 ? 1200 + index * 10 : 0, careers: index % 8 === 0 ? 2 : 0 }));
const report = { score, daily, heatmap, top_sessions: [{ day: '2026-08-20', started_at: '2026-08-20T08:00:00Z', ended_at: '2026-08-20T18:00:00Z', observed_seconds: 36000, active_seconds: 28400, idle_seconds: 7600, careers: 24, fan_gain: 6200000, session_count: 3 }], short_career_snapshots_total: 1, short_career_snapshots: [{ rank: 1, total_count: 1, snapshot_id: 501, circle_id: 7, snapshot_time: '2026-08-20T12:00:00Z', previous_snapshot_id: 500, previous_snapshot_time: '2026-08-20T11:47:00Z', previous_snapshot_fans: 100000000, current_fans: 100920000, fan_gain: 920000, snapshot_gap_seconds: 780, previous_career_snapshot_time: '2026-08-20T11:47:00Z', previous_career_gap_seconds: 780, career_length_seconds: 780, fans_per_minute: 70769, short_training_score: 4.2, is_high_fan_short: true, prior_snapshots: [], next_snapshots: [] }] };

export async function mockActivity(page: Page, viewerId = 42): Promise<void> {
  await page.route('**/api/v4/shame/hall*', (route) => route.fulfill({ json: { entries: [score, { ...score, viewer_id: 43, trainer_name: 'Oguri Observer', suspicion_score: 38, short_high_fan_careers: 0 }], total: 2, page: 0, limit: 50, total_pages: 1, suspicion_score_threshold: 40, last_refreshed_at: '2026-08-28T19:00:00Z' } }));
  await page.route(`**/api/v4/shame/viewer/${viewerId}*`, (route) => route.fulfill({ json: { ...report, score: { ...report.score, viewer_id: viewerId } } }));
}

const events = [
  { id: 'character-1', type: 'character_banner', title: 'Mejiro McQueen Pickup', description: 'Featured character pickup.', global_release_date: '2026-09-01T00:00:00Z', estimated_end_date: '2026-09-10T00:00:00Z', is_confirmed: true, gacha_id: 7001, gacha_ids: [7001], gacha_type: 3, pickup_card_ids: [1001, 1002], related_characters: ['Mejiro McQueen', 'Oguri Cap'], planner_data_available: true },
  { id: 'support-1', type: 'support_card_banner', title: 'Kitasan Black Support Pickup', global_release_date: '2026-09-01T00:00:00Z', estimated_end_date: '2026-09-10T00:00:00Z', is_confirmed: true, related_support_card_names: ['Kitasan Black'], planner_data_available: true },
  { id: 'champions-1', type: 'champions_meeting', title: 'Mile Champions Meeting', global_release_date: '2026-09-18T00:00:00Z', is_confirmed: false, planner_data_available: false },
  { id: 'factor-1', type: 'factor_research', title: 'Factor Research', global_release_date: '2026-10-03T00:00:00Z', is_confirmed: false, planner_data_available: false },
  { id: 'scenario-1', type: 'scenario_release', title: 'New Training Scenario', global_release_date: '2026-11-14T00:00:00Z', is_confirmed: false, planner_data_available: false }
];

export async function mockTimeline(page: Page, freezeTime = true): Promise<void> {
  if (freezeTime) await page.clock.setFixedTime(new Date('2026-08-29T12:00:00Z'));
  await page.route('**/resources/manifest.json*', (route) => route.fulfill({ json: { version: 'test', files: { 'banner_timeline.json': '/resources/test/banner_timeline.json' } } }));
  await page.route('**/resources/test/banner_timeline.json*', (route) => route.fulfill({ json: { events: events.map((event) => ({ ...event, jp_release_date: event.global_release_date })) } }));
  await page.route('**/resources/planner/manifest.json*', (route) => route.fulfill({ json: { version: 'test', files: { 'planner_core.json': '/resources/test/planner_core.json', 'planner_income.json': '/resources/test/planner_income.json', 'planner_rewards.json': '/resources/test/planner_rewards.json', 'planner_gacha_2026.json': '/resources/test/planner_gacha_2026.json' } } }));
  await page.route('**/resources/test/planner_core.json*', (route) => route.fulfill({ json: { jewel_cost_per_pull: 150, default_spark_pulls: 200, gacha_shard_by_event: { 'character-1': '2026' }, gacha_shard_by_id: { '7001': '2026' } } }));
  await page.route('**/resources/test/planner_income.json*', (route) => route.fulfill({ json: { rules: [{ id: 'daily-login', label: 'Daily login', description: 'Published login income', category: 'login', currency: 'free_jewels', amount: 100, cadence: 'daily', start_date: '2026-08-29', default_enabled: true }, { id: 'monthly-shop-friend', label: 'Monthly shop tickets', category: 'shop', currency: 'uma_ticket', amount: 1, cadence: 'monthly', start_date: '2026-08-01', scenario_group: 'monthly_shop_tickets', scenario_option: 'friend_points' }] } }));
  await page.route('**/resources/test/planner_rewards.json*', (route) => route.fulfill({ json: { rewards: [{ id: 'launch-gift', label: 'Launch gift', currency: 'free_jewels', amount: 500, available_at: '2026-08-30', category: 'campaign', default_enabled: true }], free_pull_campaigns: [{ id: 'anniversary-pulls', label: 'Anniversary free pulls', total_pulls: 10, stockable: true, allocation_mode: 'daily_with_one_time_stock', default_allocations: [{ event_id: 'character-1', gacha_id: 7001, pulls: 10 }] }], event_benefits: [{ id: 'selector', event_id: 'character-1', label: 'Anniversary selector', kind: 'trainee_selector', available_at: '2026-09-01', planner_effect: 'linked_inventory_benefit' }] } }));
  await page.route('**/resources/test/planner_gacha_2026.json*', (route) => route.fulfill({ json: { gachas: [{ event_id: 'character-1', gacha_id: 7001, gacha_type: 3, banner_kind: 'character', start_date: '2026-09-01', end_date: '2026-09-10', jewel_cost_per_pull: 150, spark_pulls: 200, free_pulls: 10, pickups: [{ pickup_id: 1001, label: 'Mejiro McQueen', rate: .01, exchangeable: true }, { pickup_id: 1002, label: 'Oguri Cap', rate: .01, exchangeable: true }], rarity_rates: [{ rarity: 3, rate: .03 }] }] } }));
}

export const veteran = {
  id: 1, member_id: 1, trained_chara_id: 991, card_id: 101101, distance_type: 4, running_style: 2,
  speed: 1210, stamina: 960, power: 1090, guts: 720, wiz: 1040, rank_score: 15900, skills: [200011, 100011],
  factors: [103, 1203, 10010103, 2000102], support_cards: [], scenario_id: 5, rarity: 5, talent_level: 5,
  proper_ground_turf: 7, proper_ground_dirt: 1, proper_distance_short: 2, proper_distance_mile: 4,
  proper_distance_middle: 6, proper_distance_long: 7, proper_running_style_nige: 2, proper_running_style_senko: 7,
  proper_running_style_sashi: 4, proper_running_style_oikomi: 1,
  inheritance: { blue_sparks: [103], pink_sparks: [1203], green_sparks: [10010103], white_sparks: [2000102], blue_stars_sum: 3, pink_stars_sum: 3, green_stars_sum: 3, white_stars_sum: 2, affinity_score: 83 },
  win_saddle_id_array: [30], race_results: [102],
  succession_chara_array: [
    { position_id: 10, card_id: 106701, rank: 14500, rarity: 4, talent_level: 4, factor_id_array: [103] },
    { position_id: 20, card_id: 108801, rank: 12100, rarity: 3, talent_level: 3, factor_id_array: [1203] },
    { position_id: 11, card_id: 101101, rank: 10000, rarity: 3, talent_level: 3, factor_id_array: [102] },
    { position_id: 12, card_id: 106701, rank: 10000, rarity: 3, talent_level: 3, factor_id_array: [1202] },
    { position_id: 21, card_id: 108801, rank: 10000, rarity: 3, talent_level: 3, factor_id_array: [103] },
    { position_id: 22, card_id: 101101, rank: 10000, rarity: 3, talent_level: 3, factor_id_array: [1203] }
  ]
};

const veteranProfile = {
  trainer: { account_id: '123456789012', name: 'Parity Trainer', follower_num: 12, own_follow_num: 4, best_team_class: 7, team_class: 7, team_evaluation_point: 40400, rank_score: 24100, comment: 'Profile fixture' },
  circle: null, circle_history: [], fan_history: { monthly: [], rolling: null, alltime: null }, inheritance: null,
  support_card: null, team_stadium: [], veterans: [veteran]
};

export async function mockVeteranProfile(page: Page) {
  await page.route('**/api/v4/user/profile/123456789012', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(veteranProfile) }));
}

// Angular consumes encoded IDs in factor_info_array as well as legacy inheritance arrays.
export async function mockParentRowProfile(page: Page) {
  const rows = [
    { ...veteran, id: 1, trained_chara_id: 901, member_id: 1, card_id: 101301, factor_info_array: [{ factor_id: 101, level: 1 }, { factor_id: 103, level: 3 }, { factor_id: 203, level: 3 }],
      succession_chara_array: [
        { position_id: 10, card_id: 106701, factor_info_array: [{ factor_id: 102, level: 2 }, { factor_id: 103, level: 3 }], factor_id_array: [] },
        { position_id: 20, card_id: 108801, factor_id_array: [] }
      ] },
    { ...veteran, id: 2, trained_chara_id: 902, member_id: 2, card_id: 100601, factors: null, inheritance: { ...veteran.inheritance, blue_sparks: [101, 103, 203], pink_sparks: [], green_sparks: [], white_sparks: [] }, succession_chara_array: [] },
    { ...veteran, id: 3, trained_chara_id: 903, member_id: 3, card_id: 106701, factors: [101, 103, 201, 203], inheritance: null, succession_chara_array: [] }
  ];
  await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ json: { ...veteranProfile, veterans: rows } }));
  return rows;
}

export async function mockProfilePresentation(page: Page, allTimeOnly = false) {
  await mockOwnerProfile(page, []);
  const data = { ...profile, fan_history: { ...profile.fan_history,
    monthly: [4200000, 0, -125000].map((monthly_gain, index) => ({ ...profile.fan_history.monthly[0], month: 8 - index, monthly_gain })),
    rolling: allTimeOnly ? null : { ...profile.fan_history.rolling, gain_3d: 4200000, gain_7d: -125000, gain_30d: 0 }
  } };
  await page.route(`**/api/v4/user/profile/${accountId}`, route => route.fulfill({ json: data }));
  return data;
}




export async function mockResources(target: Page | BrowserContext): Promise<void> {
  await target.route('**/assets/data/precomputed-tierlist.json*', route => route.fulfill({ json: tierlist }));
  await target.route('**/resources/manifest.json*', route => route.fulfill({ json: { version: 'test' } }));
  for (const [name, json] of Object.entries(resourceFixtures)) {
    await target.route(`**/resources/*/${name}.json*`, route => route.fulfill({ json }));
  }
}
