import type { Snippet } from 'svelte';
import type { IconName } from '@/components/icon-types';

/** The three surfaces the simulator shell hosts. */
export type SimulatorMode = 'stamina' | 'race' | 'build';

/** A setup dialog opened from the simulator toolbar. */
export interface SimulatorPanel {
  id: 'modifiers' | 'field' | 'search';
  /** Dialog title and toolbar label. */
  label: string;
  /** Short display label. */
  shortLabel: string;
  icon: IconName;
  /** Indicates configured modifiers or constraints. */
  badge?: boolean;
  content: Snippet;
}
