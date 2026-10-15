export interface Preview {
  id: string;
  title: string;
  library: 'uma' | 'hakuraku';
  group: string;
  components: string[];
  route: string;
}

export const previews: Preview[] = [
  {
    id: 'button',
    title: 'Buttons & toggles',
    library: 'uma',
    group: 'Controls',
    components: [
      'components/controls/Button.svelte',
      'components/controls/IconButton.svelte',
      'components/controls/ToggleButton.svelte',
      'components/controls/SegmentedControl.svelte'
    ],
    route: '/database'
  },
  {
    id: 'text-field',
    title: 'Text, search & numbers',
    library: 'uma',
    group: 'Controls',
    components: ['components/controls/TextField.svelte'],
    route: '/database'
  },
  {
    id: 'select',
    title: 'Select & autocomplete',
    library: 'uma',
    group: 'Controls',
    components: [
      'components/controls/SelectField.svelte',
      'components/controls/SelectFieldSlim.svelte',
      'components/controls/Combobox.svelte'
    ],
    route: '/database'
  },
  {
    id: 'choice',
    title: 'Checkboxes, radio & sliders',
    library: 'uma',
    group: 'Controls',
    components: [
      'components/controls/Checkbox.svelte',
      'components/controls/RadioGroup.svelte',
      'components/controls/Slider.svelte'
    ],
    route: '/settings'
  },
  {
    id: 'file',
    title: 'File upload',
    library: 'uma',
    group: 'Controls',
    components: ['components/controls/FileDrop.svelte'],
    route: '/veterans'
  },
  {
    id: 'navigation',
    title: 'Tabs & pagination',
    library: 'uma',
    group: 'Navigation',
    components: ['components/navigation/Tabs.svelte', 'components/navigation/Pagination.svelte'],
    route: '/database'
  },
  {
    id: 'menu',
    title: 'Account menu & tooltips',
    library: 'uma',
    group: 'Navigation',
    components: ['components/navigation/Menu.svelte', 'components/overlays/Tooltip.svelte'],
    route: '/settings'
  },
  {
    id: 'table',
    title: 'Responsive data table',
    library: 'uma',
    group: 'Navigation',
    components: ['components/data/DataTable.svelte'],
    route: '/profile'
  },
  {
    id: 'feedback',
    title: 'Feedback & empty states',
    library: 'uma',
    group: 'Feedback',
    components: [
      'components/feedback/Banner.svelte',
      'components/feedback/EmptyState.svelte',
      'components/feedback/Spinner.svelte',
      'components/feedback/ToastRegion.svelte'
    ],
    route: '/veterans'
  },
  {
    id: 'dialog',
    title: 'Dialogs & disclosures',
    library: 'uma',
    group: 'Feedback',
    components: [
      'components/overlays/Dialog.svelte',
      'components/overlays/Disclosure.svelte',
      'components/overlays/InspectPopover.svelte'
    ],
    route: '/timeline'
  },
  {
    id: 'page-layout',
    title: 'Page layout, ad rails & privacy',
    library: 'uma',
    group: 'Layouts',
    components: [
      'layouts/AppPage.svelte',
      'layouts/PageFrame.svelte',
      'layouts/ads/StickyFooterAd.svelte',
      'styles/privacy.css'
    ],
    route: '/tools/statistics'
  },
  {
    id: 'race-dialogs',
    title: 'Race history & optimal races',
    library: 'uma',
    group: 'Game displays',
    components: [
      'pages/database/results/RaceResultsDialog.svelte',
      'pages/database/results/OptimalRacesDialog.svelte',
      'components/overlays/Dialog.svelte'
    ],
    route: '/database'
  },
  {
    id: 'planner-goals',
    title: 'Pull planner goals',
    library: 'uma',
    group: 'Game displays',
    components: ['pages/carat-planner/goals/PlannerTargetGoals.svelte'],
    route: '/timeline?tab=carat-planner'
  },
  {
    id: 'affinity-picker',
    title: 'Target & legacy picker',
    library: 'uma',
    group: 'Game displays',
    components: [
      'components/pickers/AffinityPicker.svelte',
      'components/pickers/CharacterSelectDialog.svelte'
    ],
    route: '/database'
  },
  {
    id: 'character-picker',
    title: 'Include / exclude Umas',
    library: 'uma',
    group: 'Game displays',
    components: [
      'components/pickers/IncludeExcludePicker.svelte',
      'components/pickers/CharacterPicker.svelte'
    ],
    route: '/veterans'
  },
  {
    id: 'support-picker',
    title: 'Support card picker',
    library: 'uma',
    group: 'Game displays',
    components: ['components/pickers/SupportCardPicker.svelte'],
    route: '/database'
  },
  {
    id: 'identity',
    title: 'Skills, sparks & stats',
    library: 'uma',
    group: 'Game displays',
    components: [
      'components/game/SkillChip.svelte',
      'components/sparks/SparkRow.svelte',
      'components/sparks/SparkItem.svelte',
      'components/game/RankBadge.svelte',
      'components/game/AptitudeGrid.svelte',
      'components/game/StatStrip.svelte'
    ],
    route: '/veterans'
  },
  {
    id: 'lineage',
    title: 'Lineage & affinity',
    library: 'uma',
    group: 'Game displays',
    components: ['components/lineage/LineageTree.svelte'],
    route: '/tools/lineage-planner'
  },
  {
    id: 'race-schedule',
    title: 'Race badges & schedule',
    library: 'uma',
    group: 'Game displays',
    components: ['components/game/RaceBadge.svelte', 'components/game/RaceSchedule.svelte'],
    route: '/tools/lineage-planner'
  },
  {
    id: 'timeline-card',
    title: 'Timeline events',
    library: 'uma',
    group: 'Game displays',
    components: ['components/cards/TimelineEventCard.svelte'],
    route: '/timeline'
  },
  {
    id: 'circle-card',
    title: 'Club ranking & profile',
    library: 'uma',
    group: 'Game displays',
    components: ['components/cards/CircleCard.svelte'],
    route: '/circles'
  },
  {
    id: 'veteran-card',
    title: 'Veteran collection card',
    library: 'hakuraku',
    group: 'Veterans',
    components: [
      'pages/profile/veterans/ProfileVeteranCard.svelte',
      'pages/profile/veterans/ProfileVeteranIdentity.svelte',
      'pages/profile/veterans/ProfileVeteranAffinity.svelte'
    ],
    route: '/veterans'
  },
  {
    id: 'veteran-spark-matcher',
    title: 'Spark rules & operators',
    library: 'hakuraku',
    group: 'Veterans',
    components: [
      'pages/profile/veterans/ProfileVeteranSparkMatcher.svelte',
      'components/controls/Slider.svelte'
    ],
    route: '/database'
  },
  {
    id: 'veteran-summary',
    title: 'Veteran detail summary',
    library: 'hakuraku',
    group: 'Veterans',
    components: ['components/game/VeteranSummary.svelte'],
    route: '/database'
  },
  {
    id: 'statistics-filters',
    title: 'Statistics filters',
    library: 'hakuraku',
    group: 'Statistics',
    components: ['pages/statistics/StatisticsFilterControls.svelte'],
    route: '/tools/statistics'
  },
  {
    id: 'statistics-ranking',
    title: 'Statistics rankings',
    library: 'hakuraku',
    group: 'Statistics',
    components: ['pages/statistics/StatisticsRanking.svelte', 'components/data/MetricBar.svelte'],
    route: '/tools/statistics'
  },
  {
    id: 'statistics-deck-matrix',
    title: 'Deck composition',
    library: 'hakuraku',
    group: 'Statistics',
    components: ['pages/statistics/StatisticsDeckMatrix.svelte'],
    route: '/tools/statistics'
  },
  {
    id: 'statistics-chart',
    title: 'Statistics charts',
    library: 'hakuraku',
    group: 'Statistics',
    components: [
      'pages/statistics/StatisticsChartPanel.svelte',
      'components/charts/ChartFrame.svelte'
    ],
    route: '/tools/statistics'
  }
];
