import type { InheritanceFilterMode } from '@/lib/inheritance/search/inheritance-search';

export interface DatabaseTourChanges {
  display?: true;
  expanded?: true;
  mode?: InheritanceFilterMode;
  affinity?: true;
  quick?: true;
  panels: string[];
}

const displaySteps = [
  'database-focus-controls',
  'database-hide-sparks',
  'database-split-sparks',
  'database-list-mode'
];

const advancedSteps = [
  'filter-include-exclude',
  'filter-trainer-search',
  'filter-main-parent-factors',
  'filter-preferred-white',
  'filter-lineage-white',
  'filter-race-schedule'
];

export function databaseTourChanges(step: string): DatabaseTourChanges | undefined {
  const displayStep = displaySteps.includes(step);
  if (!step.startsWith('filter-') && !displayStep) return undefined;
  if (displayStep) return { display: true, panels: [] };

  if (['filter-open', 'filter-modes', 'filter-presets'].includes(step))
    return { expanded: true, panels: [] };

  const panels: string[] = [];
  if (step === 'filter-include-exclude') panels.push('characters');
  if (step === 'filter-trainer-search') panels.push('search');
  panels.push(
    step === 'filter-main-parent-factors'
      ? 'main'
      : step === 'filter-race-schedule'
        ? 'races'
        : step === 'filter-support-card' || step === 'filter-limit-break'
          ? 'general'
          : 'inheritance'
  );
  return {
    expanded: true,
    mode: advancedSteps.includes(step) ? 'advanced' : 'basic',
    affinity: true,
    quick: step === 'filter-include-exclude' || step === 'filter-trainer-search' ? true : undefined,
    panels
  };
}
