export type RaceGrade = 'G1' | 'G2' | 'G3' | 'OP' | 'Pre-OP';
export interface RaceBadgeData {
  id: string;
  name: string;
  shortName?: string;
  grade: RaceGrade;
  image?: string;
  placement?: number;
  affinityGain?: number;
  selected?: boolean;
}

export interface RaceScheduleSlot {
  id: string;
  label: string;
  races: RaceBadgeData[];
}

export interface RaceScheduleYear {
  id: string;
  label: string;
  slots: RaceScheduleSlot[];
}
