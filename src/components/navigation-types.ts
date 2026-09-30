import type { IconName } from './icon-types';

export interface NavigationSubItem {
  id: string;
  label: string;
  href: string;
  badge?: string;
  current?: boolean;
}

export interface NavigationItem extends NavigationSubItem {
  icon: IconName;
  expanded?: boolean;
  children?: NavigationSubItem[];
}

export type NavigationVariant = 'rail' | 'sheet';
