// Angular's getting-started-tour.service.ts is authoritative for copy and order.
// Selectors point at the existing page composition; tours never own feature markup.
export interface TourStep {
  stepId: string;
  anchorId: string;
  selector: string;
  title: string;
  content: string;
  route?: string;
  placement: { xPosition: 'before' | 'after'; yPosition: 'above' | 'below' };
  asyncStepTimeout?: number;
  isOptional?: boolean;
  delayBeforeStepShow?: number;
  nextBtnTitle?: string;
}

export const introCopy = {
  home: {
    title: 'Welcome to uma.moe',
    content: 'Want a quick introduction to the main areas of the site?'
  },
  database: {
    title: 'Tour the Database?',
    content:
      'Walk through filters, veterans, factor rows, include/exclude tools, result display controls, sorting, and lineage cards.'
  },
  clubs: {
    title: 'Tour Clubs?',
    content:
      'See how to search clubs, read join-style filters, compare playstyles, and use the leaderboard.'
  },
  rankings: {
    title: 'Tour Rankings?',
    content:
      'Get a short guide to ranking tabs, search, time controls, leaderboard rows, and pagination.'
  },
  activity: {
    title: 'Tour Activity Reports?',
    content: 'Review the page scope, filters, score bands, movement metrics, and report details.'
  },
  tierlist: {
    title: 'Tour Tierlists?',
    content:
      'See how the legacy tierlist, limit-break selector, chart, tabs, rows, and notes fit together.'
  },
  tools: {
    title: 'Tour Tools?',
    content: 'Get a quick overview of the available tools and where the deeper helpers live.'
  },
  timeline: {
    title: 'Tour Timeline?',
    content:
      'See the redesigned timeline views, date spacing, search, filters, event cards, and Carat Planner handoff.'
  },
  'carat-planner': {
    title: 'Tour Carat Planner?',
    content:
      'Learn how plans, starting resources, projected income, rewards, banner targets, and pull odds work together.'
  }
};

export type PageTourId = keyof typeof introCopy;
export const pageStepIds: Record<PageTourId, string[]> = {
  home: [
    'home-welcome',
    'home-database-link',
    'home-clubs-link',
    'home-rankings-link',
    'home-tierlist-link',
    'home-timeline-link',
    'home-tools-link',
    'home-stats'
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
    'database-focus-controls',
    'database-hide-sparks',
    'database-split-sparks',
    'database-list-mode',
    'database-sort',
    'database-result-card'
  ],
  clubs: [
    'clubs-page',
    'clubs-search',
    'clubs-join-style',
    'clubs-playstyle',
    'clubs-live-refresh',
    'clubs-results-info',
    'clubs-results',
    'clubs-paginator'
  ],
  rankings: [
    'rankings-page',
    'rankings-tabs',
    'rankings-search',
    'rankings-time-controls',
    'rankings-results',
    'rankings-pagination'
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
    'activity-paginator'
  ],
  tierlist: [
    'tierlist-page',
    'tierlist-legacy',
    'tierlist-lb',
    'tierlist-chart',
    'tierlist-tabs',
    'tierlist-rows',
    'tierlist-info'
  ],
  tools: ['tools-page', 'tools-statistics', 'tools-lineage', 'tools-planned', 'tools-site-stats'],
  timeline: [
    'timeline-page',
    'timeline-tabs',
    'timeline-search',
    'timeline-view-switch',
    'timeline-spacing',
    'timeline-today-action',
    'timeline-filters',
    'timeline-filter-types',
    'timeline-track',
    'timeline-event-card',
    'timeline-today'
  ],
  'carat-planner': [
    'carat-planner-page',
    'carat-planner-plans',
    'carat-planner-search',
    'carat-planner-summary',
    'carat-planner-assumptions',
    'carat-planner-targets'
  ]
};

