import ura from '@/assets/images/scenario/ura_finals_logo.webp';
import unity from '@/assets/images/scenario/scenario_logo_002.webp';
import grandConcert from '@/assets/images/scenario/grand_concert_logo.webp';
import trackblazer from '@/assets/images/scenario/scenario_logo_004.webp';
import grandMasters from '@/assets/images/scenario/scenario_logo_005.webp';
import larc from '@/assets/images/scenario/scenario_logo_006.webp';
import uaf from '@/assets/images/scenario/scenario_logo_007.webp';
import food from '@/assets/images/scenario/scenario_logo_008.webp';
import mecha from '@/assets/images/scenario/scenario_logo_009.webp';
import legends from '@/assets/images/scenario/scenario_logo_010.webp';
import island from '@/assets/images/scenario/scenario_logo_011.webp';
import yukoma from '@/assets/images/scenario/scenario_logo_012.webp';
import dreams from '@/assets/images/scenario/scenario_logo_013.webp';

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
    image: ura,
    width: 1052,
    height: 886,
    viewBox: '20 0 986 866'
  },
  {
    id: 2,
    label: 'Unity Cup',
    aliases: ['Aoharu', 'Aoharu Cup'],
    image: unity,
    width: 673,
    height: 368,
    viewBox: '12 13 638 333'
  },
  {
    id: 3,
    label: 'Grand Concert',
    aliases: ['Grand Live', 'GL'],
    image: grandConcert,
    width: 512,
    height: 512,
    viewBox: '24 70 461 372'
  },
  {
    id: 4,
    label: 'Trackblazer',
    aliases: ['MANT', 'Make a New Track'],
    image: trackblazer,
    width: 750,
    height: 450,
    viewBox: '62 22 629 393'
  },
  {
    id: 5,
    label: 'Grandmasters',
    aliases: ['Grand Masters'],
    image: grandMasters,
    width: 916,
    height: 730,
    viewBox: '8 70 904 571'
  },
  {
    id: 6,
    label: 'Project L’Arc',
    aliases: ['LArc', "L'Arc"],
    image: larc,
    width: 826,
    height: 516,
    viewBox: '4 11 818 495'
  },
  {
    id: 7,
    label: 'U.A.F.',
    aliases: ['UAF'],
    image: uaf,
    width: 893,
    height: 576,
    viewBox: '2 53 893 462'
  },
  {
    id: 8,
    label: 'Great Food Festival',
    image: food,
    width: 916,
    height: 730,
    viewBox: '46 126 826 485'
  },
  {
    id: 9,
    label: 'Run! Mecha Umamusume',
    image: mecha,
    width: 1158,
    height: 647,
    viewBox: '11 0 1127 619'
  },
  {
    id: 10,
    label: 'The Twinkle Legends',
    image: legends,
    width: 682,
    height: 410,
    viewBox: '0 0 682 410'
  },
  {
    id: 11,
    label: 'Design Your Island',
    image: island,
    width: 1388,
    height: 814,
    viewBox: '7 4 1372 803'
  },
  {
    id: 12,
    label: 'The Everlasting Yukoma Hot Springs',
    image: yukoma,
    width: 512,
    height: 408,
    viewBox: '2 47 506 310'
  },
  {
    id: 13,
    label: 'Beyond Dreams',
    image: dreams,
    width: 512,
    height: 408,
    viewBox: '0 68 512 288'
  }
];

/** The scenario's display name, or undefined for an id this list does not know yet. */
export function scenarioLabel(id: number): string | undefined {
  return scenarios.find((scenario) => scenario.id === id)?.label;
}
