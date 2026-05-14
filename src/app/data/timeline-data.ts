// Timeline data
// This file contains all timeline event information bundled with the application
// Data is imported at build time, so it doesn't appear in network requests
import characterBannersData from '../../data/character_banners.json';
import supportBannersData from '../../data/supports_banners.json';
import paidBannersData from '../../data/paid_gacha_banners.json';
import storyEventsData from '../../data/story_events.json';
import championsMeetingData from '../../data/champions_meeting.json';
import legendRacesData from '../../data/legend_races.json';
import campaignsData from '../../data/campaigns.json';
// Import types from timeline model
import { 
  CharacterBanner, 
  SupportBanner, 
  PaidBanner, 
  StoryEvent, 
  ChampionsMeeting, 
  LegendRace,
  Campaign 
} from '../models/timeline.model';
// Export all data with proper typing
export const CHARACTER_BANNERS: CharacterBanner[] = characterBannersData as CharacterBanner[];
export const SUPPORT_BANNERS: SupportBanner[] = supportBannersData as SupportBanner[];
export const PAID_BANNERS: PaidBanner[] = paidBannersData as PaidBanner[];
export const STORY_EVENTS: StoryEvent[] = normalizeArray<StoryEvent>(storyEventsData);
export const CHAMPIONS_MEETINGS: ChampionsMeeting[] = normalizeArray<ChampionsMeeting>(championsMeetingData);
export const LEGEND_RACES: LegendRace[] = normalizeArray<LegendRace>(legendRacesData);
export const CAMPAIGNS: Campaign[] = normalizeArray<Campaign>(campaignsData);

function normalizeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  const defaultData = (data as any)?.default;
  return Array.isArray(defaultData) ? defaultData as T[] : [];
}

function replaceArray<T>(target: T[], data: unknown): T[] {
  target.splice(0, target.length, ...normalizeArray<T>(data));
  return target;
}

export function replaceStoryEventsData(data: unknown): StoryEvent[] {
  return replaceArray(STORY_EVENTS, data);
}

export function replaceChampionsMeetingsData(data: unknown): ChampionsMeeting[] {
  return replaceArray(CHAMPIONS_MEETINGS, data);
}

export function replaceLegendRacesData(data: unknown): LegendRace[] {
  return replaceArray(LEGEND_RACES, data);
}

export function replaceCampaignsData(data: unknown): Campaign[] {
  return replaceArray(CAMPAIGNS, data);
}
// Export getters for convenience
export function getAllCharacterBanners(): CharacterBanner[] {
  return CHARACTER_BANNERS;
}
export function getAllSupportBanners(): SupportBanner[] {
  return SUPPORT_BANNERS;
}
export function getAllPaidBanners(): PaidBanner[] {
  return PAID_BANNERS;
}
export function getAllStoryEvents(): StoryEvent[] {
  return STORY_EVENTS;
}
export function getAllChampionsMeetings(): ChampionsMeeting[] {
  return CHAMPIONS_MEETINGS;
}
export function getAllLegendRaces(): LegendRace[] {
  return LEGEND_RACES;
}
export function getAllCampaigns(): Campaign[] {
  return CAMPAIGNS;
}

export function getAllTimelineData() {
  return {
    characterBanners: CHARACTER_BANNERS,
    supportBanners: SUPPORT_BANNERS,
    paidBanners: PAID_BANNERS,
    storyEvents: STORY_EVENTS,
    championsMeetings: CHAMPIONS_MEETINGS,
    legendRaces: LEGEND_RACES,
    campaigns: CAMPAIGNS
  };
}
