import type { IconName } from '../icon-types';

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
  rewards?: TimelineReward[];
  rewardLabel?: string;
  rewardContext?: string;
  pickups?: TimelinePickup[];
  overflowPickups?: number;
  raceLines?: string[];
  canPlan?: boolean;
}
