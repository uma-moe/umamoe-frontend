import type { SparkRecord } from '../sparks/SparkRow.svelte';
import type { SparkTone } from '../sparks/SparkItem.svelte';
import type { AptitudeItem } from './AptitudeGrid.svelte';
import type { StatStripItem } from './StatStrip.svelte';

export interface VeteranSparkGroup {
  tone: SparkTone;
  items: SparkRecord[];
}

export interface VeteranParentSummary {
  id: string;
  position: 'P1' | 'P2';
  name: string;
  image?: string;
  affinity: number;
  sparks: VeteranSparkGroup[];
}

export interface VeteranUiRecord {
  id: string;
  name: string;
  image?: string;
  rank: string;
  score?: number;
  scenario?: string;
  labels?: string[];
  stickers?: Array<{ name: string; image: string }>;
  detail?: string;
  workspace?: string;
  updated?: string;
  affinity: number;
  affinityNote?: string;
  affinityTarget?: { id: number; name: string };
  raceAffinity?: number;
  combinedSparks?: VeteranSparkGroup[];
  stats?: StatStripItem[];
  aptitudes?: AptitudeItem[];
  sparks: VeteranSparkGroup[];
  parents?: VeteranParentSummary[];
}
