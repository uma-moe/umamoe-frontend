import type { VeteranSparkGroup } from './game/veteran-ui-types';

export type LineageRole = 'main' | 'parent' | 'grandparent';
export interface LineageNodeData { id: string; name: string; image?: string; rank?: string; role: LineageRole; roleLabel: string; affinity?: number; raceAffinity?: number; sparks?: VeteranSparkGroup[]; }
export interface LineageBranch { id: string; parent: LineageNodeData; grandparents: LineageNodeData[]; }
