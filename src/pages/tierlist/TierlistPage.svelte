<script lang="ts">
  import LazyContent from '@/components/LazyContent.svelte';
  import ContentAd from '@/layouts/ContentAd.svelte';
  import PageHeading from '@/layouts/PageHeading.svelte';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import TierCardDetails from './TierCardDetails.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import Icon from '@/components/Icon.svelte';
  import { supportCardImagePath } from '@/lib/catalog/support-card-catalog';
  import {
    cardsForType,
    chartAxisBounds,
    groupTierCards,
    limitBreakLabel,
    TIER_DEFINITIONS,
    tierForPercentile,
    type TierCard,
    type TierlistData
  } from '@/lib/tierlist/tierlist';
  import { tierlistRepository } from './tierlist-repository';

  const types = ['Speed', 'Stamina', 'Power', 'Guts', 'Intelligence'];

  let data = $state<TierlistData>();
  let loading = $state(true);
  let error = $state('');
  let type = $state('0');
  let limitBreak = $state('4');
  let selected = $state<TierCard>();
  let detailOpen = $state(false);
  let hovered = $state<TierCard>();
  let hoverX = $state(0);
  let hoverY = $state(0);
  let viewportWidth = $state(1536);
  let chartWidth = $state(1000);

  const mobile = $derived(viewportWidth <= 768);

  function preview(card: TierCard, event: MouseEvent | FocusEvent) {
    if (mobile || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    hoverX = Math.max(4, Math.min(window.innerWidth - 364, rect.right + 16));
    hoverY = Math.max(4, Math.min(window.innerHeight - 560, rect.top - 150));
    hovered = card;
  }

  function inspect(card: TierCard) {
    hovered = undefined;
    selected = card;
    detailOpen = true;
  }

  function dismissPreview(event: KeyboardEvent) {
    if (event.key === 'Escape') hovered = undefined;
  }

  const cards = $derived(cardsForType(data, Number(type), Number(limitBreak)));
  const grouped = $derived(groupTierCards(cards));
  const axis = $derived(chartAxisBounds(cards.map((card) => card.scores[Number(limitBreak)] ?? 0)));
  const ticks = $derived(
    Array.from(
      { length: (axis.maximum - axis.minimum) / 500 + 1 },
      (_, index) => axis.minimum + index * 500
    )
  );
  const chartPoints = $derived.by(() => {
    const { minimum, maximum } = axis;
    const buckets: Array<{ score: number; count: number }> = [];
    return cards.map((card) => {
      const score = card.scores[Number(limitBreak)] ?? 0;
      let bucket = buckets.find(
        (item) => Math.abs(item.score - score) <= (mobile ? Math.max(60, chartWidth * 0.08) : 150)
      );
      if (!bucket) {
        bucket = { score, count: 0 };
        buckets.push(bucket);
      }
      const stack = bucket.count++;
      const rank = cards.findIndex((item) => item.id === card.id);
      return {
        card,
        x: 4 + ((score - minimum) / Math.max(1, maximum - minimum)) * 92,
        stack,
        color:
          TIER_DEFINITIONS.find(
            (item) =>
              item.name === (card.tiers?.[Number(limitBreak)] ?? tierFor(rank, cards.length))
          )?.color ?? '#64b5f6'
      };
    });
  });
  const chartHeight = $derived(
    Math.max(
      mobile ? 220 : 680,
      70 + (Math.max(0, ...chartPoints.map((point) => point.stack)) + 1) * (mobile ? 44 : 69)
    )
  );

  function tierFor(index: number, total: number): string {
    return tierForPercentile(total ? ((total - index) / total) * 100 : 0).name;
  }

  async function load(refresh = false): Promise<void> {
    loading = true;
    error = '';
    try {
      data = await tierlistRepository.load(refresh);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Tierlist data could not be loaded.';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  onkeydown={dismissPreview}
/>
<svelte:head>
  <title>Support Card Tierlist · uma.moe</title>
  <meta
    name="description"
    content="Legacy percentile-based Uma Musume support card tierlist by limit-break level."
  />
</svelte:head>
<SourcePage
  routeId="tierlist"
  title="Support Card Tierlist"
  width="wide"
>
  <div class="tierlist-page">
    <PageHeading
      title="Support Card Tierlist"
      description="Legacy tierlist"
      flush
    >
      {#snippet actions()}
        <div class="lb-control">
          <SelectField
            id="tierlist-lb"
            label="Limit Break Level"
            options={[0, 1, 2, 3, 4].map((value) => ({
              value: String(value),
              label: limitBreakLabel(value)
            }))}
            bind:value={limitBreak}
          />
        </div>
      {/snippet}
    </PageHeading>
    <div class="legacy-banner">
      <Icon
        name="info"
        size={18}
      />
      <span>
        This tierlist is no longer maintained and may be outdated. It remains available for
        reference.
      </span>
    </div>
    <main class="tier-content">
      {#if error}
        <Banner
          title="Tierlist data unavailable"
          tone="danger"
        >
          <p>{error}</p>
        </Banner>
      {/if}
      {#if loading}
        <div class="loading">
          <Spinner size={30} />
          <span>Calculating tierlist…</span>
        </div>
      {:else if !cards.length}
        <EmptyState
          icon="tierlist"
          title="No cards available"
          description={`No LB${limitBreak} ${types[Number(type)]} cards were found.`}
        />
      {:else}
        <ContentAd
          routeId="tierlist"
          top
        />
        <section class="chart">
          <div
            class="card-chart"
            bind:clientWidth={chartWidth}
            style:height={`${chartHeight}px`}
            aria-label={`${types[Number(type)]} support card power scores`}
          >
            {#each ticks as tick}
              <i
                class="grid-line"
                style={`left:${4 + ((tick - axis.minimum) / (axis.maximum - axis.minimum)) * 92}%`}
              >
                <span>{tick.toLocaleString()}</span>
              </i>
            {/each}{#each chartPoints as point (point.card.id)}
              <button
                class="chart-card"
                style={`--x:${point.x}%;--stack:${point.stack};--tier:${point.color}`}
                title={`${point.card.name} · ${(point.card.scores[Number(limitBreak)] ?? 0).toLocaleString()}`}
                aria-haspopup="dialog"
                onmouseenter={(event) => preview(point.card, event)}
                onmouseleave={() => (hovered = undefined)}
                onfocus={(event) => preview(point.card, event)}
                onblur={() => (hovered = undefined)}
                onclick={() => inspect(point.card)}
              >
                <img
                  src={supportCardImagePath(point.card.id)}
                  alt={point.card.name}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            {/each}
            <span class="chart-axis">Power Score</span>
          </div>
        </section>
        <div class="type-tabs">
          <Tabs
            variant="underline"
            label="Support card type"
            items={types.map((label, index) => ({ id: String(index), label }))}
            bind:value={type}
          />
        </div>
        <section class="tierlist">
          {#each grouped as tier}
            <article>
              <header style={`--tier:${tier.color}`}>
                <strong>{tier.name}</strong>
                <span>({tier.cards.length})</span>
                <small>{tier.label}</small>
              </header>
              <div>
                <LazyContent height={150}>
                  {#each tier.cards as card (card.id)}
                    <button
                      type="button"
                      class:selected={selected?.id === card.id}
                      title={`${card.name} · ${card.scores[Number(limitBreak)] ?? 0}`}
                      aria-haspopup="dialog"
                      onmouseenter={(event) => preview(card, event)}
                      onmouseleave={() => (hovered = undefined)}
                      onfocus={(event) => preview(card, event)}
                      onblur={() => (hovered = undefined)}
                      onclick={() => inspect(card)}
                    >
                      <img
                        src={supportCardImagePath(card.id)}
                        alt={card.name}
                        loading="lazy"
                      />
                      <b class="card-lb">LB{limitBreak}</b>
                      <span>
                        <strong>{card.name}</strong>
                        <small>{(card.scores[Number(limitBreak)] ?? 0).toLocaleString()}</small>
                      </span>
                    </button>
                  {/each}
                </LazyContent>
              </div>
            </article>
          {/each}
        </section>
        {#if hovered}
          <div
            class="card-preview"
            role="tooltip"
            style:left={`${hoverX}px`}
            style:top={`${hoverY}px`}
          >
            <TierCardDetails
              card={hovered}
              limitBreak={Number(limitBreak)}
            />
          </div>
        {/if}
        {#if selected}
          <Dialog
            id="tier-card-details"
            title="Support Card Details"
            bind:open={detailOpen}
            maxWidth="380px"
          >
            <TierCardDetails
              card={selected}
              limitBreak={Number(limitBreak)}
            />
          </Dialog>
        {/if}
        <ContentAd
          routeId="tierlist"
          index={2}
        />
        <section class="tier-info">
          <h2>Tierlist Information</h2>
          <p>
            This tierlist shows support cards at the selected Limit Break level using
            percentile-based ranking.
          </p>
          <p>Scores are calculated based on the URA scenario optimal meta calculations.</p>
          <h3>Percentile-Based Rankings:</h3>
          <div>
            {#each TIER_DEFINITIONS as tier}
              <span style={`--tier:${tier.color}`}>
                <i></i>
                {tier.name}-Tier
                <small>({tier.label} percentile)</small>
              </span>
            {/each}
          </div>
        </section>
      {/if}
    </main>
  </div>
</SourcePage>

<style>
  @import './tierlist-page.css';
</style>