export const tourSteps: TourStep[] = [
  {
    stepId: 'home-welcome',
    anchorId: 'home-welcome',
    route: '/',
    title: 'Welcome to uma.moe',
    content: 'This is the main hub for the global Umamusume resources on the site.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 8000,
    selector: '.home .hero-content'
  },
  {
    stepId: 'home-database-link',
    anchorId: 'home-database-link',
    title: 'Database',
    content:
      'Start here when you want to search inheritance parents, support cards, trainer IDs, veterans, and white-factor setups.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home a[href="/database"]'
  },
  {
    stepId: 'home-clubs-link',
    anchorId: 'home-clubs-link',
    title: 'Clubs',
    content: 'Use Clubs to compare club rank, fan progress, join style, playstyle, and open spots.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home a[href="/circles"]'
  },
  {
    stepId: 'home-rankings-link',
    anchorId: 'home-rankings-link',
    title: 'Rankings',
    content:
      'Rankings tracks trainers by monthly fans, all-time fans, and recent gains. Activity reports live nearby in the navigation for deeper movement checks.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home a[href="/rankings"]'
  },
  {
    stepId: 'home-tierlist-link',
    anchorId: 'home-tierlist-link',
    title: 'Tierlists',
    content:
      'Open Tierlists when you want a quick support-card strength comparison by type and limit break.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home a[href="/tierlist"]'
  },
  {
    stepId: 'home-timeline-link',
    anchorId: 'home-timeline-link',
    title: 'Timeline',
    content:
      'Timeline shows predicted and confirmed global content releases, including banners, story events, campaigns, and race events.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home a[href="/timeline"]'
  },
  {
    stepId: 'home-tools-link',
    anchorId: 'home-tools-link',
    title: 'Tools',
    content: 'Tools collects the more focused helpers, including statistics and Lineage Planner.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home a[href="/tools"]'
  },
  {
    stepId: 'home-stats',
    anchorId: 'home-stats',
    title: 'Site Activity',
    content:
      'These counters show the current crawler/update activity and how much recent account data is available.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.home .stats'
  },
  {
    stepId: 'database-page',
    anchorId: 'database-page',
    route: '/database',
    title: 'The Search Workspace',
    content:
      'The Database is built around filters first, results second. Pick what your build needs, then sort the matching records by affinity, wins, white count, score, or recency.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 8000,
    selector: '.inheritance-database .page-heading'
  },
  {
    stepId: 'add-trainer',
    anchorId: 'database-submit',
    title: 'Add Your Trainer ID',
    content:
      'Use this when you want the site to fetch or refresh a trainer profile. Adding your own ID helps other players find your inheritance and support card.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.inheritance-database .page-actions'
  },
  {
    stepId: 'filter-open',
    anchorId: 'filter-header',
    title: 'Open Filters First',
    content:
      'Filters are the control panel for the database. This section can collapse, but the tour will open it while explaining the main controls.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.filter-shell > header'
  },
  {
    stepId: 'filter-modes',
    anchorId: 'filter-modes',
    title: 'Basic, Advanced, and UQL',
    content:
      'Basic covers common searches. Advanced adds include/exclude Uma filters, main-parent filters, race schedule filters, and deeper white-factor scoring. UQL is the text mode for exact reusable queries.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.filter-tools [role="radiogroup"]'
  },
  {
    stepId: 'filter-presets',
    anchorId: 'filter-presets',
    title: 'Save Common Setups',
    content:
      'Presets let you save a filter setup you use often, such as a target build, a support-card search, or a preferred white-factor priority list.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.filter-tools .presets'
  },
  {
    stepId: 'filter-affinity',
    anchorId: 'filter-affinity',
    title: 'Target and Veteran Context',
    content:
      'Pick the target Uma you are training, then optionally pick one of your veterans as your own legacy. The database can use that context for affinity and inherited race/parent matching.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    delayBeforeStepShow: 360,
    isOptional: true,
    selector: '.affinity-tree'
  },
  {
    stepId: 'filter-target',
    anchorId: 'filter-target',
    title: 'Target (Ace)',
    content:
      'The target is the Uma you are building. Setting it makes affinity sorting and highlighted compatibility much more useful than browsing without context.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tree-group--target'
  },
  {
    stepId: 'filter-veteran',
    anchorId: 'filter-veteran',
    title: 'Your Legacy',
    content:
      'A veteran is one of your trained legacy candidates. Selecting one tells the database what you already own, so it can search for good partners around that specific legacy.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tree-group--veteran'
  },
  {
    stepId: 'filter-add-factor',
    anchorId: 'filter-add-factor',
    title: 'Add a Blue Factor',
    content:
      'Click Add Blue Factor now. This creates a real filter row, so you can see what the database will search with.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    delayBeforeStepShow: 360,
    nextBtnTitle: 'Click Add Blue Factor',
    isOptional: true,
    selector: '#blue-factors .add-row'
  },
  {
    stepId: 'filter-blue-factor-row',
    anchorId: 'filter-blue-factor-row',
    title: 'The Filter Row',
    content:
      'This row is one condition. The dropdown chooses which blue stat to search for, the close button removes the row, and the slider below controls the star range.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    delayBeforeStepShow: 240,
    selector: '#blue-factors .requirements > .requirement:last-of-type'
  },
  {
    stepId: 'filter-blue-factor-slider',
    anchorId: 'filter-blue-factor-slider',
    title: 'Try the Star Range',
    content:
      'Move either thumb on this slider. A narrow range is strict, while a wider range accepts more records. Moving it will continue the tour.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    nextBtnTitle: 'Move the slider',
    selector: '#blue-factors .requirements > .requirement:last-of-type .factor-range'
  },
  {
    stepId: 'filter-star-range',
    anchorId: 'filter-star-range',
    title: 'Other Spark Filters',
    content:
      'Pink aptitudes, green uniques, and white skills/races follow the same pattern: add a row, choose the factor, then set how strict the star requirement should be.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#blue-factors'
  },
  {
    stepId: 'filter-support-card',
    anchorId: 'filter-support-card',
    title: 'Support Card Filter',
    content:
      'Select a support card when you only want records from trainers offering that card. This is useful when the borrow target is the card, not only the inheritance parent.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.property-grid.basic .support-lb-inline > .support-picker'
  },
  {
    stepId: 'filter-limit-break',
    anchorId: 'filter-limit-break',
    title: 'Minimum Limit Break',
    content:
      'The LB slider sets the minimum support-card limit break. Try moving it now: LB0 shows any copy, LB3+ is stricter, and MLB only shows fully limit-broken cards.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    nextBtnTitle: 'Move the slider',
    isOptional: true,
    selector: '.property-grid.basic .lb-control'
  },
  {
    stepId: 'filter-include-exclude',
    anchorId: 'filter-include-exclude',
    title: 'Include or Exclude Umas',
    content:
      'Advanced mode lets you allow or hide specific Umas in main-parent and great-parent positions. Use Allow when a build needs a certain parent, and Hide when you want to avoid a character family.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    delayBeforeStepShow: 360,
    isOptional: true,
    selector: '.legacy-quick'
  },
  {
    stepId: 'filter-trainer-search',
    anchorId: 'filter-trainer-search',
    title: 'Trainer Search',
    content:
      'Use Trainer ID or Username when you want to inspect a specific account instead of searching the whole public database.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.search-quick'
  },
  {
    stepId: 'filter-main-parent-factors',
    anchorId: 'filter-main-parent-factors',
    title: 'Main Parent Filters',
    content:
      'These filters look at the main parent candidate itself. Use them when the borrowed main parent needs its own stat, aptitude, unique, white factor count, or required white skill.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    delayBeforeStepShow: 360,
    isOptional: true,
    selector: '[data-filter-group="main"]'
  },
  {
    stepId: 'filter-preferred-white',
    anchorId: 'filter-preferred-white',
    title: 'Preferred White Factors',
    content:
      'Preferred white factors are scoring helpers rather than hard requirements. Priority group 0 sorts first, then lower-priority groups break ties after that.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#optional-white'
  },
  {
    stepId: 'filter-lineage-white',
    anchorId: 'filter-lineage-white',
    title: 'Lineage White Factors',
    content:
      'Lineage white filters look across the parent and grandparent stack. Use them when you care that a skill/race appears somewhere in the lineage, not only on the main parent.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#lineage-white'
  },
  {
    stepId: 'filter-race-schedule',
    anchorId: 'filter-race-schedule',
    title: 'Race Schedule Filter',
    content:
      'Race schedule filters let you require parents that ran specific races. This is useful when a target build needs race affinity or inherited race history from a known schedule.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    delayBeforeStepShow: 360,
    isOptional: true,
    selector: '[data-filter-group="races"]'
  },
  {
    stepId: 'tabs',
    anchorId: 'database-tabs',
    title: 'Database and Bookmarks',
    content:
      'Use Database for global search. Sign in to bookmark records you want to revisit, then filter those saved records here too.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.database-tabs'
  },
  {
    stepId: 'results',
    anchorId: 'database-results',
    title: 'Results Workspace',
    content:
      'Results update from the active filters. The toolbar controls how every matching lineage is presented before you inspect individual cards.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.inheritance-results .results-header'
  },
  {
    stepId: 'database-focus-controls',
    anchorId: 'database-focus-controls',
    title: 'Focus the Lineage',
    content:
      'Keep All selected for the combined lineage, or focus every result on the main parent or either great parent. Portrait clicks can still override one card locally.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.inheritance-results .focus-control'
  },
  {
    stepId: 'database-hide-sparks',
    anchorId: 'database-hide-sparks',
    title: 'Hide Distracting Sparks',
    content:
      'Choose common, scenario, or race sparks you do not want to see. Hidden choices are remembered and can be revealed or restored later.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector:
      ".inheritance-results button[aria-label='Choose sparks to hide'], .inheritance-results button[aria-label^='Hide sparks,']"
  },
  {
    stepId: 'database-split-sparks',
    anchorId: 'database-split-sparks',
    title: 'Combined or Split Sparks',
    content:
      'Combined view groups matching sparks across the lineage. Split view keeps each parent contribution separate when you need to inspect the exact source.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#spark-display'
  },
  {
    stepId: 'database-list-mode',
    anchorId: 'database-list-mode',
    title: 'Infinite Scroll or Pages',
    content:
      'Use infinite scrolling for browsing, or switch to pages when you want stable navigation through a larger result set.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector:
      ".inheritance-results button[aria-label='Infinite'], .inheritance-results button[aria-label='Pages']"
  },
  {
    stepId: 'database-sort',
    anchorId: 'database-sort',
    title: 'Sort What Matters',
    content:
      'Sort by affinity, wins, spark totals, score, recency, or trending activity. Preferred white-factor groups remain the first ranking layer when configured.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#database-sort'
  },
  {
    stepId: 'database-result-card',
    anchorId: 'database-result-card',
    title: 'Read a Lineage Card',
    content:
      'Cards combine trainer details, affinity, races, support cards, and sparks. Spark controls switch between per-inheritance or per-run chances and between total stars or lineage occurrences. You can also save the record or open it in Lineage Planner.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.inheritance-list > :first-child'
  },
  {
    stepId: 'clubs-page',
    anchorId: 'clubs-page',
    route: '/circles',
    title: 'Club Leaderboard',
    content:
      'Use this page to find and compare clubs by rank, playstyle, join style, and open spots.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 8000,
    selector: '[data-route-id="clubs"] .page-heading > div'
  },
  {
    stepId: 'clubs-search',
    anchorId: 'clubs-search',
    title: 'Search Clubs',
    content: 'Search by club name or leader when you already know what you are looking for.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="clubs"] .search-row'
  },
  {
    stepId: 'clubs-join-style',
    anchorId: 'clubs-join-style',
    title: 'Join Style',
    content:
      'Use these chips to switch between all clubs, auto-join clubs, manual-approval clubs, and clubs with open spots.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="clubs"] .filter-chips'
  },
  {
    stepId: 'clubs-playstyle',
    anchorId: 'clubs-playstyle',
    title: 'Playstyle Filters',
    content:
      'Playstyle and policy filters help separate casual, semi-competitive, and stricter clubs before you open any details.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="clubs"] .filter-dropdown'
  },
  {
    stepId: 'clubs-live-refresh',
    anchorId: 'clubs-live-refresh',
    title: 'Live Refresh',
    content:
      'When this bar appears, the top club data is being refreshed so ranks and fan movement stay current.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.live-refresh-bar'
  },
  {
    stepId: 'clubs-results-info',
    anchorId: 'clubs-results-info',
    title: 'Filter Summary',
    content:
      'This summary confirms which filters are active and how many clubs remain after applying them.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.results-heading'
  },
  {
    stepId: 'clubs-results',
    anchorId: 'clubs-results',
    title: 'Club Cards',
    content:
      'Each card shows rank movement, leader, member count, policy tags, and fan totals. Open a club for more detail.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.club-list'
  },
  {
    stepId: 'clubs-paginator',
    anchorId: 'clubs-paginator',
    title: 'More Clubs',
    content:
      'Use pagination after narrowing the list; it keeps the page fast while still letting you browse beyond the first set of matches.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="clubs"] .mat-paginator'
  },
  {
    stepId: 'rankings-page',
    anchorId: 'rankings-page',
    route: '/rankings',
    title: 'Trainer Rankings',
    content: 'Rankings compares trainers by monthly fans, all-time totals, and recent gains.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    selector: '[data-route-id="rankings"] .page-heading > div'
  },
  {
    stepId: 'rankings-tabs',
    anchorId: 'rankings-tabs',
    title: 'Ranking Views',
    content: 'Switch between monthly rankings, all-time totals, and gain-focused leaderboards.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="rankings"] [role="tablist"]'
  },
  {
    stepId: 'rankings-search',
    anchorId: 'rankings-search',
    title: 'Find Trainers',
    content:
      'Search for a trainer, viewer ID, or club name to jump straight to the part of the leaderboard you care about.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="rankings"] .search'
  },
  {
    stepId: 'rankings-time-controls',
    anchorId: 'rankings-time-controls',
    title: 'Month and Sort Controls',
    content:
      'These controls change with the active tab. Monthly rankings use month selection, while gains views can focus on different movement windows.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.period-filters'
  },
  {
    stepId: 'rankings-results',
    anchorId: 'rankings-results',
    title: 'Ranking Rows',
    content:
      'Rows show rank, trainer identity, club, fan totals, gains, and daily averages depending on the active tab.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="rankings"] .leaderboard'
  },
  {
    stepId: 'rankings-pagination',
    anchorId: 'rankings-pagination',
    title: 'Leaderboard Pages',
    content:
      'Use pagination to move through the leaderboard after the active filters and tab have narrowed the result set.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="rankings"] .mat-paginator'
  },
  {
    stepId: 'activity-page',
    anchorId: 'activity-page',
    route: '/activity',
    title: 'Activity Reports',
    content:
      'Activity reconstructs account movement from observed club snapshots. It is meant for spotting unusual patterns, not declaring proof.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    selector: '[data-route-id="activity"] .page-heading > div'
  },
  {
    stepId: 'activity-scope',
    anchorId: 'activity-scope',
    title: 'Read the Scope First',
    content:
      'This notice explains the limits of the data: scores are based on periodic snapshots, so context matters.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="activity"] .banner'
  },
  {
    stepId: 'activity-search',
    anchorId: 'activity-search',
    title: 'Search Reports',
    content:
      'Search by trainer name or ID when you want to inspect a specific account instead of browsing the full activity list.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="activity"] .filters > .field'
  },
  {
    stepId: 'activity-sort',
    anchorId: 'activity-sort',
    title: 'Sort the Reports',
    content:
      'Sort changes which accounts rise to the top, such as highest score, strongest gains, or other activity-focused views.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#activity-sort'
  },
  {
    stepId: 'activity-thresholds',
    anchorId: 'activity-thresholds',
    title: 'Observed Days',
    content:
      'Require more observed days when you want steadier signals and less noise from accounts with only a small snapshot history.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '#activity-days'
  },
  {
    stepId: 'activity-meta',
    anchorId: 'activity-meta',
    title: 'List Summary',
    content:
      'The summary tells you how many reports match the current controls before you start reading individual rows.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.list-meta'
  },
  {
    stepId: 'activity-results',
    anchorId: 'activity-results',
    title: 'Activity Rows',
    content:
      'Rows summarize fan gain, active time, careers per hour, reasons, and the score band. Open a report for details.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.activity-list'
  },
  {
    stepId: 'activity-metrics',
    anchorId: 'activity-metrics',
    title: 'Movement Metrics',
    content:
      'These metrics show the observed fan gain, active time, and pace signals that feed the report.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.activity-row:first-child > dl'
  },
  {
    stepId: 'activity-score',
    anchorId: 'activity-score',
    title: 'Score Band',
    content:
      'The score is a triage signal based on observed movement. It should point you toward rows worth reviewing, not replace context.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.activity-row:first-child .row-score'
  },
  {
    stepId: 'activity-detail-link',
    anchorId: 'activity-detail-link',
    title: 'Open Details',
    content:
      'Open a report when you want the longer explanation and supporting observations behind the summary row.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.activity-row:first-child .open'
  },
  {
    stepId: 'activity-paginator',
    anchorId: 'activity-paginator',
    title: 'More Reports',
    content:
      'Pagination keeps the report list usable once the filters produce more rows than fit comfortably on one page.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id="activity"] .pager'
  },
  {
    stepId: 'tierlist-page',
    anchorId: 'tierlist-page',
    route: '/tierlist',
    title: 'Support Card Tierlist',
    content: 'This legacy tierlist compares support-card strength by type and limit-break level.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    selector: '.tierlist-page .page-heading'
  },
  {
    stepId: 'tierlist-legacy',
    anchorId: 'tierlist-legacy',
    title: 'Legacy Reference',
    content:
      'This banner marks the tierlist as an older reference. It is still useful for quick comparisons, but newer tools may give more context.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.legacy-banner'
  },
  {
    stepId: 'tierlist-lb',
    anchorId: 'tierlist-lb',
    title: 'Limit Break Level',
    content: 'Change the LB level here to compare cards at different investment points.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tierlist-page .lb-control'
  },
  {
    stepId: 'tierlist-rows',
    anchorId: 'tierlist-rows',
    title: 'Tier Rows',
    content:
      'The rows group cards by tier for the selected type and limit-break level. Use the chart above for shape, then rows for the card list.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tier-content .tierlist'
  },
  {
    stepId: 'tierlist-info',
    anchorId: 'tierlist-info',
    title: 'Reading Notes',
    content:
      'This section explains what the tierlist is based on and the assumptions behind the ranking.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tier-info'
  },
  {
    stepId: 'tierlist-chart',
    anchorId: 'tierlist-chart',
    title: 'Power Chart',
    content:
      'The chart gives a quick visual comparison of cards in the selected type and LB level.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tier-content .chart'
  },
  {
    stepId: 'tierlist-tabs',
    anchorId: 'tierlist-tabs',
    title: 'Support Types',
    content: 'Use the tabs to switch between support-card types and inspect the tier rows below.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.type-tabs'
  },
  {
    stepId: 'tools-page',
    anchorId: 'tools-page',
    route: '/tools',
    title: 'Tools and Calculators',
    content: 'This page collects standalone helpers like statistics and Lineage Planner.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    selector: '[data-route-id=tools] .hero-content'
  },
  {
    stepId: 'tools-statistics',
    anchorId: 'tools-statistics',
    title: 'Statistics',
    content: 'Open statistics when you want chart-heavy views and broader site data analysis.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id=tools] a[href="/tools/statistics"]'
  },
  {
    stepId: 'tools-lineage',
    anchorId: 'tools-lineage',
    title: 'Lineage Planner',
    content:
      'Use Lineage Planner to design and compare a full inheritance tree before searching for exact database records.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id=tools] a[href="/tools/lineage-planner"]'
  },
  {
    stepId: 'tools-planned',
    anchorId: 'tools-planned',
    title: 'Planned Tools',
    content:
      'Disabled tiles mark tools that are planned but not live yet, so the page can show what is coming without sending you to an unfinished view.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-route-id=tools] .quick-link.disabled'
  },
  {
    stepId: 'tools-site-stats',
    anchorId: 'tools-site-stats',
    title: 'Site Activity',
    content:
      'These counters mirror the main page and give a quick read on update volume and recent account coverage.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.tools .stats'
  },
  {
    stepId: 'timeline-page',
    anchorId: 'timeline-page',
    route: '/timeline?tab=timeline',
    title: 'The Release Timeline',
    content:
      'The redesigned Timeline combines confirmed and predicted global banners, story events, campaigns, races, scenarios, and other scheduled content in one date-based view.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 8000,
    selector: '[data-route-id="timeline"] .page-sections'
  },
  {
    stepId: 'timeline-tabs',
    anchorId: 'timeline-tabs',
    title: 'Timeline and Carat Planner',
    content:
      'Use these tabs to move between release research and your saved pull plans. Eligible banner cards can be sent straight from the Timeline into Carat Planner.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.timeline-tabs'
  },
  {
    stepId: 'timeline-search',
    anchorId: 'timeline-search',
    title: 'Search the Timeline',
    content:
      'Search for characters, support cards, banners, or event names. Desktop arrow controls move between matches; mobile keeps search inside the filter sheet.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-timeline-control="search"]'
  },
  {
    stepId: 'timeline-view-switch',
    anchorId: 'timeline-view-switch',
    title: 'Choose a Desktop View',
    content:
      'Horizontal view emphasizes the release sequence and supports dragging or scrolling. Vertical view groups the same dates into a more traditional feed.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.toolbar .view .segments'
  },
  {
    stepId: 'timeline-spacing',
    anchorId: 'timeline-spacing',
    title: 'Compact or Calendar Gaps',
    content:
      'Compact gaps keep releases close together. Calendar gaps use elapsed time, making long quiet periods visibly wider in the horizontal view.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-timeline-control="spacing"]'
  },
  {
    stepId: 'timeline-today-action',
    anchorId: 'timeline-today-action',
    title: 'Return to Today',
    content:
      'Jump back to the current date after exploring older or upcoming releases. The action is also pinned to the bottom toolbar on mobile.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-timeline-control="today"]'
  },
  {
    stepId: 'timeline-filters',
    anchorId: 'timeline-filters',
    title: 'Open Search and Filters',
    content:
      'The active filter count appears here. Open the panel whenever you want to narrow the schedule without changing its dates.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[data-timeline-control="filters"]'
  },
  {
    stepId: 'timeline-filter-types',
    anchorId: 'timeline-filter-types',
    title: 'Event Type Filters',
    content:
      'Show only the families you care about, including character and support banners, paid banners, stories, campaigns, competitive events, races, and scenario releases.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.filter-popover'
  },
  {
    stepId: 'timeline-track',
    anchorId: 'timeline-track',
    title: 'Read the Schedule',
    content:
      'Dates group releases into lanes, with month and milestone markers providing context. Desktop can use a horizontal track or vertical groups; mobile virtualizes the same feed for smooth scrolling.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.timeline-board'
  },
  {
    stepId: 'timeline-event-card',
    anchorId: 'timeline-event-card',
    title: 'Event Cards',
    content:
      'Cards show dates, event type, pickups, rewards, free pulls, and prediction context. Open one for full details, or add eligible banners directly to Carat Planner.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.timeline-board [id^="timeline-event-"]'
  },
  {
    stepId: 'timeline-today',
    anchorId: 'timeline-today',
    title: 'Today Marker',
    content:
      'This marker shows where the current date falls among confirmed and predicted releases, so upcoming content is easy to orient at a glance.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.timeline-today-marker'
  },
  {
    stepId: 'carat-planner-page',
    anchorId: 'carat-planner-page',
    route: '/timeline?tab=carat-planner',
    title: 'Plan Before You Pull',
    content:
      'Carat Planner projects your resources through future banners, combining saved balances, recurring income, scheduled rewards, free pulls, tickets, and Crystal Shards.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 10000,
    selector: '.planner'
  },
  {
    stepId: 'carat-planner-plans',
    anchorId: 'carat-planner-plans',
    title: 'Keep Multiple Plans',
    content:
      'Create and rename plans here. The menu also lets you switch, duplicate, import, export, or delete plans without mixing their balances and banner targets.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.planner .manager'
  },
  {
    stepId: 'carat-planner-search',
    anchorId: 'carat-planner-search',
    title: 'Add Banner Targets',
    content:
      'Search characters, support cards, banner types, or reruns. Adding a banner creates a pull target with useful defaults that you can adjust below.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.planner .workbench > .picker'
  },
  {
    stepId: 'carat-planner-summary',
    anchorId: 'carat-planner-summary',
    title: 'Projection at a Glance',
    content:
      'The summary immediately shows whether the full plan is funded, plus projected Carats, tickets, Crystal Shards, and total planned pulls after every target.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.planner .overview'
  },
  {
    stepId: 'carat-planner-assumptions',
    anchorId: 'carat-planner-assumptions',
    title: 'Set Your Assumptions',
    content:
      'Enter starting resources, choose expected recurring income, and review automatically counted rewards and free-pull campaigns. These assumptions drive every projection.',
    placement: { xPosition: 'after', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.planner .setup'
  },
  {
    stepId: 'carat-planner-targets',
    anchorId: 'carat-planner-targets',
    title: 'Build the Pull Plan',
    content:
      'Targets run in date order. Set pulls, timing, ticket use, Uncap Crystals, featured pickup goals, and desired copies. Open a target to inspect funding and the published probability of meeting those goals.',
    placement: { xPosition: 'after', yPosition: 'above' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '.planner .targets'
  },
  {
    stepId: 'replay',
    anchorId: 'nav-tour',
    title: 'Come Back Anytime',
    content: 'Use this help button to restart the tour whenever you want the guided version again.',
    placement: { xPosition: 'before', yPosition: 'below' },
    asyncStepTimeout: 5000,
    isOptional: true,
    selector: '[aria-label="Start guided tour"]'
  }
];

export function pageTourForUrl(value: string): PageTourId | undefined {
  const url = new URL(value, 'https://uma.moe');
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return 'home';
  if (path.startsWith('/database')) return 'database';
  if (path === '/circles') return 'clubs';
  if (path.startsWith('/activity')) return 'activity';
  if (path === '/timeline')
    return url.searchParams.get('tab') === 'carat-planner' ? 'carat-planner' : 'timeline';
  if (path === '/rankings' || path === '/tierlist' || path === '/tools')
    return path.slice(1) as PageTourId;
  return undefined;
}
