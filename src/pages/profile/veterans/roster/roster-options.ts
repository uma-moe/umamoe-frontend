import { getRankInfoFromLabel, rankIconPath } from '@/lib/rank';
import type { AncestorScope, VeteranSortField } from '@/lib/profile/veterans/profile-veterans';

export type StatField = 'speed' | 'stamina' | 'power' | 'guts' | 'wiz';

export type CollectionSortField =
  VeteranSortField | 'affinity' | 'white_count' | 'white_stars_sum' | 'win_count';

export type MetricSortField = 'affinity' | 'white_count' | 'white_stars_sum' | 'win_count';

export type AptitudeField =
  | 'proper_ground_turf'
  | 'proper_ground_dirt'
  | 'proper_distance_short'
  | 'proper_distance_mile'
  | 'proper_distance_middle'
  | 'proper_distance_long'
  | 'proper_running_style_nige'
  | 'proper_running_style_senko'
  | 'proper_running_style_sashi'
  | 'proper_running_style_oikomi';

export type FilterTabId =
  'stats' | 'aptitudes' | 'skills' | 'parents' | 'saddle' | 'database' | 'uql';

export interface FilterTab {
  id: FilterTabId;
  icon: 'gauge' | 'compass' | 'book' | 'users' | 'calendar' | 'database' | 'tune';
  label: string;
  help: string;
}

export const statFields: Array<{
  id: StatField;
  label: string;
  tone: 'blue' | 'coral' | 'orange' | 'pink' | 'teal';
}> = [
  { id: 'speed', label: 'Speed', tone: 'blue' },
  { id: 'stamina', label: 'Stamina', tone: 'coral' },
  { id: 'power', label: 'Power', tone: 'orange' },
  { id: 'guts', label: 'Guts', tone: 'pink' },
  { id: 'wiz', label: 'Wit', tone: 'teal' }
];

export const aptitudeFields: Array<{ id: AptitudeField; label: string; group: string }> = [
  { id: 'proper_ground_turf', label: 'Turf', group: 'Track' },
  { id: 'proper_ground_dirt', label: 'Dirt', group: 'Track' },
  { id: 'proper_distance_short', label: 'Sprint', group: 'Distance' },
  { id: 'proper_distance_mile', label: 'Mile', group: 'Distance' },
  { id: 'proper_distance_middle', label: 'Medium', group: 'Distance' },
  { id: 'proper_distance_long', label: 'Long', group: 'Distance' },
  { id: 'proper_running_style_nige', label: 'Front', group: 'Style' },
  { id: 'proper_running_style_senko', label: 'Pace', group: 'Style' },
  { id: 'proper_running_style_sashi', label: 'Late', group: 'Style' },
  { id: 'proper_running_style_oikomi', label: 'End', group: 'Style' }
];

export const gradeOptions = [
  { value: '', label: 'Any' },
  ...['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((value) => ({
    value,
    label: value === 'S' ? 'S' : `${value}+`,
    image: rankIconPath(getRankInfoFromLabel(value).iconIndex)
  }))
];

export const sortOptions: Array<{ value: string; label: string }> = [
  { value: 'total', label: 'Total Stats' },
  { value: 'rank_score', label: 'Rank Score' },
  { value: 'speed', label: 'Speed' },
  { value: 'stamina', label: 'Stamina' },
  { value: 'power', label: 'Power' },
  { value: 'guts', label: 'Guts' },
  { value: 'wiz', label: 'Wiz' },
  { value: 'blue', label: 'Blue Stars' },
  { value: 'pink', label: 'Pink Stars' },
  { value: 'green', label: 'Green Stars' },
  { value: 'white_count', label: 'White Spark Count' },
  { value: 'white_stars_sum', label: 'Total White Stars' },
  { value: 'win_count', label: 'G1 Wins' },
  { value: 'creation_time', label: 'Date Trained' },
  { value: 'affinity', label: 'Affinity' },
  { value: 'name', label: 'Name' }
];

export const distanceOptions = [
  { value: '', label: 'Any distance' },
  { value: '1', label: 'Sprint' },
  { value: '2', label: 'Mile' },
  { value: '3', label: 'Medium' },
  { value: '4', label: 'Long' },
  { value: '5', label: 'Dirt' }
];

export const styleOptions = [
  { value: '', label: 'Any style' },
  { value: '1', label: 'Front' },
  { value: '2', label: 'Pace' },
  { value: '3', label: 'Late' },
  { value: '4', label: 'End' }
];

export const allDistances = distanceOptions
    .filter((option) => option.value)
    .map((option) => option.value),
  allStyles = styleOptions.filter((option) => option.value).map((option) => option.value);

export const moodOptions = [
  { value: '2', label: 'Great (+4%)' },
  { value: '1', label: 'Good (+2%)' },
  { value: '0', label: 'Normal' },
  { value: '-1', label: 'Bad (−2%)' },
  { value: '-2', label: 'Awful (−4%)' }
];

export const scopeLabels = {
  p1: 'P1 only',
  p2: 'P2 only',
  any: 'Any generation',
  family: 'Veteran + parents',
  parent: 'Veteran',
  grandparent: 'Parents',
  greatgrandparent: 'Grandparents'
};

export const generations: Array<{ scope: AncestorScope; label: string }> = [
  { scope: 'parent', label: 'This veteran' },
  { scope: 'grandparent', label: 'Parents' },
  { scope: 'greatgrandparent', label: 'Grandparents' }
];

export const filterTabs: FilterTab[] = [
  {
    id: 'stats',
    icon: 'gauge',
    label: 'Stats & SP',
    help: 'Displayed stats. Drag either end to set a range.'
  },
  {
    id: 'aptitudes',
    icon: 'compass',
    label: 'Aptitudes',
    help: 'Match this grade or higher.'
  },
  {
    id: 'skills',
    icon: 'book',
    label: 'Learned skills',
    help: 'Veterans must have every selected skill.'
  },
  { id: 'parents', icon: 'users', label: 'Include / Exclude Umas', help: '' },
  {
    id: 'saddle',
    icon: 'calendar',
    label: 'Race wins',
    help: 'A parent or grandparent must have won any selected race.'
  },
  { id: 'database', icon: 'database', label: 'Inheritance totals', help: '' },
  { id: 'uql', icon: 'tune', label: 'Advanced', help: '' }
];

export const sparkCategories = [
  { value: '0', label: 'Blue stats', tone: 'blue' },
  { value: '1', label: 'Aptitude', tone: 'pink' },
  { value: '5', label: 'Unique', tone: 'green' },
  { value: 'white', label: 'Skill / race', tone: 'white' }
];

export function isMetricSort(field: CollectionSortField): field is MetricSortField {
  return (
    field === 'affinity' ||
    field === 'white_count' ||
    field === 'white_stars_sum' ||
    field === 'win_count'
  );
}

export const toggleChoice = (choices: string[], value: string) =>
  choices.includes(value)
    ? choices.filter((choice) => choice !== value)
    : [...choices, value].sort();

export const rangeMarks = (low: number, high: number) => [
  ...new Set([low, Math.round((low + high) / 100) * 50, high])
];

export function statIcon(field: StatField): string {
  return '/assets/images/icon/stats/' + (field === 'wiz' ? 'wit' : field) + '.webp';
}
