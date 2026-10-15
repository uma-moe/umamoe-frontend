<script lang="ts">
  import { compact } from '../statistics-format';
  import type { StatisticsView } from '../statistics-view.svelte';

  interface Props {
    view: StatisticsView;
    sampleTotal: number;
    characterCount: number;
  }

  let { view, sampleTotal, characterCount }: Props = $props();
</script>

<section
  class="dataset-summary"
  aria-label="Dataset summary"
>
  <div class="sample-summary">
    <span class="summary-label">In your selection</span>
    <strong data-testid="selected-samples">{compact(view.selectedSamples)}</strong>
    <span>of {sampleTotal.toLocaleString()} training samples</span>
  </div>
  <div>
    <span class="summary-label">Umas represented</span>
    <strong>
      {view.umaData.length}
      <small>/ {characterCount}</small>
    </strong>
    <span>in the selected data</span>
  </div>
  <div>
    <span class="summary-label">Most represented</span>
    <strong>{view.commonClass?.name ?? '-'}</strong>
    <span>
      {view.commonClass
        ? (view.commonClass.percentage ?? 0).toFixed(1) + '% of selected samples'
        : 'No samples selected'}
    </span>
  </div>
</section>

<style>
  .dataset-summary {
    display: grid;
    grid-template-columns: 1.25fr 1fr 1fr;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
    margin-bottom: 10px;
    padding: 8px 14px;
  }
  .dataset-summary > div {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 1px 10px;
    padding-inline: 18px;
  }
  .dataset-summary > div:first-child {
    padding-left: 0;
  }
  .dataset-summary > div + div {
    border-left: 1px solid var(--border-subtle);
  }
  .dataset-summary strong {
    font-size: 22px;
    line-height: 1.2;
    letter-spacing: -0.035em;
    font-variant-numeric: tabular-nums;
  }
  .dataset-summary .sample-summary strong {
    color: var(--accent-primary);
    font-size: 24px;
  }
  .dataset-summary strong small {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
  }
  .dataset-summary span {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .dataset-summary .summary-label {
    grid-column: 1/-1;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
  }
  @container statistics (max-width:700px) {
    .dataset-summary > div {
      padding-inline: 10px;
    }
    .dataset-summary > div > span:last-child {
      grid-column: 1/-1;
    }
  }
  @media (max-width: 600px) {
    .dataset-summary {
      padding: 8px 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-bottom: 6px;
    }
    .dataset-summary > div {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-inline: 8px;
    }
    .dataset-summary strong,
    .dataset-summary .sample-summary strong {
      font-size: 20px;
    }
    .dataset-summary strong small {
      font-size: 11px;
    }
    .dataset-summary span {
      font-size: 9px;
    }
    .dataset-summary .summary-label {
      font-size: 9px;
    }
  }
</style>
