import type { Snippet } from 'svelte';
import type { IconName } from '@/components/icon-types';
import type { SimulatorPanelId } from '../simulator-layout.svelte';

/** The three surfaces the simulator shell hosts. */
export type SimulatorMode = 'stamina' | 'race' | 'build';

/** One setup panel, rendered as a tab in the shell's sidebar. */
export interface SimulatorPanel {
  id: SimulatorPanelId;
  /** Full name, used by the rail tooltip and the tab's accessible name. */
  label: string;
  /** Short name, shown on the tab itself. */
  shortLabel: string;
  icon: IconName;
  /** A dot on the tab, for a panel holding settings that are not visible on the page. */
  badge?: boolean;
  content: Snippet;
}
