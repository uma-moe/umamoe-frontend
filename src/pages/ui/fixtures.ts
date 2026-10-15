import type { OptimalRaceRecommendation } from '@/lib/catalog/race-catalog';
import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
import type { LineageBranch, LineageNodeData } from '@/components/lineage/lineage-types';
import type { RaceScheduleYear } from '@/components/game/race-types';
import oguriCapImage from './fixtures/oguri-cap.webp';
import mejiroMcQueenImage from './fixtures/mejiro-mcqueen.webp';
import kitasanBlackImage from './fixtures/kitasan-black.webp';
import kitasanBlackSupportImage from './fixtures/kitasan-black-support.webp';
import skillSpeedIcon from './fixtures/skill-speed.webp';
import skillRecoveryIcon from './fixtures/skill-recovery.webp';
import caratIcon from './fixtures/item-carats.webp';
import raceImageG1 from '@/assets/images/race-thumbnails/thum_race_rt_000_1001_00.webp';
import raceImageG2 from '@/assets/images/race-thumbnails/thum_race_rt_000_2001_00.webp';
import raceImageG3 from '@/assets/images/race-thumbnails/thum_race_rt_000_3001_00.webp';
import supportCardSpeed from './fixtures/support-card-speed.webp';
import supportCardStamina from './fixtures/support-card-stamina.webp';
import supportCardPower from './fixtures/support-card-power.webp';
import timelineBanner from './fixtures/timeline-support-banner.webp';
export { oguriCapImage, mejiroMcQueenImage, kitasanBlackImage, skillSpeedIcon, skillRecoveryIcon, raceImageG1, raceImageG2, raceImageG3 };
export const blueSparks = [
    { id: 'speed', name: 'Speed', level: 3, chance: '10%', source: 'main' as const },
    { id: 'stamina', name: 'Stamina', level: 2, chance: '5%', source: 'parent' as const }
  ];
export const pinkSparks = [{ id: 'long', name: 'Long', level: 3, chance: '10%', source: 'main' as const }];
export const greenSparks = [{ id: 'unique', name: 'The View from the Lead Is Mine!', level: 2, source: 'parent' as const }];
export const whiteSparks = [{ id: 'maestro', name: 'Swinging Maestro', level: 2, chance: '5%', source: 'p2' as const }];
export const aptitudeFixtures = [
    { id: 'turf', group: 'Surface', label: 'Turf', grade: 'A' as const },
    { id: 'dirt', group: 'Surface', label: 'Dirt', grade: 'G' as const },
    { id: 'sprint', group: 'Distance', label: 'Sprint', grade: 'F' as const },
    { id: 'mile', group: 'Distance', label: 'Mile', grade: 'F' as const },
    { id: 'medium', group: 'Distance', label: 'Medium', grade: 'A' as const },
    { id: 'long', group: 'Distance', label: 'Long', grade: 'S' as const },
    { id: 'runner', group: 'Style', label: 'Runner', grade: 'B' as const },
    { id: 'leader', group: 'Style', label: 'Leader', grade: 'A' as const },
    { id: 'betweener', group: 'Style', label: 'Betweener', grade: 'D' as const },
    { id: 'chaser', group: 'Style', label: 'Chaser', grade: 'F' as const }
  ];
export const statFixtures = [
    { id: 'speed', label: 'Speed', value: 1542, tone: 'speed' as const, icon: '/assets/images/icon/stats/speed.webp' },
    { id: 'stamina', label: 'Stamina', value: 1312, tone: 'stamina' as const, icon: '/assets/images/icon/stats/stamina.webp' },
    { id: 'power', label: 'Power', value: 1184, tone: 'power' as const, icon: '/assets/images/icon/stats/power.webp' },
    { id: 'guts', label: 'Guts', value: 702, tone: 'guts' as const, icon: '/assets/images/icon/stats/guts.webp' },
    { id: 'wit', label: 'Wit', value: 1138, tone: 'wit' as const, icon: '/assets/images/icon/stats/wit.webp' }
  ];
export const veteranFixture: VeteranUiRecord = {
    id: 'veteran-mcqueen', name: 'Mejiro McQueen', image: mejiroMcQueenImage, rank: 'UE1', score: 29412,
    scenario: 'Grand Masters', detail: 'Long · Leader', workspace: 'Local', updated: '4 min ago', affinity: 83, raceAffinity: 18,
    stats: statFixtures, aptitudes: aptitudeFixtures, sparks: [
      { tone: 'blue', items: blueSparks }, { tone: 'pink', items: pinkSparks }, { tone: 'green', items: greenSparks }, { tone: 'white', items: whiteSparks }
    ],
    parents: [
      { id: 'parent-oguri', position: 'P1', name: 'Oguri Cap', image: oguriCapImage, affinity: 42, sparks: [{ tone: 'blue', items: blueSparks.slice(0, 1) }, { tone: 'green', items: greenSparks }] },
      { id: 'parent-kitasan', position: 'P2', name: 'Kitasan Black', image: kitasanBlackImage, affinity: 38, sparks: [{ tone: 'pink', items: pinkSparks }, { tone: 'white', items: whiteSparks }] }
    ]
  };
