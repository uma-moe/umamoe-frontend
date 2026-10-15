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
  type: 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend';
  rarity: 'R' | 'SR' | 'SSR';
  disabled?: boolean;
}
