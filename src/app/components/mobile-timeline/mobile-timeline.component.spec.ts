import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { EventType, TimelineEvent } from '../../models/timeline.model';
import { MobileTimelineComponent } from './mobile-timeline.component';

describe('MobileTimelineComponent filters', () => {
  function createComponent(): MobileTimelineComponent {
    const changeDetector = {
      detectChanges: jasmine.createSpy('detectChanges')
    } as unknown as ChangeDetectorRef;

    return new MobileTimelineComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      changeDetector,
      new ElementRef(document.createElement('app-mobile-timeline')),
      {} as never
    );
  }

  function event(id: string, type: EventType): TimelineEvent {
    return {
      id,
      type,
      title: id,
      jpReleaseDate: new Date('2026-01-01T03:00:00Z'),
      globalReleaseDate: new Date('2026-01-01T22:00:00Z'),
      isConfirmed: true
    };
  }

  it('removes deselected character and support banners from the mobile timeline', () => {
    const component = createComponent();
    component.timelineEvents = [
      event('character', EventType.CHARACTER_BANNER),
      event('support', EventType.SUPPORT_CARD_BANNER),
      event('story', EventType.STORY_EVENT)
    ];

    component.toggleCharacterFilter();
    component.toggleSupportFilter();

    expect(component.eventFilters.showCharacters).toBeFalse();
    expect(component.eventFilters.showSupports).toBeFalse();
    expect(component.getFilteredEventCount()).toBe(1);
    expect(component.timelineItems.some(item => item.eventData?.type === EventType.CHARACTER_BANNER)).toBeFalse();
    expect(component.timelineItems.some(item => item.eventData?.type === EventType.SUPPORT_CARD_BANNER)).toBeFalse();
  });

  it('toggles every mobile event-type filter before rebuilding the timeline', () => {
    const component = createComponent();
    const generateTimelineItems = spyOn<any>(component, 'generateTimelineItems');

    component.toggleStoryEventsFilter();
    component.toggleChampionsMeetingsFilter();
    component.toggleLegendRacesFilter();
    component.togglePaidBannersFilter();
    component.toggleCampaignsFilter();
    component.toggleLeagueOfHeroesFilter();
    component.toggleMastersChallengeFilter();
    component.toggleTrainerSkillsTestFilter();
    component.toggleFactorResearchFilter();
    component.toggleStrongestTeamFilter();
    component.toggleRacingCarnivalFilter();
    component.toggleScenarioReleasesFilter();

    expect(component.eventFilters.showStoryEvents).toBeFalse();
    expect(component.eventFilters.showChampionsMeetings).toBeFalse();
    expect(component.eventFilters.showLegendRaces).toBeFalse();
    expect(component.eventFilters.showPaidBanners).toBeFalse();
    expect(component.eventFilters.showCampaigns).toBeFalse();
    expect(component.eventFilters.showLeagueOfHeroes).toBeFalse();
    expect(component.eventFilters.showMastersChallenge).toBeFalse();
    expect(component.eventFilters.showTrainerSkillsTest).toBeFalse();
    expect(component.eventFilters.showFactorResearch).toBeFalse();
    expect(component.eventFilters.showStrongestTeam).toBeFalse();
    expect(component.eventFilters.showRacingCarnival).toBeFalse();
    expect(component.eventFilters.showScenarioReleases).toBeFalse();
    expect(generateTimelineItems).toHaveBeenCalledTimes(12);
  });
});
