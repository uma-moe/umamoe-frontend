<script lang="ts">
  import type { Snapshot } from '../hakuraku-types';
  import { number } from './cm-data';
  import Icon from '@/components/Icon.svelte';

  let { snapshot }: { snapshot: Snapshot } = $props();
</script>

<section
  class="dataset"
  aria-label="Dataset summary"
>
  <div class="course">
    <Icon
      name="race"
      size={22}
    />
    <div>
      <h2>{snapshot.meta.course}</h2>
      <p>{snapshot.meta.conditions}</p>
    </div>
  </div>
  <dl class="dataset-stats">
    <div>
      <dt>Simulated races</dt>
      <dd>{number(snapshot.meta.populationRaces)}</dd>
    </div>
    <div>
      <dt>Evaluated teams</dt>
      <dd>{number(snapshot.meta.evaluatedTeams)}</dd>
    </div>
    <div>
      <dt>Players</dt>
      <dd>{number(snapshot.meta.populationOwners)}</dd>
    </div>
  </dl>
</section>

<style>
  .dataset {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
    margin-bottom: 8px;
  }
  .course {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }
  .course > :global(svg) {
    color: var(--accent-primary);
    flex: none;
  }
  .course h2 {
    font-size: 13px;
    margin: 0 0 2px;
    line-height: 1.4;
  }
  .course p {
    font-size: 11px;
    margin: 0;
    color: var(--text-secondary);
  }
  .dataset-stats {
    display: flex;
    gap: 16px;
    margin: 0;
    flex: none;
  }
  .dataset-stats > div {
    padding-left: 16px;
    border-left: 1px solid var(--border-subtle);
  }
  .dataset-stats dt {
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }
  .dataset-stats dd {
    font-size: 16px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    margin: 2px 0 0;
  }
  @media (max-width: 1100px) {
    .dataset-stats {
      gap: 14px;
    }
    .dataset-stats > div {
      padding-left: 14px;
    }
    .dataset-stats dd {
      font-size: 16px;
    }
  }
  @media (max-width: 767px) {
    .dataset {
      align-items: start;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px;
    }
    .dataset-stats {
      width: 100%;
      justify-content: space-between;
      gap: 8px;
    }
    .dataset-stats > div {
      padding-left: 12px;
    }
    .dataset-stats > div:first-child {
      border: 0;
      padding: 0;
    }
    .dataset-stats dd {
      font-size: 16px;
    }
  }
</style>
