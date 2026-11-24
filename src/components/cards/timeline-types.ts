import type { IconName } from '../icon-types';
import type { SupportRarity } from '@/lib/game-assets/art-links';
import type { TimelinePreliminaryChanges } from '@/lib/timeline/prediction/timeline-prediction-types';

export interface TimelineReward {
  id: string;
  label: string;
  amount: string | number;
  icon?: string;
  fallbackIcon?: IconName;
  freePulls?: boolean;
}

export interface TimelinePickup {
  id: string;
  name: string;
  image: string;
  kind: 'character' | 'support';
  rarity?: number;
  rarityLabel?: SupportRarity;
  rarityIcon?: string;
  supportType?: string;
  typeIcon?: string;
  subLabel?: string;
  searchTerms?: string[];
  gametoraUrl?: string;
}

export interface TimelineEventData {
  id: string;
  title: string;
  eventType: string;
  typeLabel: string;
  gachaLabel?: string;
  dateLabel: string;
  context?: string;
  image?: string;
  rerun?: boolean;
  predicted?: boolean;
  preliminary?: boolean;
  preliminaryChanges?: TimelinePreliminaryChanges;
  rewards?: TimelineReward[];
  rewardLabel?: string;
  rewardContext?: string;
  pickups?: TimelinePickup[];
  overflowPickups?: number;
  raceLines?: string[];
  canPlan?: boolean;
}
