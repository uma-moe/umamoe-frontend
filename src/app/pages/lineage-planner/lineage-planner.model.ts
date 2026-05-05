import { Character } from '../../models/character.model';
import { VeteranMember, SuccessionChara } from '../../models/profile.model';
import { SparkInfo } from '../../services/factor.service';
import { CandidateScore, SlotName } from '../../services/affinity.service';

export interface LineageNode {
  position: string;
  layer: number;
  character: Character | null;
  veteran: VeteranMember | null;
  succession: SuccessionChara | null;
  resolvedSparks: SparkInfo[];
  affinity: number | null;
  manualWinSaddleIds: number[];
  label: string;
}

export const POSITION_TO_SLOT: Record<string, SlotName> = {
  'target': 'target',
  'p1': 'p1',
  'p2': 'p2',
  'p1-1': 'gp1Left',
  'p1-2': 'gp1Right',
  'p2-1': 'gp2Left',
  'p2-2': 'gp2Right',
};

/** API response from GET /api/v4/affinity/tree */
export interface AffinityTreeResponse {
  breedings: AffinityBreeding[];
  player_affinity: number;
  total: number;
  total_base_affinity: number;
}

export interface AffinityBreeding {
  parent: number;
  left: number;
  right: number;
  affinity: number;
}

/**
 * Tree positions:
 *
 * Layer 0 (target):       'target'
 * Layer 1 (parents):      'p1', 'p2'
 * Layer 2 (grandparents): 'p1-1', 'p1-2', 'p2-1', 'p2-2'
 * Layer 3 (great-GP):     'p1-1-1', 'p1-1-2', 'p1-2-1', 'p1-2-2',
 *                          'p2-1-1', 'p2-1-2', 'p2-2-1', 'p2-2-2'
 */
export const TREE_POSITIONS: { position: string; layer: number; label: string; parentPosition?: string }[] = [
  // Layer 0
  { position: 'target', layer: 0, label: 'Target' },
  // Layer 1
  { position: 'p1', layer: 1, label: 'Parent 1', parentPosition: 'target' },
  { position: 'p2', layer: 1, label: 'Parent 2', parentPosition: 'target' },
  // Layer 2
  { position: 'p1-1', layer: 2, label: 'Grandparent 1', parentPosition: 'p1' },
  { position: 'p1-2', layer: 2, label: 'Grandparent 2', parentPosition: 'p1' },
  { position: 'p2-1', layer: 2, label: 'Grandparent 3', parentPosition: 'p2' },
  { position: 'p2-2', layer: 2, label: 'Grandparent 4', parentPosition: 'p2' },
  // Layer 3
  { position: 'p1-1-1', layer: 3, label: 'Great-GP 1', parentPosition: 'p1-1' },
  { position: 'p1-1-2', layer: 3, label: 'Great-GP 2', parentPosition: 'p1-1' },
  { position: 'p1-2-1', layer: 3, label: 'Great-GP 3', parentPosition: 'p1-2' },
  { position: 'p1-2-2', layer: 3, label: 'Great-GP 4', parentPosition: 'p1-2' },
  { position: 'p2-1-1', layer: 3, label: 'Great-GP 5', parentPosition: 'p2-1' },
  { position: 'p2-1-2', layer: 3, label: 'Great-GP 6', parentPosition: 'p2-1' },
  { position: 'p2-2-1', layer: 3, label: 'Great-GP 7', parentPosition: 'p2-2' },
  { position: 'p2-2-2', layer: 3, label: 'Great-GP 8', parentPosition: 'p2-2' },
];

/**
 * BTree index order for the cards query parameter.
 * Index 0 = target, 1-2 = parents, 3-6 = grandparents, 7-14 = great-grandparents.
 */
export const BTREE_ORDER: string[] = [
  'target',
  'p1', 'p2',
  'p1-1', 'p1-2', 'p2-1', 'p2-2',
  'p1-1-1', 'p1-1-2', 'p1-2-1', 'p1-2-2', 'p2-1-1', 'p2-1-2', 'p2-2-1', 'p2-2-2',
];

/**
 * Maps API response node keys (layer + index within layer) to position strings.
 * e.g. "00" -> "target", "10" -> "p1", "11" -> "p2", etc.
 */
export const RESPONSE_KEY_TO_POSITION: { [key: string]: string } = {
  '00': 'target',
  '10': 'p1',
  '11': 'p2',
  '20': 'p1-1',
  '21': 'p1-2',
  '22': 'p2-1',
  '23': 'p2-2',
  '30': 'p1-1-1',
  '31': 'p1-1-2',
  '32': 'p1-2-1',
  '33': 'p1-2-2',
  '34': 'p2-1-1',
  '35': 'p2-1-2',
  '36': 'p2-2-1',
  '37': 'p2-2-2',
};
