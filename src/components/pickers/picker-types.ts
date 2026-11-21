import type { SupportTypeName } from '@/lib/game-data/support-cards/support-card-details';

export interface CharacterPickerOption {
  id: string;
  name: string;
  image?: string;
  subtitle?: string;
  affinity?: number;
  disabled?: boolean;
}

export interface SupportCardPickerOption {
  id: string;
  title: string;
  character?: string;
  searchText?: string;
  image?: string;
  type: SupportTypeName;
  rarity: 'R' | 'SR' | 'SSR';
  disabled?: boolean;
}