export const lineageRoot: LineageNodeData = { id: 'lineage-main', name: 'Mejiro McQueen', image: mejiroMcQueenImage, rank: 'UE1', role: 'main', roleLabel: 'Main', affinity: 83, raceAffinity: 18, sparks: [{ tone: 'blue', items: blueSparks.slice(0, 1) }] };
export const lineageBranches: LineageBranch[] = [
    { id: 'lineage-p1', parent: { id: 'lineage-oguri', name: 'Oguri Cap', image: oguriCapImage, rank: 'UF4', role: 'parent', roleLabel: 'P1', affinity: 42 }, grandparents: [
      { id: 'lineage-oguri-gp1', name: 'Kitasan Black', image: kitasanBlackImage, rank: 'UF8', role: 'grandparent', roleLabel: 'P1 legacy 1', affinity: 24 },
      { id: 'lineage-oguri-gp2', name: 'Mejiro McQueen', image: mejiroMcQueenImage, rank: 'UG8', role: 'grandparent', roleLabel: 'P1 legacy 2', affinity: 18 }
    ]},
    { id: 'lineage-p2', parent: { id: 'lineage-kitasan', name: 'Kitasan Black', image: kitasanBlackImage, rank: 'UF8', role: 'parent', roleLabel: 'P2', affinity: 38 }, grandparents: [
      { id: 'lineage-kita-gp1', name: 'Mejiro McQueen', image: mejiroMcQueenImage, rank: 'UE0', role: 'grandparent', roleLabel: 'P2 legacy 1', affinity: 21 },
      { id: 'lineage-kita-gp2', name: 'Oguri Cap', image: oguriCapImage, rank: 'UG9', role: 'grandparent', roleLabel: 'P2 legacy 2', affinity: 17 }
    ]}
  ];
export const raceYears: RaceScheduleYear[] = [
    { id: 'junior', label: 'Junior Year', slots: [
      { id: 'junior-12-2', label: 'Late Dec', races: [{ id: 'hopeful', name: 'Hopeful Stakes', shortName: 'Hopeful S.', grade: 'G1', image: raceImageG1, placement: 1, selected: true }] },
      { id: 'junior-11-2', label: 'Late Nov', races: [{ id: 'kyoto-junior', name: 'Kyoto Junior Stakes', shortName: 'Kyoto Junior', grade: 'G3', image: raceImageG3, placement: 2 }] }
    ]},
    { id: 'classic', label: 'Classic Year', slots: [
      { id: 'classic-4-1', label: 'Early Apr', races: [{ id: 'satsuki', name: 'Satsuki Sho', shortName: 'Satsuki Sho', grade: 'G1', image: raceImageG1, affinityGain: 3 }] },
      { id: 'classic-9-2', label: 'Late Sep', races: [{ id: 'kobe', name: 'Kobe Shimbun Hai', shortName: 'Kobe Shimbun', grade: 'G2', image: raceImageG2, affinityGain: 2 }] }
    ]},
    { id: 'senior', label: 'Senior Year', slots: [
      { id: 'senior-4-2', label: 'Late Apr', races: [{ id: 'tenno-spring', name: 'Tenno Sho Spring', shortName: 'Tenno Sho', grade: 'G1', image: raceImageG1, placement: 1 }] },
      { id: 'senior-12-2', label: 'Late Dec', races: [{ id: 'arima', name: 'Arima Kinen', shortName: 'Arima Kinen', grade: 'G1', image: raceImageG1, selected: true }] }
    ]}
  ];
export const characterPickerOptions = [
    { id: 'mcqueen', name: 'Mejiro McQueen', image: mejiroMcQueenImage, subtitle: 'Long · Leader', affinity: 83 },
    { id: 'oguri', name: 'Oguri Cap', image: oguriCapImage, subtitle: 'Mile · Betweener', affinity: 72 },
    { id: 'kitasan', name: 'Kitasan Black', image: kitasanBlackImage, subtitle: 'Medium · Runner', affinity: 68 }
  ];
export const supportCardOptions = [
    { id: 'support-speed', title: 'Fire at My Heels', character: 'Kitasan Black', image: supportCardSpeed, type: 'Speed' as const, rarity: 'SSR' as const },
    { id: 'support-stamina', title: 'A Long-Awaited Chance', character: 'Mejiro McQueen', image: supportCardStamina, type: 'Stamina' as const, rarity: 'SSR' as const },
    { id: 'support-power', title: 'Get Lots of Hugs for Me', character: 'Oguri Cap', image: supportCardPower, type: 'Power' as const, rarity: 'SR' as const }
  ];
export const timelineEvent = {
    id: 'timeline-support-2022-30137', eventType: 'support_card_banner', title: 'Story Event Support Card Scout', typeLabel: 'Support Card Scout', dateLabel: 'Aug 29 – Sep 11', context: 'Global', image: timelineBanner, rerun: true, canPlan: true,
    rewards: [{ id: 'carats', label: 'Carats', amount: '×1,500', icon: caratIcon }],
    pickups: [{ id: 'support', name: 'Kitasan Black support card', image: kitasanBlackSupportImage, gametoraUrl: 'https://gametora.com/umamusume/supports/30028-kitasan-black', kind: 'support' as const }, { id: 'mcqueen', name: 'Mejiro McQueen', image: mejiroMcQueenImage, gametoraUrl: 'https://gametora.com/umamusume/characters/101301-mejiro-mcqueen', kind: 'character' as const }]
  };
export const optimalRaces: OptimalRaceRecommendation[] = [
  { groupId: 1, saddleId: 16, raceInstanceId: 1, name: 'Satsuki Sho', shortName: 'Satsuki Sho', scheduleLabel: 'Classic Apr Early', year: 'classic', month: 4, half: 1, image: raceImageG1, grade: 'G1', overlapsP1: true, overlapsP2: true, overlapCount: 2, affinityGain: 6 },
  { groupId: 2, saddleId: 20, raceInstanceId: 2, name: 'Arima Kinen', shortName: 'Arima Kinen', scheduleLabel: 'Senior Dec Late', year: 'senior', month: 12, half: 2, image: raceImageG1, grade: 'G1', overlapsP1: true, overlapsP2: false, overlapCount: 1, affinityGain: 3 }
];
