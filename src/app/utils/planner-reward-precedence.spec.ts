import { PlannerRewardResource } from '../models/carat-planner.model';
import { applyGlobalRewardPrecedence } from './planner-reward-precedence';

describe('applyGlobalRewardPrecedence', () => {
  it('replaces JP-derived reward slots with Global data for every planner consumer', () => {
    const resource: PlannerRewardResource = {
      rewards: [
        { id: 'global-carats', event_id: 'anniversary', label: 'Global login bonus', currency: 'free_jewels', amount: 1500, available_at: '2030-01-01', provenance: 'global_news' },
        { id: 'jp-carats', event_id: 'anniversary', label: 'JP login bonus', currency: 'free_jewels', amount: 3000, available_at: '2030-01-01', provenance: 'jp_news' },
        { id: 'jp-ticket', event_id: 'anniversary', label: 'JP support ticket', currency: 'support_ticket', amount: 1, available_at: '2030-01-01', provenance: 'jp_news' },
        { id: 'jp-only', event_id: 'future-campaign', label: 'JP-only reward', currency: 'free_jewels', amount: 500, available_at: '2031-01-01', provenance: 'jp_news' },
      ],
      event_benefits: [
        { id: 'global-pulls', event_id: 'anniversary-banner', kind: 'free_pulls', label: 'Global pulls', amount: 80, available_at: '2030-01-01', planner_effect: 'target_free_pulls', provenance: 'global_news' },
        { id: 'jp-pulls', event_id: 'anniversary-banner', kind: 'free_pulls', label: 'JP pulls', amount: 100, available_at: '2030-01-01', planner_effect: 'target_free_pulls', provenance: 'jp_news' },
        { id: 'jp-selector', event_id: 'anniversary-banner', kind: 'support_selector', label: 'JP selector', amount: 1, available_at: '2030-01-01', planner_effect: 'informational', provenance: 'jp_news' },
      ],
      free_pull_campaigns: [
        { id: 'global-campaign', label: 'Global anniversary pulls', total_pulls: 80, provenance: 'global_news', default_allocations: [{ event_id: 'anniversary-banner', gacha_id: 30100, pulls: 80 }] },
        { id: 'jp-campaign', label: 'JP anniversary pulls', total_pulls: 100, provenance: 'jp_news', default_allocations: [{ event_id: 'anniversary-banner', gacha_id: 30100, pulls: 100 }] },
        { id: 'jp-future-campaign', label: 'JP future pulls', total_pulls: 10, provenance: 'jp_news', default_allocations: [{ event_id: 'future-banner', gacha_id: 30200, pulls: 10 }] },
      ],
    };

    const preferred = applyGlobalRewardPrecedence(resource);

    expect(preferred.rewards.map(reward => reward.id)).toEqual([
      'global-carats', 'jp-ticket', 'jp-only',
    ]);
    expect(preferred.event_benefits?.map(benefit => benefit.id)).toEqual([
      'global-pulls', 'jp-selector',
    ]);
    expect(preferred.free_pull_campaigns?.map(campaign => campaign.id)).toEqual([
      'global-campaign', 'jp-future-campaign',
    ]);
    expect(resource.rewards.map(reward => reward.id)).toContain('jp-carats');
  });

  it('removes unlinked JP news gifts that have no Global timeline date', () => {
    const resource: PlannerRewardResource = {
      rewards: [
        { id: 'unlinked', label: 'Unlinked JP gift', currency: 'free_jewels', amount: 500, available_at: '2030-01-01', provenance: 'jp_news' },
      ],
    };

    expect(applyGlobalRewardPrecedence(resource).rewards).toEqual([]);
  });

  it('removes JP broadcast gifts even when a timeline event was matched', () => {
    const resource: PlannerRewardResource = {
      rewards: [
        {
          id: 'news-3377-section-2-jewels-300-0', event_id: 'campaign-3377',
          label: '■「ぱかライブTV」放送記念プレゼント！', currency: 'free_jewels', amount: 300,
          available_at: '2030-01-01', provenance: 'jp_news',
        },
        {
          id: 'linked-login', event_id: 'campaign-3378', label: 'Anniversary login bonus',
          currency: 'free_jewels', amount: 1500, available_at: '2030-02-01', provenance: 'jp_news',
        },
      ],
    };

    expect(applyGlobalRewardPrecedence(resource).rewards.map(reward => reward.id)).toEqual(['linked-login']);
  });

  it('keeps distinct anniversary gifts while replacing matching mission and login components', () => {
    const resource: PlannerRewardResource = {
      rewards: [
        {
          id: 'mission-campaign-218-free_jewels', event_id: 'campaign-218',
          label: 'Limited-time mission rewards', currency: 'free_jewels', amount: 500,
          available_at: '2030-01-31', provenance: 'global_master',
        },
        {
          id: 'login-bonus-30042-free_jewels', label: 'Limited login bonus',
          currency: 'free_jewels', amount: 3000, available_at: '2030-01-31', provenance: 'global_master',
        },
        {
          id: 'jp-master-mission-218-free_jewels', event_id: 'campaign-218',
          label: 'Anniversary missions', currency: 'free_jewels', amount: 500,
          available_at: '2030-01-31', provenance: 'jp_master_snapshot',
        },
        {
          id: 'news-902-login-bonus', event_id: 'campaign-218', label: 'Anniversary login bonus',
          currency: 'free_jewels', amount: 3000, available_at: '2030-01-10', provenance: 'jp_news',
        },
        {
          id: 'news-902-section-2-jewels-3000-0', event_id: 'campaign-218',
          label: 'Gift contents', currency: 'free_jewels', amount: 3000,
          available_at: '2030-01-31', provenance: 'jp_news', evidence: 'Gift contents: 3,000 Jewels',
        },
        {
          id: 'news-902-section-4-jewels-3000-0', event_id: 'campaign-218',
          label: '30 days after the gift is sent', currency: 'free_jewels', amount: 3000,
          available_at: '2030-01-31', provenance: 'jp_news', evidence: 'Claim within 30 days after the gift is sent.',
        },
      ],
    };

    expect(applyGlobalRewardPrecedence(resource).rewards.map(reward => reward.id)).toEqual([
      'mission-campaign-218-free_jewels',
      'login-bonus-30042-free_jewels',
      'news-902-section-2-jewels-3000-0',
    ]);
  });
});
