<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';
  import { spentLabel } from './gacha-copy';
  import GachaResultCard from './GachaResultCard.svelte';
  import type { GachaSession } from './gacha-session';

  interface Props {
    session: GachaSession;
    kind: GachaKind;
    topLabel: string;
    middleLabel: string;
    lowLabel: string;
    onclear: () => void;
  }

  let { session, kind, topLabel, middleLabel, lowLabel, onclear }: Props = $props();

  const numberFormat = new Intl.NumberFormat();
  let expanded = $state<Record<number, boolean>>({});

  const trimmed = $derived(session.batches.length < session.pulls);
</script>

<section aria-labelledby="pull-history-title">
  <div class="section-heading">
    <h2 id="pull-history-title">Pull History</h2>
    {#if session.pulls}
      <Button
        size="sm"
        variant="ghost"
        icon="trash"
        onclick={onclear}
      >
        Clear history
      </Button>
    {/if}
  </div>

  {#if !session.pulls}
    <p class="history-empty">
      <Icon
        name="dice"
        size={18}
      />
      Every pull you make is listed here.
    </p>
  {:else}
    <dl
      class="history-totals"
      aria-label="This banner's totals"
    >
      <div>
        <dt>Draws</dt>
        <dd>{numberFormat.format(session.draws)}</dd>
      </div>
      <div>
        <dt>{topLabel}</dt>
        <dd>{numberFormat.format(session.top)}</dd>
      </div>
      <div>
        <dt>{middleLabel}</dt>
        <dd>{numberFormat.format(session.middle)}</dd>
      </div>
      <div>
        <dt>Featured</dt>
        <dd>{numberFormat.format(session.featured)}</dd>
      </div>
    </dl>
    {#if trimmed}
      <p class="history-note">
        Showing the newest {session.batches.length} of {session.pulls} pulls.
      </p>
    {/if}

    <ol class="history-list">
      {#each session.batches as batch (batch.id)}
        {@const isOpen = expanded[batch.id] === true}
        <li class="history-entry">
          <button
            type="button"
            class="history-row"
            aria-expanded={isOpen}
            aria-controls={`pull-cards-${batch.id}`}
            onclick={() => (expanded[batch.id] = !isOpen)}
          >
            <span class="history-chevron">
              <Icon
                name="chevron"
                size={14}
              />
            </span>
            <span class="history-id">Pull {batch.id}</span>
            <span
              class="history-summary"
              class:top={batch.topNames.length > 0}
            >
              {batch.topNames.length
                ? `${topLabel} ${batch.topNames.join(', ')}`
                : `no ${topLabel}`}
            </span>
            <span class="history-counts">
              {topLabel}
              {batch.topCount} · {middleLabel}
              {batch.middleCount} ·
              {lowLabel}
              {batch.lowCount}
            </span>
          </button>
          {#if isOpen}
            <div
              class="history-detail"
              id={`pull-cards-${batch.id}`}
            >
              <p class="history-detail-line">
                {batch.purchase}
                ·
                {batch.guaranteed ? '10th SR+ guaranteed' : 'no guarantee'}
                · spent {spentLabel(batch.spend, { labelCarats: true })}
              </p>
              <ol
                class="result-grid"
                class:single={batch.results.length === 1}
                aria-label={`Cards from pull ${batch.id}`}
              >
                {#each batch.results as result, index (result.drawIndex)}
                  <li style:--reveal-index={Math.min(index, 9)}>
                    <GachaResultCard
                      {result}
                      {kind}
                      position={result.drawIndex}
                    />
                  </li>
                {/each}
              </ol>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  @import './gacha-results.css';
  @import './gacha-pull-history.css';
</style>
