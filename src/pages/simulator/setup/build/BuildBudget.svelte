<script lang="ts">
  import TextField from '@/components/controls/TextField.svelte';
  import ToggleField from '../../shell/ToggleField.svelte';
  import { buildSearch } from './build-search.svelte';

  /**
   * What she has to spend at the end of the career: her SP, her fans (some skills grow with them) and Fast Learner,
   * a toggle like the race's conditions. The fields are cells of whichever form grid holds them: the Setup row when it
   * is wide enough, else the row above the skills on offer.
   */
  const FAST_LEARNER_OPTIONS = [
    { value: 'false', label: 'Off', title: 'Without Fast Learner' },
    { value: 'true', label: '−10% SP', title: 'Fast Learner: another 10% off every skill' }
  ];
</script>

<div class="budget-fields">
  <TextField
    id="build-budget"
    label="SP available"
    type="number"
    min={0}
    bind:value={buildSearch.budget}
  />
  <TextField
    id="build-fans"
    label="Fans"
    type="number"
    min={0}
    placeholder="—"
    bind:value={
      () => (buildSearch.uma.fanCount === undefined ? '' : String(buildSearch.uma.fanCount)),
      (value) =>
        (buildSearch.uma.fanCount =
          value === '' || !Number.isFinite(Number(value))
            ? undefined
            : Math.max(0, Math.round(Number(value))))
    }
  />
  <ToggleField
    id="build-fast-learner"
    label="Fast Learner"
    options={FAST_LEARNER_OPTIONS}
    bind:value={
      () => String(buildSearch.fastLearner), (value) => (buildSearch.fastLearner = value === 'true')
    }
  />
</div>

<style>
  .budget-fields {
    display: contents;
  }
</style>
