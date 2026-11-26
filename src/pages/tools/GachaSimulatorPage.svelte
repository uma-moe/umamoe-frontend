<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Badge from '@/components/Badge.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Card from '@/components/cards/Card.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import {
    planGachaPurchase,
    spendGachaPurchase,
    type GachaBudget,
    type GachaSpend
  } from '@/lib/gacha-simulator/gacha-budget';
  import {
    gachaPurchaseOffers,
    type GachaPurchaseOffer
  } from '@/lib/gacha-simulator/gacha-purchases';
  import {
    drawGacha,
    entryRate,
    rarityRate,
    type GachaDrawResult,
    type GachaKind
  } from '@/lib/gacha-simulator/gacha-draw';
  import { timelineDisplayTitle } from '@/lib/timeline/events/timeline-pickups';
  import GachaBannerPicker from './gacha-simulator/GachaBannerPicker.svelte';
  import { spentLabel } from './gacha-simulator/gacha-copy';
  import { readQuickPulls, writeQuickPulls } from './gacha-simulator/gacha-preferences';
  import { readGachaQuery, writeGachaQuery } from './gacha-simulator/gacha-query';
  import GachaPullDialog from './gacha-simulator/GachaPullDialog.svelte';
  import GachaPullHistory from './gacha-simulator/GachaPullHistory.svelte';
  import {
    appendPullBatch,
    EMPTY_SESSION,
    type GachaSession,
    type PullBatch,
    type SessionResult
  } from './gacha-simulator/gacha-session';
  import {
    gachaItemDisplay,
    type GachaDisplayCatalog,
    type GachaItemDisplay
  } from './gacha-simulator/gacha-display';
  import {
    GachaSimulatorRepository,
    type GachaBanner
  } from './gacha-simulator/gacha-simulator-repository';

  type FeaturedItem = GachaItemDisplay & { id: number; rate: number };

  const FEATURED_LIMIT = 3;
  const DEFAULT_FREE_CARATS = 30_000;
  /** How long a pull waits for its art before revealing anyway. */
  const ART_WAIT_MS = 4000;

  const repository = new GachaSimulatorRepository();
  const numberFormat = new Intl.NumberFormat();
  const percentFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

  let banners = $state<GachaBanner[]>([]);
  let catalog = $state<GachaDisplayCatalog>();
  let kind = $state<GachaKind>('character');
  let selectedId = $state('');
  let ticketBudgets = $state<Record<GachaKind, number>>({ character: 0, support: 0 });
  let freeCarats = $state(DEFAULT_FREE_CARATS);
  let paidCarats = $state(0);
  let sessions = $state<Record<string, GachaSession>>({});
  let loading = $state(true);
  let loadError = $state('');
  let dataWarning = $state('');
  let drawError = $state('');
  /** True while a pull is drawing and its art is loading, so the reveal lands on pictures. */
  let drawing = $state(false);
  /** Pulls without their deal and flourish, for someone reading numbers rather than watching. */
  let quickPulls = $state(false);
  let pulling = $state(false);
  let announcement = $state('');
  /** Bumped on every announcement, so a repeated message still replaces the live region's text. */
  let announcementSeq = $state(0);
  let announcedBannerId = '';
  let startPull = $state<HTMLDivElement>();
  let request = 0;

  const currentBudget = $derived<GachaBudget>({
    tickets: ticketBudgets[kind],
    freeCarats,
    paidCarats
  });
  const kindBanners = $derived(banners.filter((banner) => banner.pool.kind === kind));
  const selectedBanner = $derived(
    kindBanners.find((banner) => banner.event.id === selectedId) ?? kindBanners[0]
  );
  const session = $derived(
    selectedBanner ? (sessions[selectedBanner.event.id] ?? EMPTY_SESSION) : EMPTY_SESSION
  );
  const drawCost = $derived(selectedBanner?.pool.cost ?? 150);
  /** The three purchases a banner offers, each with what it would spend and whether it can. */
  const purchases = $derived.by(() =>
    gachaPurchaseOffers(drawCost).map((offer) => ({
      offer,
      plan: planGachaPurchase(currentBudget, offer)
    }))
  );
  const anyPurchaseAffordable = $derived(purchases.some(({ plan }) => plan.shortfall === 0));
  /** The cheapest door, which is what to name when nothing is affordable. */
  const blockedReason = $derived.by(() => {
    if (anyPurchaseAffordable) return undefined;

    const first = purchases[0];
    if (!first) return undefined;

    return `1 draw needs ${numberFormat.format(first.plan.shortfall)} paid Carats.`;
  });
  /** The pull that just happened, which is all the dialog shows. */
  const currentPull = $derived(session.batches[0]?.results ?? []);
  const featuredItems = $derived.by((): FeaturedItem[] => {
    const banner = selectedBanner;
    const currentCatalog = catalog;
    if (!banner || !currentCatalog) return [];

    return banner.pool.entries
      .filter((entry) => entry.featured)
      .map((entry) => ({
        id: entry.cardId,
        rate: entryRate(banner.pool, entry.cardId),
        ...gachaItemDisplay(entry.cardId, banner.pool.kind, currentCatalog)
      }));
  });
  const topLabel = $derived(kind === 'support' ? 'SSR' : '3★');
  const middleLabel = $derived(kind === 'support' ? 'SR' : '2★');
  const lowLabel = $derived(kind === 'support' ? 'R' : '1★');
  const sourceLabel = $derived.by(() => {
    if (selectedBanner?.pool.source === 'live') return 'Exact odds';
    if (selectedBanner?.pool.source === 'preliminary') return 'Preliminary';
    return 'Estimated banner';
  });
  const sourceHelp = $derived.by(() => {
    const pool = selectedBanner?.pool;
    if (!pool) return '';

    const source =
      pool.source === 'live'
        ? 'Rates and every card come from the current Global game data.'
        : pool.source === 'preliminary'
          ? 'Rates and every card come from the preliminary Global game data, which can still change.'
          : 'Featured cards come from JP. The standard 3% / 18% / 79% rates and the rest of the pool are inferred, so treat these odds as an estimate.';

    return [
      source,
      `The 10th draw of a 10-draw guarantees ${middleLabel} or above and keeps the ${topLabel} rate.`,
      dataWarning
    ]
      .filter(Boolean)
      .join(' ');
  });

  async function load() {
    const token = ++request;
    loading = true;
    loadError = '';
    dataWarning = '';

    try {
      const data = await repository.load();
      if (token !== request) return;

      banners = data.banners;
      catalog = { characters: data.characters, supports: data.supports };

      const requested = readGachaQuery(location.search);
      const linked = requested.banner
        ? data.banners.find((banner) => banner.event.id === requested.banner)
        : undefined;

      kind = linked?.pool.kind ?? availableKind(requested.kind, data.banners);
      selectedId = linked?.event.id ?? defaultBannerId(kind);

      // A link that names a banner or type the data no longer has is rewritten to what was shown.
      const staleBanner = requested.banner !== undefined && linked === undefined;
      if (staleBanner || requested.kind !== kind) writeGachaQuery({ kind, banner: selectedId });

      dataWarning = data.warning ?? '';
    } catch (error) {
      if (token === request)
        loadError = error instanceof Error ? error.message : 'The banners could not be loaded.';
    } finally {
      if (token === request) loading = false;
    }
  }

  /** The URL's type when the banners carry it, else whichever kind has any. */
  function availableKind(requested: GachaKind, available: readonly GachaBanner[]): GachaKind {
    if (available.some((banner) => banner.pool.kind === requested)) return requested;
    return available.some((banner) => banner.pool.kind === 'character') ? 'character' : 'support';
  }

  function defaultBannerId(forKind: GachaKind): string {
    const candidates = banners.filter((banner) => banner.pool.kind === forKind);
    const now = Date.now();
    const active = candidates.find(
      (banner) =>
        banner.event.date.getTime() <= now &&
        (banner.event.estimatedEndDate ?? banner.event.date).getTime() >= now
    );
    const preferred = active ?? candidates.find((banner) => banner.pool.source === 'live');
    return (preferred ?? candidates[0])?.event.id ?? '';
  }

  function selectKind(next: string) {
    kind = next === 'support' ? 'support' : 'character';
    selectedId = defaultBannerId(kind);
    writeGachaQuery({ kind, banner: selectedId });
  }

  function selectBanner(eventId: string) {
    writeGachaQuery({ kind, banner: eventId });
  }

  async function clearHistory() {
    const banner = selectedBanner;
    if (!banner) return;

    const next = { ...sessions };
    delete next[banner.event.id];
    sessions = next;
    announce('Pull history cleared.');

    await tick();
    startPull?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function announce(message: string) {
    announcement = message;
    announcementSeq += 1;
  }

  function updateTickets(event: Event) {
    if (inputIsEmpty(event)) return;
    ticketBudgets[kind] = inputAmount(event);
  }

  function updateCarats(event: Event, paid: boolean) {
    if (inputIsEmpty(event)) return;

    const amount = inputAmount(event);
    if (paid) paidCarats = amount;
    else freeCarats = amount;
  }

  /** A field cleared to retype keeps the budget it had until the reader commits a number. */
  function inputIsEmpty(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).value.trim() === '';
  }

  function restoreBudgetField(event: Event, current: number) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.value.trim() === '') input.value = String(current);
  }

  function resetBudget() {
    ticketBudgets = { character: 0, support: 0 };
    freeCarats = DEFAULT_FREE_CARATS;
    paidCarats = 0;
  }

  function draw(offer: GachaPurchaseOffer) {
    if (drawing) return;
    void runDraw(offer);
  }

  async function runDraw(offer: GachaPurchaseOffer) {
    const banner = selectedBanner;
    const currentCatalog = catalog;
    if (!banner || !currentCatalog) return;

    let spend: GachaSpend | undefined;
    try {
      spend = spendGachaPurchase(currentBudget, offer);
    } catch {
      drawError = 'This purchase could not be priced.';
      return;
    }
    if (!spend) return;

    let drawn: GachaDrawResult[];
    try {
      drawn = drawGacha(banner.pool, offer.count, { guaranteed: offer.guaranteed });
    } catch (error) {
      drawError = error instanceof Error ? error.message : 'This banner could not be drawn.';
      return;
    }
    drawError = '';

    const previous = sessions[banner.event.id] ?? EMPTY_SESSION;
    const results: SessionResult[] = drawn.map((entry, index) => ({
      ...entry,
      ...gachaItemDisplay(entry.cardId, banner.pool.kind, currentCatalog),
      drawIndex: previous.draws + index + 1
    }));
    const top = results.filter((entry) => entry.rarity === 3);

    const batch: PullBatch = {
      id: previous.pulls + 1,
      count: offer.count,
      purchase: offer.historyLabel,
      guaranteed: offer.guaranteed,
      results,
      topNames: top.map((entry) => entry.name),
      topCount: top.length,
      middleCount: results.filter((entry) => entry.rarity === 2).length,
      lowCount: results.filter((entry) => entry.rarity === 1).length,
      featuredCount: results.filter((entry) => entry.featured).length,
      spend: spend.spent
    };

    drawing = true;
    try {
      await preloadArt(results.map((result) => result.image));
    } finally {
      drawing = false;
    }

    ticketBudgets[kind] = spend.remaining.tickets;
    freeCarats = spend.remaining.freeCarats;
    paidCarats = spend.remaining.paidCarats;
    sessions = { ...sessions, [banner.event.id]: appendPullBatch(previous, batch) };

    const draws = offer.count === 1 ? 'draw' : 'draws';
    const names = top.length ? ` (${top.map((entry) => entry.name).join(', ')})` : '';
    announce(
      `${offer.count} ${draws}: ${top.length} ${topLabel}${names}, ${batch.middleCount} ${middleLabel}, ${batch.lowCount} ${lowLabel}. Spent ${spentLabel(spend.spent, { labelCarats: true })}.`
    );
  }

  /** Resolves once the pulled art is decoded, or after the wait cap, whichever comes first. */
  async function preloadArt(sources: string[]): Promise<void> {
    const decodes = sources.map((source) => {
      const image = new Image();
      image.src = source;
      return image.decode().catch(() => undefined);
    });
    const cap = new Promise((resolve) => setTimeout(resolve, ART_WAIT_MS));

    await Promise.race([Promise.all(decodes), cap]);
  }

  function pickupLabel(rate: number): string {
    return `${percentFormat.format(rate * 100)}%`;
  }

  function inputAmount(event: Event): number {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    return Number.isFinite(value)
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value)))
      : 0;
  }

  $effect(() => {
    const banner = selectedBanner;
    if (!banner || banner.event.id === announcedBannerId) return;

    announcedBannerId = banner.event.id;
    const offers = untrack(() =>
      purchases.filter(({ plan }) => plan.shortfall === 0).map(({ offer }) => offer.historyLabel)
    );
    const affordable = offers.length ? offers.join(', ') : 'nothing';
    announce(`${timelineDisplayTitle(banner.event)}. You can buy ${affordable}.`);
  });

  onMount(() => {
    quickPulls = readQuickPulls();
    void load();
    return () => {
      request++;
      repository.destroy();
    };
  });
