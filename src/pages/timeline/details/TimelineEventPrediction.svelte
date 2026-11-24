<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import type { TimelinePredictionInsight } from '@/lib/timeline/prediction/timeline-prediction';

  interface Props {
    prediction: TimelinePredictionInsight;
    predicted?: boolean;
    preliminary?: boolean;
    dateLabel: string;
  }

  let { prediction, predicted, preliminary = false, dateLabel }: Props = $props();

  const groups = $derived(
    [
      {
        label: 'Model',
        icon: 'lineage' as IconName,
        metrics: prediction?.metrics.filter((m) => m.label === 'Source') ?? []
      },
      {
        label: 'Schedule',
        icon: 'timeline' as IconName,
        metrics:
          prediction?.metrics.filter((m) =>
            ['Schedule shift', 'Catch-up rate', 'Global anchor', 'JP anchor'].includes(m.label)
          ) ?? []
      },
      {
        label: 'Calendar fit',
        icon: 'calendar' as IconName,
        metrics:
          prediction?.metrics.filter(
            (m) =>
              !['Source', 'Schedule shift', 'Catch-up rate', 'Global anchor', 'JP anchor'].includes(
                m.label
              )
          ) ?? []
      }
    ].filter((group) => group.metrics.length)
  );
</script>

<section class="detail-section prediction">
  <div class="section-heading">
    <h3>
      <Icon
        name="calendar"
        size={16}
      />{preliminary ? 'Preliminary date' : predicted ? 'Date prediction' : 'Date source'}
    </h3>
  </div>
  <p>{prediction.subtitle}</p>
  <div class="current-prediction">
    <span>
      <small>{preliminary ? 'Preliminary confirmed date' : 'Current estimate'}</small>
      <strong>{dateLabel}</strong>
    </span>
    <b>{preliminary ? 'Preliminary' : prediction.fitLabel || 'Estimated'}</b>
  </div>
  <div class="prediction-factors">
    {#each groups as group}
      <div>
        <span class="factor-label">
          <Icon
            name={group.icon}
            size={14}
          />{group.label}
        </span>
        <dl>
          {#each group.metrics as metric}
            <div>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          {/each}
        </dl>
      </div>
    {/each}
  </div>
  {#if prediction.alternatives.length}
    <div class="alternatives">
      <h4>Alternative date fit</h4>
      {#each prediction.alternatives as alternative}
        <div>
          <strong>{alternative.label}</strong>
          <small>{alternative.reason}</small>
          <span
            class="fit-track"
            aria-hidden="true"
          >
            <i style:width={alternative.fitScore * 100 + '%'}></i>
          </span>
          <b>{alternative.probabilityLabel}</b>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  @import './timeline-detail-section.css';
  @import './timeline-event-prediction.css';
</style>
