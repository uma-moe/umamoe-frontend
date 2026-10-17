<script lang="ts">
  import type { StaminaResult } from '../../../simulator-repository';
  import { finishHistogram } from './hp-result';

  interface Props {
    result?: StaminaResult;
  }

  let { result }: Props = $props();

  const histogram = $derived(finishHistogram(result));
</script>

<!-- How her HP at the finish spreads over the races. -->
{#if histogram}<figure class="histogram">
    <figcaption>HP at the finish, {histogram.races} races</figcaption>
    <div
      class="bars"
      role="img"
      aria-label={'HP at the finish: ' +
        histogram.counts.map((bin) => bin.count + ' races from ' + bin.from).join(', ')}
    >
      {#each histogram.counts as bin}<i
          class:short={bin.from + histogram.step <= 0}
          style:height={(bin.count / histogram.top) * 100 + '%'}
          title={bin.count +
            (bin.count === 1 ? ' race: ' : ' races: ') +
            (histogram.step === 1
              ? bin.from.toLocaleString('en-US')
              : bin.from.toLocaleString('en-US') +
                ' to ' +
                (bin.from + histogram.step - 1).toLocaleString('en-US')) +
            ' HP'}
        ></i>{/each}
    </div>
    <div class="ends">
      <span>{histogram.low.toLocaleString('en-US')}</span>
      {#each histogram.ticks as tick}<span
          class="tick"
          style:left={((tick - histogram.start) / (histogram.end - histogram.start)) * 100 + '%'}
        >
          {tick.toLocaleString('en-US')}
        </span>{/each}
      <span>{histogram.high.toLocaleString('en-US')} HP</span>
    </div>
  </figure>{/if}

<style>
  @container hp-result (min-width: 900px) {
    :global(.hp-result) > .histogram {
      grid-column: 1;
    }
  }
  .histogram {
    display: grid;
    gap: 3px;
    margin: 0;
  }
  .histogram figcaption {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 56px;
    border-bottom: 1px solid var(--border-primary);
  }
  .bars i {
    flex: 1;
    min-height: 1px;
    border-radius: 2px 2px 0 0;
    background: var(--accent-primary);
  }
  .bars i.short {
    background: var(--accent-error);
  }
  .ends {
    position: relative;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .ends .tick {
    position: absolute;
    transform: translateX(-50%);
  }
</style>
