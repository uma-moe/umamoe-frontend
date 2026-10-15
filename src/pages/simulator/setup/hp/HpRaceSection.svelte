<script lang="ts">
  import SelectField from '@/components/controls/SelectField.svelte';
  import CourseButtons from '../../shell/CourseButtons.svelte';
  import RaceBar from '../../shell/RaceBar.svelte';
  import SimSection from '../../shell/SimSection.svelte';
  import { RACE_TYPE_OPTIONS } from '../../simulator-race-types';
  import { GROUND_OPTIONS, simulatorSession } from '../../simulator-session.svelte';
  import { hpCalculator } from './hp-calculator.svelte';

  const SPURT_OPTIONS = [
    { value: 'false', label: 'By HP left' },
    { value: 'true', label: 'Always full' }
  ];
</script>

<SimSection
  number={2}
  title="Race"
>
  {#snippet actions()}<CourseButtons />{/snippet}
  <div class="race-row">
    <RaceBar
      bare
      courseOnly
    />
    <SelectField
      id="hp-ground"
      label="Ground"
      options={GROUND_OPTIONS}
      bind:value={simulatorSession.ground}
    />
    <SelectField
      id="hp-race-type"
      label="Race format"
      options={RACE_TYPE_OPTIONS}
      bind:value={hpCalculator.raceType}
    />
    <SelectField
      id="hp-spurt"
      label="Last spurt"
      options={SPURT_OPTIONS}
      bind:value={hpCalculator.fullSpurt}
    />
  </div>
</SimSection>

<style>
  /* Track, course, ground, race format and how she spurts: one row on the runner's five columns. */
  .race-row {
    --control-height: var(--setup-control-height);
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px 12px;
    align-items: start;
  }
  .race-row :global(.field) {
    gap: 4px;
  }
  .race-row :global(label) {
    font-size: 12px;
  }
  .race-row :global(input),
  .race-row :global(.select-control) {
    font-size: 13px;
  }
  /* A phone: the track and course a row each, the rest two a row. */
  @container sim-form (max-width: 560px) {
    .race-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .race-row :global(.course-picker) {
      grid-column: 1 / -1;
    }
  }
</style>
