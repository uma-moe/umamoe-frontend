import { factorImage, factorOptions, type FactorMetadata } from '@/lib/catalog/factor-catalog';

export type CategoryTone = 'benefit' | 'debuff' | 'penalty' | 'neutral';

export type CategoryFamily = 'passive' | 'active' | 'race' | 'scenario';

export interface CategoryMetadata {
  label: string;
  detail: string;
  order: number;
  tone: CategoryTone;
  family: CategoryFamily;
  variant?: 'normal' | 'upgraded';
}

export interface WhiteFactorCategory extends CategoryMetadata {
  key: string;
  icon?: string;
  factorCount: number;
}

export interface BrowseableFactor {
  id: number;
  text: string;
  categoryKey: string;
  icon?: string;
  searchText: string;
}

export const categoryMetadata: Record<string, CategoryMetadata> = {
  race: {
    label: 'Race',
    detail: 'G1 and other race factors',
    order: 10,
    tone: 'neutral',
    family: 'race'
  },
  scenario: {
    label: 'Scenario',
    detail: 'Scenario and campaign factors',
    order: 20,
    tone: 'neutral',
    family: 'scenario'
  },
  'passive-speed': {
    label: 'Speed conditions',
    detail: 'Green passive skills that change Speed',
    order: 30,
    tone: 'benefit',
    family: 'passive'
  },
  'passive-stamina': {
    label: 'Stamina conditions',
    detail: 'Green passive skills that change Stamina',
    order: 31,
    tone: 'benefit',
    family: 'passive'
  },
  'passive-power': {
    label: 'Power conditions',
    detail: 'Green passive skills that change Power',
    order: 32,
    tone: 'benefit',
    family: 'passive'
  },
  'passive-guts': {
    label: 'Guts conditions',
    detail: 'Green passive skills that change Guts',
    order: 33,
    tone: 'benefit',
    family: 'passive'
  },
  'passive-wit': {
    label: 'Wit conditions',
    detail: 'Green passive skills that change Wit',
    order: 34,
    tone: 'benefit',
    family: 'passive'
  },
  'passive-other': {
    label: 'Other conditions',
    detail: 'Other green passive skills',
    order: 35,
    tone: 'benefit',
    family: 'passive'
  },
  recovery: {
    label: 'Recovery',
    detail: 'Skills that recover stamina',
    order: 40,
    tone: 'benefit',
    family: 'active'
  },
  speed: {
    label: 'Speed up',
    detail: 'Skills that increase target speed',
    order: 41,
    tone: 'benefit',
    family: 'active'
  },
  acceleration: {
    label: 'Acceleration',
    detail: 'Skills that increase acceleration',
    order: 42,
    tone: 'benefit',
    family: 'active'
  },
  position: {
    label: 'Position',
    detail: 'Lane movement and positioning skills',
    order: 43,
    tone: 'benefit',
    family: 'active'
  },
  start: {
    label: 'Start',
    detail: 'Skills that improve starting reaction',
    order: 44,
    tone: 'benefit',
    family: 'active'
  },
  vision: {
    label: 'Vision',
    detail: 'Skills that increase field of view',
    order: 45,
    tone: 'benefit',
    family: 'active'
  },
  special: {
    label: 'Special',
    detail: 'Special-effect skills',
    order: 46,
    tone: 'benefit',
    family: 'active'
  },
  'special-upgraded': {
    label: 'Special',
    detail: 'Upgraded special-effect skills',
    order: 47,
    tone: 'benefit',
    family: 'active',
    variant: 'upgraded'
  },
  'speed-debuff': {
    label: 'Speed debuff',
    detail: 'Skills that slow other runners',
    order: 50,
    tone: 'debuff',
    family: 'active'
  },
  'acceleration-debuff': {
    label: 'Acceleration debuff',
    detail: 'Skills that reduce acceleration',
    order: 51,
    tone: 'debuff',
    family: 'active'
  },
  'rush-debuff': {
    label: 'Rush debuff',
    detail: 'Skills that make other runners rush',
    order: 52,
    tone: 'debuff',
    family: 'active'
  },
  'stamina-debuff': {
    label: 'Stamina debuff',
    detail: 'Skills that drain stamina',
    order: 53,
    tone: 'debuff',
    family: 'active'
  },
  'vision-debuff': {
    label: 'Vision debuff',
    detail: 'Skills that reduce field of view',
    order: 54,
    tone: 'debuff',
    family: 'active'
  },
  'other-debuff': {
    label: 'Other debuff',
    detail: 'Other skills that target opponents',
    order: 55,
    tone: 'debuff',
    family: 'active'
  },
  penalty: {
    label: 'Penalty',
    detail: 'Red negative-condition factors',
    order: 60,
    tone: 'penalty',
    family: 'active'
  }
};
const categoryIcons: Partial<Record<string, string>> = {
  'passive-speed': '/assets/images/skills/utx_ico_skill_10011.webp',
  'passive-stamina': '/assets/images/skills/utx_ico_skill_10021.webp',
  'passive-power': '/assets/images/skills/utx_ico_skill_10031.webp',
  'passive-guts': '/assets/images/skills/utx_ico_skill_10041.webp',
  'passive-wit': '/assets/images/skills/utx_ico_skill_10051.webp',
  'passive-other': '/assets/images/skills/utx_ico_skill_10061.webp',
  speed: '/assets/images/skills/utx_ico_skill_20011.webp',
  recovery: '/assets/images/skills/utx_ico_skill_20021.webp',
  acceleration: '/assets/images/skills/utx_ico_skill_20041.webp',
  position: '/assets/images/skills/utx_ico_skill_20051.webp',
  start: '/assets/images/skills/utx_ico_skill_20061.webp',
  vision: '/assets/images/skills/utx_ico_skill_20091.webp',
  special: '/assets/images/skills/utx_ico_skill_20101.webp',
  'special-upgraded': '/assets/images/skills/utx_ico_skill_20201.webp',
  'speed-debuff': '/assets/images/skills/utx_ico_skill_30011.webp',
  'acceleration-debuff': '/assets/images/skills/utx_ico_skill_30021.webp',
  'rush-debuff': '/assets/images/skills/utx_ico_skill_30041.webp',
  'stamina-debuff': '/assets/images/skills/utx_ico_skill_30051.webp',
  'vision-debuff': '/assets/images/skills/utx_ico_skill_30071.webp',
  'other-debuff': '/assets/images/skills/utx_ico_skill_30061.webp',
  penalty: '/assets/images/skills/utx_ico_skill_10014.webp'
};

