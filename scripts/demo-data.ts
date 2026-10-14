import type { Page, Route } from '@playwright/test';
import type { Plugin } from 'vite';
import { demoClubDetails } from './demo-clubs';
import { clubProgression, type ClubMemberSnapshot } from '../src/lib/clubs/member-metrics';
import { homeStats, profile, record, veteran, fullTeamStadium, mockResources, mockActivity, mockAffinity, mockCommunity, mockDatabase, mockStatistics, mockTimeline, mockVeteranProfile } from '../tests/e2e/fixtures/api';

// ponytail: reuse parity fixtures for local previews; add a stateful demo backend when demo writes are needed.
export async function demoData(): Promise<Plugin> {
  const routes: { pattern: RegExp; handle: (route: Route) => unknown }[] = [];
  const page = {
    route(pattern: string, handle: (route: Route) => unknown) {
      const expression = pattern.split(/(\*\*|\*)/).map(part => part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
      routes.push({ pattern: new RegExp(`^${expression}$`), handle });
      return Promise.resolve();
    }
  } as unknown as Page;
  await mockResources(page);
  await mockDatabase(page);
  await page.route('**/search/query?*', route => route.fulfill({json:{items:Array.from({length:25}, (_, index) => {
    const item = record(String(123456789012 + index));
    item.trainer_name = index ? `Sample Trainer ${index + 1}` : item.trainer_name;
    item.inheritance.inheritance_id = index + 1;
    return item;
  })}}));
  await mockCommunity(page);
  await page.route('**/api/v4/circles/list?*', route => {
    const now = new Date(Date.now() + 9 * 3600000);
    return route.fulfill({ json:{ circles:[7, 8, 9].map(id => demoClubDetails(id, now.getUTCFullYear(), now.getUTCMonth() + 1).circle) } });
  });
  await page.route('**/api/v4/circles?*', route => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({ json:demoClubDetails(Number(query.get('circle_id')), Number(query.get('year')), Number(query.get('month'))) });
  });
  await mockActivity(page);
  await mockActivity(page, 43);
  await mockStatistics(page);
  await mockVeteranProfile(page);
  const demoVeterans = [101101, 101301, 100601, 106701, 108801, 100701].map((card_id, index) => ({
    ...veteran, id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`, trainer_id:'123456789012', trained_chara_id:900+index, card_id,
    factors:[103, 1203, 10010103, 2000102], speed:veteran.speed-index*10,
    support_cards:[30028,30016,30003,30009,20023,30011],
    support_card_list:[30028,30016,30003,30009,20023,30011].map((support_card_id,slot)=>({support_card_id,limit_break_count:[4,3,2,1,0,4][slot]}))
  }));
  await page.route('**/demo/veterans.json', route=>route.fulfill({json:demoVeterans}));
  await page.route('**/api/v4/user/profile/veterans/*', route=>{
    const selected=demoVeterans.find(item=>item.id===new URL(route.request().url()).pathname.split('/').at(-1));
    return route.fulfill({status:selected?200:404,json:selected??{message:'Veteran not found'}});
  });
  await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ json: {
    ...profile,
    team_stadium: fullTeamStadium,
    veterans: demoVeterans,
    support_card: { ...profile.support_card, support_card_id: 30028 },
    inheritance: {
      ...profile.inheritance, green_sparks: [10010103], white_sparks: [2000102],
      main_green_factors: 10010103, left_green_factors: 10010102, right_green_factors: 10010103,
      main_white_factors: [2000102, 2000203, 2000302], left_white_factors: [2000102], right_white_factors: [2000102]
    },
    fan_history: { ...profile.fan_history, monthly: Array.from({ length: 8 }, (_, index) => ({
      ...profile.fan_history.monthly[0], month: 8 - index, total_fans: 42_000_000 - index * 4_200_000 + index % 2 * 600_000
    })) }
  } }));
  await mockTimeline(page, false);
  await mockAffinity(page);
  // Cover every character displayed in the sample veteran collection.
  const demoAffinityChars=[1013,1006,1067,1011,1088,1007];
  await page.route('**/resources/test/affinity.json',route=>route.fulfill({json:{chars:demoAffinityChars,aff2:Array(demoAffinityChars.length ** 2).fill(2),aff3:Array(demoAffinityChars.length ** 3).fill(3)}}));
  // Merge manifests used independently by the workflow fixtures.
  await page.route('**/resources/manifest.json*', route => route.fulfill({ json: { version: 'demo', files: {
    affinity: '/resources/test/affinity.json', character: '/resources/test/character.json',
    character_names: '/resources/test/character_names.json',
    'banner_timeline.json': '/resources/test/banner_timeline.json'
  } } }));
  await page.route('**/api/stats?*', route => route.fulfill({ json: homeStats }));
  return {
    name: 'local-demo-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const match = routes.findLast(route => route.pattern.test(url.href));
        if (!match) return next();
        if (request.method !== 'GET') {
          response.writeHead(405, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: 'Demo data is read-only.' }));
          return;
        }
        const route = {
          request: () => ({ url: () => url.href }),
          fulfill: async (options: { json?: unknown; body?: string; contentType?: string; status?: number }) => {
            response.writeHead(options.status ?? 200, { 'Content-Type': options.contentType ?? 'application/json', 'Cache-Control': 'no-store' });
            const data = options.json as Record<string, unknown> | undefined;
            if (url.pathname === '/api/v4/circles' && url.searchParams.get('circle_id') === '7' && data && Array.isArray(data.members)) {
              const year = Number(url.searchParams.get('year')), month = Number(url.searchParams.get('month'));
              if (year === 2026 && month >= 1 && month <= 8) {
                const days = new Date(year, month, 0).getDate(), offset = 8 - month;
                const total = 42_000_000 - offset * 4_200_000 + offset % 2 * 600_000;
                const start = month === 1 ? total - 4_200_000 : 42_000_000 - (offset + 1) * 4_200_000 + (offset + 1) % 2 * 600_000;
                // Fictional daily observations for the local sample profile only.
                data.members = [...(data.members as ClubMemberSnapshot[]).filter(member => member.viewer_id !== 7012), { viewer_id:Number(profile.trainer.account_id), trainer_name:profile.trainer.name, year, month,
                  daily_fans:Array.from({length:days + 1}, (_, day) => day === days ? total : start + Math.round((total - start) * (day + Math.sin(day * .9) * .35) / days)), last_updated:'2026-09-01T00:00:00Z' }];
                const circle = data.circle as Record<string, unknown>;
                const history = clubProgression(data.members as ClubMemberSnapshot[], year, month);
                circle.monthly_point = circle.last_month_point = circle.live_points = history.at(-1)?.fan_count ?? 0;
                circle.yesterday_points = history.at(-2)?.fan_count ?? 0;
              }
            }
            const key = data && ['items', 'circles', 'rankings', 'entries'].find(key => Array.isArray(data[key]));
            if (data && key) {
              const query = (url.searchParams.get('query') ?? '').toLowerCase();
              const rows = (data[key] as Record<string, unknown>[]).filter(row => !query || JSON.stringify(row).toLowerCase().includes(query));
              const limit = Math.max(1, Number(url.searchParams.get('limit')) || 100);
              const page = Math.max(0, Number(url.searchParams.get('page')) || 0);
              response.end(JSON.stringify({ ...data, [key]: rows.slice(page * limit, (page + 1) * limit), total: rows.length, page, limit, total_pages: Math.ceil(rows.length / limit) }));
            } else response.end(options.body ?? JSON.stringify(options.json));
          }
        } as unknown as Route;
        Promise.resolve(match.handle(route)).catch(next);
      });
    }
  };
}
