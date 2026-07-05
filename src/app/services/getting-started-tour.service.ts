import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { IStepOption, TourService } from 'ngx-ui-tour-md-menu';
import { TourState } from 'ngx-ui-tour-core';
import { DomainStorageService } from './domain-storage.service';
import {
  PageTourIntroDialogComponent,
  PageTourIntroDialogData,
  PageTourIntroDialogResult
} from '../components/page-tour-intro-dialog/page-tour-intro-dialog.component';

export type PageTourId = 'home' | 'database' | 'clubs' | 'rankings' | 'activity' | 'tierlist' | 'tools' | 'timeline';
type TourPromptAudience = 'new' | 'existing';

interface PageTourDefinition {
  id: PageTourId;
  startStepId: string;
  routeMatches: (path: string) => boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GettingStartedTourService {
  private readonly pageIntroSeenKeyPrefix = 'page-introduction-seen-v1:';
  private readonly audienceKey = 'page-introduction-audience-v1';
  private readonly autoPromptDelayMs = 1800;
  private readonly blockedRetryDelayMs = 1000;
  private readonly establishedVisitorStorageKeys = [
    'auth_token',
    'cookie-consent',
    'privacy-notice-accepted',
    'lastSeenUpdateVersion',
    'database-filter-state-v2',
    'database-filter-mode-v1',
    'database-filter-presets-v1',
    'lineage-planner-state-v1',
    'lineage-planner-saves-v1',
    'manual-veteran-entries-v1',
    'partner-lookup-history-v1',
    'vote-protection-votes',
    'reported-trainers',
    'circle_details_config',
  ];
  private readonly establishedVisitorStoragePrefixes = [
    this.pageIntroSeenKeyPrefix,
    'resource-meta:',
    'umamoe-fuse-',
  ];
  private readonly interactionRequiredStepIds = new Set([
    'filter-add-factor',
    'filter-blue-factor-slider',
    'filter-limit-break',
  ]);
  private initialized = false;
  private autoStartTimer: ReturnType<typeof setTimeout> | null = null;
  private introDialogRef: MatDialogRef<PageTourIntroDialogComponent, PageTourIntroDialogResult> | null = null;
  private readonly pageTours: PageTourDefinition[] = [
    {
      id: 'home',
      startStepId: 'home-welcome',
      routeMatches: path => path === '/',
    },
    {
      id: 'database',
      startStepId: 'database-page',
      routeMatches: path => path.startsWith('/database'),
    },
    {
      id: 'clubs',
      startStepId: 'clubs-page',
      routeMatches: path => path === '/circles',
    },
    {
      id: 'rankings',
      startStepId: 'rankings-page',
      routeMatches: path => path === '/rankings',
    },
    {
      id: 'activity',
      startStepId: 'activity-page',
      routeMatches: path => path.startsWith('/activity'),
    },
    {
      id: 'tierlist',
      startStepId: 'tierlist-page',
      routeMatches: path => path === '/tierlist',
    },
    {
      id: 'tools',
      startStepId: 'tools-page',
      routeMatches: path => path === '/tools',
    },
    {
      id: 'timeline',
      startStepId: 'timeline-page',
      routeMatches: path => path === '/timeline',
    },
  ];
  private readonly introCopy: Record<PageTourId, PageTourIntroDialogData> = {
    home: {
      title: 'Welcome to uma.moe',
      content: 'Want a quick introduction to the main areas of the site?',
    },
    database: {
      title: 'Tour the Database?',
      content: 'Walk through filters, veterans, factor rows, sliders, include/exclude Umas, support cards, and results.',
    },
    clubs: {
      title: 'Tour Clubs?',
      content: 'See how to search clubs, read join-style filters, compare playstyles, and use the leaderboard.',
    },
    rankings: {
      title: 'Tour Rankings?',
      content: 'Get a short guide to ranking tabs, search, time controls, leaderboard rows, and pagination.',
    },
    activity: {
      title: 'Tour Activity Reports?',
      content: 'Review the page scope, filters, score bands, movement metrics, and report details.',
    },
    tierlist: {
      title: 'Tour Tierlists?',
      content: 'See how the legacy tierlist, limit-break selector, chart, tabs, rows, and notes fit together.',
    },
    tools: {
      title: 'Tour Tools?',
      content: 'Get a quick overview of the available tools and where the deeper helpers live.',
    },
    timeline: {
      title: 'Tour Timeline?',
      content: 'Learn how search, event-type filters, event cards, the timeline track, and the today marker work.',
    },
  };
  private readonly pageStepIds: Record<PageTourId, string[]> = {
    home: [
      'home-welcome',
      'home-database-link',
      'home-clubs-link',
      'home-rankings-link',
      'home-tierlist-link',
      'home-timeline-link',
      'home-tools-link',
      'home-stats',
    ],
    database: [
      'database-page',
      'add-trainer',
      'filter-open',
      'filter-modes',
      'filter-presets',
      'filter-affinity',
      'filter-target',
      'filter-veteran',
      'filter-add-factor',
      'filter-blue-factor-row',
      'filter-blue-factor-slider',
      'filter-star-range',
      'filter-support-card',
      'filter-limit-break',
      'filter-include-exclude',
      'filter-trainer-search',
      'filter-main-parent-factors',
      'filter-preferred-white',
      'filter-lineage-white',
      'filter-race-schedule',
      'tabs',
      'results',
    ],
    clubs: [
      'clubs-page',
      'clubs-search',
      'clubs-join-style',
      'clubs-playstyle',
      'clubs-live-refresh',
      'clubs-results-info',
      'clubs-results',
      'clubs-paginator',
    ],
    rankings: [
      'rankings-page',
      'rankings-tabs',
      'rankings-search',
      'rankings-time-controls',
      'rankings-results',
      'rankings-pagination',
    ],
    activity: [
      'activity-page',
      'activity-scope',
      'activity-search',
      'activity-sort',
      'activity-thresholds',
      'activity-meta',
      'activity-results',
      'activity-metrics',
      'activity-score',
      'activity-detail-link',
      'activity-paginator',
    ],
    tierlist: [
      'tierlist-page',
      'tierlist-legacy',
      'tierlist-lb',
      'tierlist-chart',
      'tierlist-tabs',
      'tierlist-rows',
      'tierlist-info',
    ],
    tools: [
      'tools-page',
      'tools-statistics',
      'tools-lineage',
      'tools-planned',
      'tools-site-stats',
    ],
    timeline: [
      'timeline-page',
      'timeline-search',
      'timeline-filter-types',
      'timeline-track',
      'timeline-event-card',
      'timeline-today',
    ],
  };

  constructor(
    private tourService: TourService,
    private router: Router,
    private domainStorage: DomainStorageService,
    private dialog: MatDialog,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  init(): void {
    if (!isPlatformBrowser(this.platformId) || this.initialized) {
      return;
    }

    this.initialized = true;
    this.configureTour();
    this.tourService.stepShow$.subscribe(({ step }) => {
      this.setCurrentTourStep(step.stepId);
      this.updateHotkeysForStep(step.stepId);
    });
    this.tourService.end$.subscribe(() => {
      this.clearCurrentTourStep();
      this.tourService.enableHotkeys();
    });

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.scheduleCurrentPagePrompt());

    this.scheduleCurrentPagePrompt();
  }

  start(): void {
    this.startPageTour('home');
  }

  startForCurrentPage(): void {
    this.closeIntroDialog();
    const pageTour = this.getCurrentPageTour();
    if (!pageTour) {
      this.configureTourForStepIds(['replay']);
      this.startAt('replay');
      return;
    }

    this.startPageTour(pageTour.id);
  }

  private startAt(stepId: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.init();
    if (this.tourService.getStatus() === TourState.ON) {
      return;
    }

    this.clearAutoStartTimer();
    this.tourService.startAt(stepId);
  }

  private startPageTour(pageTourId: PageTourId): void {
    const pageTour = this.pageTours.find(tour => tour.id === pageTourId);
    if (!pageTour) return;

    this.closeIntroDialog();
    this.markPageIntroductionSeen(pageTourId);
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.init();
    this.configureTourForStepIds(this.pageStepIds[pageTourId]);
    this.preparePageForTour(pageTourId);
    this.clearAutoStartTimer();
    this.tourService.startAt(pageTour.startStepId);
  }

  private configureTour(steps = this.getSteps()): void {
    this.tourService.initialize(steps, {
      enableBackdrop: true,
      backdropConfig: {
        offset: 8,
        zIndex: '990',
        backgroundColor: 'rgba(3, 7, 18, 0.64)',
      },
      delayAfterNavigation: 450,
      delayBeforeStepShow: 80,
      disablePageScrolling: true,
      duplicateAnchorHandling: 'registerLast',
      endBtnTitle: 'Done',
      nextBtnTitle: 'Next',
      prevBtnTitle: 'Back',
      popoverClass: 'umamoe-tour-step',
      showProgress: true,
      smoothScroll: true,
      stepDimensions: {
        minWidth: '280px',
        maxWidth: '410px',
      },
    });
  }

  private configureTourForStepIds(stepIds: string[]): void {
    const stepsById = new Map(this.getSteps().map(step => [step.stepId, step]));
    const steps = stepIds
      .map(stepId => stepsById.get(stepId))
      .filter((step): step is IStepOption => !!step);

    this.configureTour(steps);
  }

  private getSteps(): IStepOption[] {
    return [
      {
        stepId: 'home-welcome',
        anchorId: 'home-welcome',
        route: '/',
        title: 'Welcome to uma.moe',
        content: 'This is the main hub for the global Umamusume resources on the site.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 8000,
      },
      {
        stepId: 'home-database-link',
        anchorId: 'home-database-link',
        title: 'Database',
        content: 'Start here when you want to search inheritance parents, support cards, trainer IDs, veterans, and white-factor setups.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'home-clubs-link',
        anchorId: 'home-clubs-link',
        title: 'Clubs',
        content: 'Use Clubs to compare club rank, fan progress, join style, playstyle, and open spots.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'home-rankings-link',
        anchorId: 'home-rankings-link',
        title: 'Rankings',
        content: 'Rankings tracks trainers by monthly fans, all-time fans, and recent gains. Activity reports live nearby in the navigation for deeper movement checks.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'home-tierlist-link',
        anchorId: 'home-tierlist-link',
        title: 'Tierlists',
        content: 'Open Tierlists when you want a quick support-card strength comparison by type and limit break.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'home-timeline-link',
        anchorId: 'home-timeline-link',
        title: 'Timeline',
        content: 'Timeline shows predicted and confirmed global content releases, including banners, story events, campaigns, and race events.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'home-tools-link',
        anchorId: 'home-tools-link',
        title: 'Tools',
        content: 'Tools collects the more focused helpers, including statistics and Lineage Planner.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'home-stats',
        anchorId: 'home-stats',
        title: 'Site Activity',
        content: 'These counters show the current crawler/update activity and how much recent account data is available.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'database-page',
        anchorId: 'database-page',
        route: '/database',
        title: 'The Search Workspace',
        content: 'The Database is built around filters first, results second. Pick what your build needs, then sort the matching records by affinity, wins, white count, score, or recency.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 8000,
      },
      {
        stepId: 'add-trainer',
        anchorId: 'database-submit',
        title: 'Add Your Trainer ID',
        content: 'Use this when you want the site to fetch or refresh a trainer profile. Adding your own ID helps other players find your inheritance and support card.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-open',
        anchorId: 'filter-header',
        title: 'Open Filters First',
        content: 'Filters are the control panel for the database. This section can collapse, but the tour will open it while explaining the main controls.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-modes',
        anchorId: 'filter-modes',
        title: 'Basic, Advanced, and UQL',
        content: 'Basic covers common searches. Advanced adds include/exclude Uma filters, main-parent filters, race schedule filters, and deeper white-factor scoring. UQL is the text mode for exact reusable queries.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-presets',
        anchorId: 'filter-presets',
        title: 'Save Common Setups',
        content: 'Presets let you save a filter setup you use often, such as a target build, a support-card search, or a preferred white-factor priority list.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-affinity',
        anchorId: 'filter-affinity',
        title: 'Target and Veteran Context',
        content: 'Pick the target Uma you are training, then optionally pick one of your veterans as your own legacy. The database can use that context for affinity and inherited race/parent matching.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        delayBeforeStepShow: 360,
        isOptional: true,
      },
      {
        stepId: 'filter-target',
        anchorId: 'filter-target',
        title: 'Target (Ace)',
        content: 'The target is the Uma you are building. Setting it makes affinity sorting and highlighted compatibility much more useful than browsing without context.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-veteran',
        anchorId: 'filter-veteran',
        title: 'Your Legacy',
        content: 'A veteran is one of your trained legacy candidates. Selecting one tells the database what you already own, so it can search for good partners around that specific legacy.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-add-factor',
        anchorId: 'filter-add-factor',
        title: 'Add a Blue Factor',
        content: 'Click Add Blue Factor now. This creates a real filter row, so you can see what the database will search with.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        delayBeforeStepShow: 360,
        nextBtnTitle: 'Click Add Blue Factor',
        isOptional: true,
      },
      {
        stepId: 'filter-blue-factor-row',
        anchorId: 'filter-blue-factor-row',
        title: 'The Filter Row',
        content: 'This row is one condition. The dropdown chooses which blue stat to search for, the close button removes the row, and the slider below controls the star range.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        delayBeforeStepShow: 240,
      },
      {
        stepId: 'filter-blue-factor-slider',
        anchorId: 'filter-blue-factor-slider',
        title: 'Try the Star Range',
        content: 'Move either thumb on this slider. A narrow range is strict, while a wider range accepts more records. Moving it will continue the tour.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        nextBtnTitle: 'Move the slider',
      },
      {
        stepId: 'filter-star-range',
        anchorId: 'filter-star-range',
        title: 'Other Spark Filters',
        content: 'Pink aptitudes, green uniques, and white skills/races follow the same pattern: add a row, choose the factor, then set how strict the star requirement should be.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-support-card',
        anchorId: 'filter-support-card',
        title: 'Support Card Filter',
        content: 'Select a support card when you only want records from trainers offering that card. This is useful when the borrow target is the card, not only the inheritance parent.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-limit-break',
        anchorId: 'filter-limit-break',
        title: 'Minimum Limit Break',
        content: 'The LB slider sets the minimum support-card limit break. Try moving it now: LB0 shows any copy, LB3+ is stricter, and MLB only shows fully limit-broken cards.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        nextBtnTitle: 'Move the slider',
        isOptional: true,
      },
      {
        stepId: 'filter-include-exclude',
        anchorId: 'filter-include-exclude',
        title: 'Include or Exclude Umas',
        content: 'Advanced mode lets you allow or hide specific Umas in main-parent and great-parent positions. Use Allow when a build needs a certain parent, and Hide when you want to avoid a character family.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        delayBeforeStepShow: 360,
        isOptional: true,
      },
      {
        stepId: 'filter-trainer-search',
        anchorId: 'filter-trainer-search',
        title: 'Trainer Search',
        content: 'Use Trainer ID or Username when you want to inspect a specific account instead of searching the whole public database.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-main-parent-factors',
        anchorId: 'filter-main-parent-factors',
        title: 'Main Parent Filters',
        content: 'These filters look at the main parent candidate itself. Use them when the borrowed main parent needs its own stat, aptitude, unique, white factor count, or required white skill.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        delayBeforeStepShow: 360,
        isOptional: true,
      },
      {
        stepId: 'filter-preferred-white',
        anchorId: 'filter-preferred-white',
        title: 'Preferred White Factors',
        content: 'Preferred white factors are scoring helpers rather than hard requirements. Priority group 0 sorts first, then lower-priority groups break ties after that.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-lineage-white',
        anchorId: 'filter-lineage-white',
        title: 'Lineage White Factors',
        content: 'Lineage white filters look across the parent and grandparent stack. Use them when you care that a skill/race appears somewhere in the lineage, not only on the main parent.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'filter-race-schedule',
        anchorId: 'filter-race-schedule',
        title: 'Race Schedule Filter',
        content: 'Race schedule filters let you require parents that ran specific races. This is useful when a target build needs race affinity or inherited race history from a known schedule.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        delayBeforeStepShow: 360,
        isOptional: true,
      },
      {
        stepId: 'tabs',
        anchorId: 'database-tabs',
        title: 'Database and Bookmarks',
        content: 'Use Database for global search. Sign in to bookmark records you want to revisit, then filter those saved records here too.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'results',
        anchorId: 'database-results',
        title: 'Read the Results',
        content: 'Results update from the active filters. Sort the list and use the display toggles above it. Record cards show wins, factors, affinity context, support cards, and actions.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-page',
        anchorId: 'clubs-page',
        route: '/circles',
        title: 'Club Leaderboard',
        content: 'Use this page to find and compare clubs by rank, playstyle, join style, and open spots.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 8000,
      },
      {
        stepId: 'clubs-search',
        anchorId: 'clubs-search',
        title: 'Search Clubs',
        content: 'Search by club name or leader when you already know what you are looking for.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-join-style',
        anchorId: 'clubs-join-style',
        title: 'Join Style',
        content: 'Use these chips to switch between all clubs, auto-join clubs, manual-approval clubs, and clubs with open spots.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-playstyle',
        anchorId: 'clubs-playstyle',
        title: 'Playstyle Filters',
        content: 'Playstyle and policy filters help separate casual, semi-competitive, and stricter clubs before you open any details.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-live-refresh',
        anchorId: 'clubs-live-refresh',
        title: 'Live Refresh',
        content: 'When this bar appears, the top club data is being refreshed so ranks and fan movement stay current.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-results-info',
        anchorId: 'clubs-results-info',
        title: 'Filter Summary',
        content: 'This summary confirms which filters are active and how many clubs remain after applying them.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-results',
        anchorId: 'clubs-results',
        title: 'Club Cards',
        content: 'Each card shows rank movement, leader, member count, policy tags, and fan totals. Open a club for more detail.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'clubs-paginator',
        anchorId: 'clubs-paginator',
        title: 'More Clubs',
        content: 'Use pagination after narrowing the list; it keeps the page fast while still letting you browse beyond the first set of matches.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'rankings-page',
        anchorId: 'rankings-page',
        route: '/rankings',
        title: 'Trainer Rankings',
        content: 'Rankings compares trainers by monthly fans, all-time totals, and recent gains.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
      },
      {
        stepId: 'rankings-tabs',
        anchorId: 'rankings-tabs',
        title: 'Ranking Views',
        content: 'Switch between monthly rankings, all-time totals, and gain-focused leaderboards.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'rankings-search',
        anchorId: 'rankings-search',
        title: 'Find Trainers',
        content: 'Search for a trainer, viewer ID, or club name to jump straight to the part of the leaderboard you care about.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'rankings-time-controls',
        anchorId: 'rankings-time-controls',
        title: 'Month and Sort Controls',
        content: 'These controls change with the active tab. Monthly rankings use month selection, while gains views can focus on different movement windows.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'rankings-results',
        anchorId: 'rankings-results',
        title: 'Ranking Rows',
        content: 'Rows show rank, trainer identity, club, fan totals, gains, and daily averages depending on the active tab.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'rankings-pagination',
        anchorId: 'rankings-pagination',
        title: 'Leaderboard Pages',
        content: 'Use pagination to move through the leaderboard after the active filters and tab have narrowed the result set.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-page',
        anchorId: 'activity-page',
        route: '/activity',
        title: 'Activity Reports',
        content: 'Activity reconstructs account movement from observed club snapshots. It is meant for spotting unusual patterns, not declaring proof.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
      },
      {
        stepId: 'activity-scope',
        anchorId: 'activity-scope',
        title: 'Read the Scope First',
        content: 'This notice explains the limits of the data: scores are based on periodic snapshots, so context matters.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-search',
        anchorId: 'activity-search',
        title: 'Search Reports',
        content: 'Search by trainer name or ID when you want to inspect a specific account instead of browsing the full activity list.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-sort',
        anchorId: 'activity-sort',
        title: 'Sort the Reports',
        content: 'Sort changes which accounts rise to the top, such as highest score, strongest gains, or other activity-focused views.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-thresholds',
        anchorId: 'activity-thresholds',
        title: 'Observed Days',
        content: 'Require more observed days when you want steadier signals and less noise from accounts with only a small snapshot history.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-meta',
        anchorId: 'activity-meta',
        title: 'List Summary',
        content: 'The summary tells you how many reports match the current controls before you start reading individual rows.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-results',
        anchorId: 'activity-results',
        title: 'Activity Rows',
        content: 'Rows summarize fan gain, active time, careers per hour, reasons, and the score band. Open a report for details.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-metrics',
        anchorId: 'activity-metrics',
        title: 'Movement Metrics',
        content: 'These metrics show the observed fan gain, active time, and pace signals that feed the report.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-score',
        anchorId: 'activity-score',
        title: 'Score Band',
        content: 'The score is a triage signal based on observed movement. It should point you toward rows worth reviewing, not replace context.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-detail-link',
        anchorId: 'activity-detail-link',
        title: 'Open Details',
        content: 'Open a report when you want the longer explanation and supporting observations behind the summary row.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'activity-paginator',
        anchorId: 'activity-paginator',
        title: 'More Reports',
        content: 'Pagination keeps the report list usable once the filters produce more rows than fit comfortably on one page.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tierlist-page',
        anchorId: 'tierlist-page',
        route: '/tierlist',
        title: 'Support Card Tierlist',
        content: 'This legacy tierlist compares support-card strength by type and limit-break level.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
      },
      {
        stepId: 'tierlist-legacy',
        anchorId: 'tierlist-legacy',
        title: 'Legacy Reference',
        content: 'This banner marks the tierlist as an older reference. It is still useful for quick comparisons, but newer tools may give more context.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tierlist-lb',
        anchorId: 'tierlist-lb',
        title: 'Limit Break Level',
        content: 'Change the LB level here to compare cards at different investment points.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tierlist-rows',
        anchorId: 'tierlist-rows',
        title: 'Tier Rows',
        content: 'The rows group cards by tier for the selected type and limit-break level. Use the chart above for shape, then rows for the card list.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tierlist-info',
        anchorId: 'tierlist-info',
        title: 'Reading Notes',
        content: 'This section explains what the tierlist is based on and the assumptions behind the ranking.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tierlist-chart',
        anchorId: 'tierlist-chart',
        title: 'Power Chart',
        content: 'The chart gives a quick visual comparison of cards in the selected type and LB level.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tierlist-tabs',
        anchorId: 'tierlist-tabs',
        title: 'Support Types',
        content: 'Use the tabs to switch between support-card types and inspect the tier rows below.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tools-page',
        anchorId: 'tools-page',
        route: '/tools',
        title: 'Tools and Calculators',
        content: 'This page collects standalone helpers like statistics and Lineage Planner.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
      },
      {
        stepId: 'tools-statistics',
        anchorId: 'tools-statistics',
        title: 'Statistics',
        content: 'Open statistics when you want chart-heavy views and broader site data analysis.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tools-lineage',
        anchorId: 'tools-lineage',
        title: 'Lineage Planner',
        content: 'Use Lineage Planner to design and compare a full inheritance tree before searching for exact database records.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tools-planned',
        anchorId: 'tools-planned',
        title: 'Planned Tools',
        content: 'Disabled tiles mark tools that are planned but not live yet, so the page can show what is coming without sending you to an unfinished view.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'tools-site-stats',
        anchorId: 'tools-site-stats',
        title: 'Site Activity',
        content: 'These counters mirror the main page and give a quick read on update volume and recent account coverage.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'timeline-page',
        anchorId: 'timeline-page',
        route: '/timeline',
        title: 'Timeline',
        content: 'Timeline tracks estimated global releases, banners, story events, campaigns, and other scheduled content.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
      },
      {
        stepId: 'timeline-search',
        anchorId: 'timeline-search',
        title: 'Search the Timeline',
        content: 'Search for a character, support card, or event name. Search navigation appears when there are matching timeline entries.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'timeline-filter-types',
        anchorId: 'timeline-filter-types',
        title: 'Event Type Filters',
        content: 'Toggle event families when you only want to see banners, support cards, story events, campaigns, Champions Meeting, Legend Races, or paid banners.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'timeline-track',
        anchorId: 'timeline-track',
        title: 'Timeline Track',
        content: 'Use the track to read the release schedule. On desktop you can drag or scroll horizontally; on mobile the same events appear as a vertical feed.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'timeline-event-card',
        anchorId: 'timeline-event-card',
        title: 'Event Cards',
        content: 'Cards show the event family, predicted date, related characters or supports, and links or prediction details when available.',
        placement: { xPosition: 'after', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'timeline-today',
        anchorId: 'timeline-today',
        title: 'Today Marker',
        content: 'The today marker shows where the current date lands against the predicted schedule.',
        placement: { xPosition: 'after', yPosition: 'above' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
      {
        stepId: 'replay',
        anchorId: 'nav-tour',
        title: 'Come Back Anytime',
        content: 'Use this help button to restart the tour whenever you want the guided version again.',
        placement: { xPosition: 'before', yPosition: 'below' },
        isAsync: true,
        asyncStepTimeout: 5000,
        isOptional: true,
      },
    ];
  }

  private scheduleCurrentPagePrompt(delayMs = this.autoPromptDelayMs): void {
    this.clearAutoStartTimer();
    const pageTour = this.getCurrentPageTour();

    if (!pageTour || !this.shouldOfferPagePrompt(pageTour.id) || this.tourService.getStatus() === TourState.ON || this.introDialogRef) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.autoStartTimer = setTimeout(() => {
        this.zone.run(() => this.tryOpenCurrentPagePrompt());
      }, delayMs);
    });
  }

  private tryOpenCurrentPagePrompt(): void {
    this.autoStartTimer = null;
    const pageTour = this.getCurrentPageTour();

    if (!pageTour || !this.shouldOfferPagePrompt(pageTour.id) || this.tourService.getStatus() === TourState.ON || this.introDialogRef) {
      return;
    }

    if (this.hasBlockingOverlay()) {
      this.scheduleCurrentPagePrompt(this.blockedRetryDelayMs);
      return;
    }

    this.openIntroDialog(pageTour);
  }

  private clearAutoStartTimer(): void {
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }
  }

  private getPath(url = this.router.url): string {
    const path = url.split(/[?#]/)[0] || '/';
    return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  }

  private getCurrentPageTour(): PageTourDefinition | null {
    const path = this.getPath();
    return this.pageTours.find(tour => tour.routeMatches(path)) ?? null;
  }

  private hasBlockingOverlay(): boolean {
    return !!document.querySelector('.mat-mdc-dialog-container');
  }

  private openIntroDialog(pageTour: PageTourDefinition): void {
    const dialogRef = this.dialog.open<PageTourIntroDialogComponent, PageTourIntroDialogData, PageTourIntroDialogResult>(
      PageTourIntroDialogComponent,
      {
        autoFocus: false,
        data: this.introCopy[pageTour.id],
        maxWidth: 'calc(100vw - 32px)',
        panelClass: 'tour-intro-dialog-panel',
        restoreFocus: true,
        width: '390px',
      },
    );

    this.introDialogRef = dialogRef;
    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      if (this.introDialogRef === dialogRef) {
        this.introDialogRef = null;
      }

      this.markPageIntroductionSeen(pageTour.id);

      if (result === 'start' && this.getCurrentPageTour()?.id === pageTour.id) {
        this.startPageTour(pageTour.id);
      }
    });
  }

  private closeIntroDialog(): void {
    if (!this.introDialogRef) {
      return;
    }

    const dialogRef = this.introDialogRef;
    this.introDialogRef = null;
    dialogRef.close();
  }

  private preparePageForTour(pageTourId: PageTourId): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (pageTourId === 'timeline') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      window.dispatchEvent(new CustomEvent('umamoe:prepare-timeline-tour'));
    }
  }

  private setCurrentTourStep(stepId: string | undefined): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (stepId) {
      document.body.dataset['tourStepId'] = stepId;
    } else {
      this.clearCurrentTourStep();
    }
  }

  private clearCurrentTourStep(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    delete document.body.dataset['tourStepId'];
  }

  private updateHotkeysForStep(stepId: string | undefined): void {
    if (stepId && this.interactionRequiredStepIds.has(stepId)) {
      this.tourService.disableHotkeys();
      return;
    }

    this.tourService.enableHotkeys();
  }

  private shouldOfferPagePrompt(pageTourId: PageTourId): boolean {
    return this.getAutoPromptAudience() === 'new' && !this.hasSeenPageIntroduction(pageTourId);
  }

  private getAutoPromptAudience(): TourPromptAudience {
    const stored = this.domainStorage.getItem(this.audienceKey);
    if (stored === 'new' || stored === 'existing') {
      return stored;
    }

    const audience: TourPromptAudience = this.hasEstablishedVisitorSignals() ? 'existing' : 'new';
    this.domainStorage.setItem(this.audienceKey, audience);
    return audience;
  }

  private hasEstablishedVisitorSignals(): boolean {
    if (!isPlatformBrowser(this.platformId) || typeof localStorage === 'undefined') {
      return false;
    }

    try {
      if (this.establishedVisitorStorageKeys.some(key => localStorage.getItem(key) !== null)) {
        return true;
      }

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && this.establishedVisitorStoragePrefixes.some(prefix => key.startsWith(prefix))) {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  private hasSeenPageIntroduction(pageTourId: PageTourId): boolean {
    return this.domainStorage.getItem(`${this.pageIntroSeenKeyPrefix}${pageTourId}`) === 'true';
  }

  private markPageIntroductionSeen(pageTourId: PageTourId): void {
    this.domainStorage.setItem(`${this.pageIntroSeenKeyPrefix}${pageTourId}`, 'true');
  }
}
