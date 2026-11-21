import { scenarioLogo } from '@/lib/game-assets/art-links';

export interface Scenario {
  id: number;
  /** The name the global client uses, or the best-known English name for scenarios it has not released. */
  label: string;
  /** Older and Japanese-era names that queries written before the rename still use. */
  aliases?: string[];
  image: string;
  width: number;
  height: number;
  viewBox: string;
}

export const scenarios: Scenario[] = [
  // View boxes exclude transparent asset padding so logos share a visible height.
  {
    id: 1,
    label: 'URA Finale',
    aliases: ['URA Finals', 'URA'],
    image: scenarioLogo(1),
    width: 1052,
    height: 886,
    viewBox: '20 0 986 866'
  },
  {
    id: 2,
    label: 'Unity Cup',
    aliases: ['Aoharu', 'Aoharu Cup'],
    image: scenarioLogo(2),
    width: 673,
    height: 368,
    viewBox: '12 13 638 333'
  },
  {
    id: 3,
    label: 'Grand Concert',
    aliases: ['Grand Live', 'GL'],
    image: scenarioLogo(3),
    width: 512,
    height: 512,
    viewBox: '24 70 461 372'
  },
  {
    id: 4,
    label: 'Trackblazer',
    aliases: ['MANT', 'Make a New Track'],
    image: scenarioLogo(4),
    width: 750,
    height: 450,
    viewBox: '62 22 629 393'
  },
  {
    id: 5,
    label: 'Grandmasters',
    aliases: ['Grand Masters'],
    image: scenarioLogo(5),
    width: 916,
    height: 730,
    viewBox: '8 70 904 571'
  },
  {
    id: 6,
    label: 'Project L’Arc',
    aliases: ['LArc', "L'Arc"],
    image: scenarioLogo(6),
    width: 826,
    height: 516,
    viewBox: '4 11 818 495'
  },
  {
    id: 7,
    label: 'U.A.F.',
    aliases: ['UAF'],
    image: scenarioLogo(7),
    width: 893,
    height: 576,
    viewBox: '2 53 893 462'
  },
  {
    id: 8,
    label: 'Great Food Festival',
    image: scenarioLogo(8),
    width: 916,
    height: 730,
    viewBox: '46 126 826 485'
  },
  {
    id: 9,
    label: 'Run! Mecha Umamusume',
    image: scenarioLogo(9),
    width: 1158,
    height: 647,
    viewBox: '11 0 1127 619'
  },
  {
    id: 10,
    label: 'The Twinkle Legends',
    image: scenarioLogo(10),
    width: 682,
    height: 410,
    viewBox: '0 0 682 410'
  },
  {
    id: 11,
    label: 'Design Your Island',
    image: scenarioLogo(11),
    width: 1388,
    height: 814,
    viewBox: '7 4 1372 803'
  },
  {
    id: 12,
    label: 'The Everlasting Yukoma Hot Springs',
    image: scenarioLogo(12),
    width: 512,
    height: 408,
    viewBox: '2 47 506 310'
  },
  {
    id: 13,
    label: 'Beyond Dreams',
    image: scenarioLogo(13),
    width: 512,
    height: 408,
    viewBox: '0 68 512 288'
  }
];

/** The scenario's display name, or undefined for an id this list does not know yet. */
export function scenarioLabel(id: number): string | undefined {
  return scenarios.find((scenario) => scenario.id === id)?.label;
}