</script>

<svelte:head>
  <title>Gacha Simulator · uma.moe</title>
  <meta
    name="description"
    content="Simulate live, preliminary, and future character and support card banners with game rates."
  />
</svelte:head>

<AppPage
  routeId="gacha-simulator"
  title="Gacha Simulator"
  description="Test your luck on live, preliminary, and future character and support card banners."
  width="normal"
>
  {#if loading}
    <Card>
      <Spinner
        centered
        label="Loading banner odds…"
        minHeight="240px"
      />
    </Card>
  {:else if loadError}
    <Banner
      title="The gacha pools could not be loaded"
      tone="danger"
    >
      <p>{loadError}</p>
      <Button
        size="sm"
        variant="secondary"
        icon="refresh"
        onclick={() => void load()}
      >
        Try again
      </Button>
    </Banner>
  {:else if selectedBanner && catalog}
    <Card padding="sm">
      <section aria-labelledby="banner-setup-title">
        <div class="section-heading">
          <h2 id="banner-setup-title">Banner</h2>
          <SegmentedControl
            compact
            label="Gacha type"
            options={[
              { value: 'character', label: 'Characters' },
              { value: 'support', label: 'Support cards' }
            ]}
            value={kind}
            onchange={selectKind}
          />
        </div>
        <GachaBannerPicker
          banners={kindBanners}
          bind:value={selectedId}
          onselect={selectBanner}
        />
        <div class="banner-details">
          {#if selectedBanner.event.image}
            <img
              class="banner-image"
              src={selectedBanner.event.image}
              alt={`${timelineDisplayTitle(selectedBanner.event)} banner`}
            />
          {/if}
          <div class="banner-info">
            <div class="banner-title">
              <h3>{timelineDisplayTitle(selectedBanner.event)}</h3>
              <Badge tone={selectedBanner.pool.source === 'live' ? 'success' : 'warning'}>
                {sourceLabel}
              </Badge>
            </div>
            <div class="banner-meta">
              <time>{selectedBanner.event.dateLabel}</time>
              <InspectPopover
                label="About these odds"
                openOnHover
              >
                {#snippet trigger()}
                  <InfoIcon />
                {/snippet}
                <p>{sourceHelp}</p>
              </InspectPopover>
            </div>
            {#if featuredItems.length}
              <ul
                class="pickup-rows"
                aria-label="Featured pickups"
              >
                {#each featuredItems.slice(0, FEATURED_LIMIT) as item (item.id)}
                  <li>
                    <img
                      src={item.thumbImage}
                      alt=""
                      loading="lazy"
                    />
                    <span title={item.name}>{item.name}</span>
                    <b>{pickupLabel(item.rate)}</b>
                  </li>
                {/each}
              </ul>
              {#if featuredItems.length > FEATURED_LIMIT}
                <InspectPopover label="All featured pickups">
                  {#snippet trigger()}
                    <span class="pickup-more">
                      +{featuredItems.length - FEATURED_LIMIT} more
                    </span>
                  {/snippet}
                  <ul
                    class="pickup-rows popover-rows"
                    aria-label="All featured pickups"
                  >
                    {#each featuredItems as item (item.id)}
                      <li>
                        <img
                          src={item.thumbImage}
                          alt=""
                          loading="lazy"
                        />
                        <span title={item.name}>{item.name}</span>
                        <b>{pickupLabel(item.rate)}</b>
                      </li>
                    {/each}
                  </ul>
                </InspectPopover>
              {/if}
            {/if}
            <dl class="rates">
              <div>
                <dt>{topLabel}</dt>
                <dd>{percentFormat.format(rarityRate(selectedBanner.pool, 3) * 100)}%</dd>
              </div>
              <div>
                <dt>{middleLabel}</dt>
                <dd>{percentFormat.format(rarityRate(selectedBanner.pool, 2) * 100)}%</dd>
              </div>
              <div>
                <dt>{lowLabel}</dt>
                <dd>{percentFormat.format(rarityRate(selectedBanner.pool, 1) * 100)}%</dd>
              </div>
            </dl>
          </div>
        </div>
        <div class="pull-setup">
          <div class="budget-fields">
            <TextField
              id="gacha-ticket-budget"
              label={kind === 'support' ? 'Support tickets' : 'Trainee tickets'}
              type="number"
              min={0}
              step={1}
              value={String(ticketBudgets[kind])}
              prefixIcon="ticket"
              oninput={updateTickets}
              onblur={(event) => restoreBudgetField(event, ticketBudgets[kind])}
            />
            <TextField
              id="gacha-free-budget"
              label="Free Carats"
              type="number"
              min={0}
              step={1}
              value={String(freeCarats)}
              prefixIcon="diamond"
              oninput={(event) => updateCarats(event, false)}
              onblur={(event) => restoreBudgetField(event, freeCarats)}
            />
            <TextField
              id="gacha-paid-budget"
              label="Paid Carats"
              type="number"
              min={0}
              step={1}
              value={String(paidCarats)}
              prefixIcon="paid"
              oninput={(event) => updateCarats(event, true)}
              onblur={(event) => restoreBudgetField(event, paidCarats)}
            />
          </div>
          <div class="budget-meta">
            <Checkbox
              id="gacha-quick-pulls"
              label="Skip pull animations"
              bind:checked={quickPulls}
              onchange={(checked) => writeQuickPulls(checked)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              onclick={resetBudget}
            >
              Reset budget
            </Button>
          </div>
          <div
            class="start-pull"
            bind:this={startPull}
          >
            <Button
              icon="dice"
              disabled={!anyPurchaseAffordable}
              onclick={() => (pulling = true)}
            >
              Start Pulls
            </Button>
          </div>
          {#if blockedReason}
            <p class="draw-blocked">
              <Icon
                name="info"
                size={14}
              />
              {blockedReason}
            </p>
          {/if}
        </div>
      </section>
    </Card>

    <Card padding="sm">
      {#key selectedBanner.event.id}
        <GachaPullHistory
          {session}
          {kind}
          {topLabel}
          {middleLabel}
          {lowLabel}
          onclear={clearHistory}
        />
      {/key}
    </Card>

    <GachaPullDialog
      bind:open={pulling}
      bannerName={timelineDisplayTitle(selectedBanner.event)}
      {kind}
      results={currentPull}
      {purchases}
      {drawing}
      quick={quickPulls}
      blockedNote={blockedReason}
      {announcement}
      {announcementSeq}
      onpull={draw}
      onclose={() => (pulling = false)}
    />
  {/if}

  <p
    class="sr-only"
    aria-live="polite"
    aria-atomic="true"
  >
    {#key announcementSeq}{announcement}{/key}
  </p>
</AppPage>

<style>
  @import './gacha-simulator/gacha-simulator-page.css';
</style>