export const familyLabels: Record<CategoryFamily, string> = {
  passive: 'Conditions',
  active: 'Skills',
  race: 'Races',
  scenario: 'Scenario'
};

export function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function iconCode(icon?: string): string {
  return icon?.match(/utx_ico_skill_(\d{5})/i)?.[1] ?? '';
}

function categoryKey(factor: FactorMetadata, icon?: string): string {
  if (factor.type === 2) return 'race';
  if (factor.type === 4) return 'scenario';
  const code = iconCode(icon);
  if (!code) return 'special-upgraded';
  if (/^1001[12]$/.test(code)) return 'passive-speed';
  if (/^1002[12]$/.test(code)) return 'passive-stamina';
  if (/^1003[12]$/.test(code)) return 'passive-power';
  if (/^1004[12]$/.test(code)) return 'passive-guts';
  if (/^1005[12]$/.test(code)) return 'passive-wit';
  if (/^100\d[12]$/.test(code)) return 'passive-other';
  if (/^(?:100|200)\d4$/.test(code)) return 'penalty';
  if (/^2001[12]$/.test(code)) return 'speed';
  if (/^2002[12]$/.test(code)) return 'recovery';
  if (/^2004[12]$/.test(code)) return 'acceleration';
  if (/^2005[12]$/.test(code)) return 'position';
  if (/^2006[12]$/.test(code)) return 'start';
  if (/^2009[12]$/.test(code)) return 'vision';
  if (/^201\d\d$/.test(code)) return 'special';
  if (/^20[23]\d\d$/.test(code)) return 'special-upgraded';
  if (/^3001[12]$/.test(code)) return 'speed-debuff';
  if (/^3002[12]$/.test(code)) return 'acceleration-debuff';
  if (/^3004[12]$/.test(code)) return 'rush-debuff';
  if (/^3005[12]$/.test(code)) return 'stamina-debuff';
  if (/^3007[12]$/.test(code)) return 'vision-debuff';
  if (code.startsWith('3')) return 'other-debuff';
  return 'special-upgraded';
}

export function buildWhiteFactorCatalog(): { categories: WhiteFactorCategory[]; factors: BrowseableFactor[] } {
  const categoryMap = new Map<string, WhiteFactorCategory>();
  const factors: BrowseableFactor[] = [];
  for (const factor of factorOptions('skills-races')) {
    const id = Number(factor.id);
    const icon = factorImage(id);
    const key = categoryKey(factor, icon);
    const metadata = categoryMetadata[key] ?? categoryMetadata['special-upgraded']!;
    const existing = categoryMap.get(key);
    if (existing) existing.factorCount += 1;
    else
      categoryMap.set(key, {
        key,
        ...metadata,
        icon: categoryIcons[key] ?? icon,
        factorCount: 1
      });
    factors.push({
      id,
      text: factor.text,
      categoryKey: key,
      icon,
      searchText: normalize(`${factor.text} ${metadata.label} ${metadata.detail}`)
    });
  }
  return {
    categories: [...categoryMap.values()].sort(
      (left, right) => left.order - right.order || left.label.localeCompare(right.label)
    ),
    factors: factors.sort((left, right) => left.text.localeCompare(right.text))
  };
}

export function matchWhiteFactors(
  factors: BrowseableFactor[],
  searchTerm: string,
  categoryKeys: string[],
  family: CategoryFamily | null
): BrowseableFactor[] {
  const search = normalize(searchTerm);
  return factors.filter((factor) => {
    const matchesCategory =
      categoryKeys.length === 0 ||
      categoryKeys.includes(factor.categoryKey) ||
      (factor.categoryKey === 'special-upgraded' && categoryKeys.includes('special'));
    const matchesFamily = !family || categoryMetadata[factor.categoryKey]?.family === family;
    return matchesFamily && matchesCategory && (!search || factor.searchText.includes(search));
  });
}
