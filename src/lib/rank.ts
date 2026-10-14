export interface RankInfo {
  label: string;
  iconIndex: number;
  isUltra: boolean;
  tier: 'G' | 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  subLevel: number | null;
  isPlus: boolean;
  colorToken: string;
}

const standardTiers = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS'] as const;
const ultraTiers = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
const ultraThresholds = [
  19600, 20000, 20400, 20800, 21200, 21600, 22100, 22500, 23000, 23400,
  23900, 24300, 24800, 25300, 25800, 26300, 26800, 27300, 27800, 28300,
  28800, 29400, 29900, 30400, 31000, 31500, 32100, 32700, 33200, 33800,
  34400, 35000, 35600, 36200, 36800, 37500, 38100, 38700, 39400, 40000,
  40700, 41300, 42000, 42700, 43400, 44000, 44700, 45400, 46200, 46900,
  47600, 48300, 49000, 49800, 50500, 51300, 52000, 52800, 53600, 54400,
  55200, 55900, 56700, 57500, 58400, 59200, 60000, 60800, 61700, 62500,
  63400, 64200, 65100, 66400, 67700, 69000, 70300, 71600, 72900, 74400
];

function token(tier: RankInfo['tier']) { return `var(--rank-${tier.toLowerCase()})`; }

export function getRankInfo(rarity: number): RankInfo {
  const index = Math.max(0, Math.min(97, Math.trunc(rarity) - 1));
  if (index < 18) {
    const tier = standardTiers[Math.floor(index / 2)] ?? 'G';
    const isPlus = index % 2 === 1;
    return { label: `${tier}${isPlus ? '+' : ''}`, iconIndex: index, isUltra: false, tier, subLevel: null, isPlus, colorToken: token(tier) };
  }
  const ultraIndex = index - 18;
  const tier = ultraTiers[Math.floor(ultraIndex / 10)] ?? 'G';
  const subLevel = ultraIndex % 10;
  return { label: `U${tier}${subLevel}`, iconIndex: index, isUltra: true, tier, subLevel, isPlus: false, colorToken: token(tier) };
}

export function getRankInfoFromScore(score: number): RankInfo {
  if (score >= ultraThresholds[0]!) {
    let index = ultraThresholds.findLastIndex((threshold) => score >= threshold);
    index = Math.max(0, Math.min(index, 79));
    return getRankInfo(index + 19);
  }
  const thresholds: Array<[number, number]> = [[19200,18],[17500,17],[15900,16],[14500,15],[12100,14],[10000,13],[8200,12],[6500,11],[4900,10],[3500,9],[2900,8],[2300,7],[1800,6],[1300,5],[900,4],[600,3]];
  return getRankInfo(thresholds.find((entry) => score >= entry[0])?.[1] ?? 1);
}

export function getRankInfoFromLabel(label: string): RankInfo {
  const normalized = label.trim().toUpperCase();
  const ultra = /^U([GFEDCBAS])(\d)$/.exec(normalized);
  if (ultra) {
    const tierIndex = ultraTiers.indexOf(ultra[1] as typeof ultraTiers[number]);
    return getRankInfo(19 + Math.max(0, tierIndex) * 10 + Number(ultra[2]));
  }
  const standard = /^(SS|[GFEDCBAS])(\+)?$/.exec(normalized);
  if (!standard) return getRankInfo(1);
  const tierIndex = standardTiers.indexOf(standard[1] as typeof standardTiers[number]);
  return getRankInfo(tierIndex * 2 + (standard[2] ? 2 : 1));
}
