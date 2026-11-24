<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import {
    buildPreliminaryEventSummary,
    formatPreliminaryTimestamp
  } from '@/lib/timeline/events/timeline-preliminary';
  import type { TimelinePickupCatalog } from '@/lib/timeline/events/timeline-pickups';
  import type { TimelinePreliminarySummary } from '@/lib/timeline/prediction/timeline-prediction-types';
  import { hideImage } from '../details/timeline-event-details';
  import type { TimelineRecord } from '../timeline-repository';

  interface Props {
    open: boolean;
    summary: TimelinePreliminarySummary;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    onclose: () => void;
    onjump: (event: TimelineRecord) => void;
    onopen: (event: TimelineRecord) => void;
  }

  let { open, summary, events, catalog, onclose, onjump, onopen }: Props = $props();

  const items = $derived(events.map((event) => buildPreliminaryEventSummary(event, catalog)));
  const updatedLabel = $derived(
    formatPreliminaryTimestamp(summary.cdnLastModified ?? summary.detectedAt)
  );

  function jumpTo(event: TimelineRecord) {
    onclose();
    onjump(event);
  }

  function openEvent(event: TimelineRecord) {
    onclose();
    onopen(event);
  }
</script>

<Dialog
  {open}
  title="Preliminary banner changes"
  description="Upcoming Global banners that differ from the expected schedule"
  maxWidth="560px"
  maxHeight="82dvh"
  mobileMaxHeight="88dvh"
  contentPadding="10px 12px"
  mobileContentPadding="10px 12px"
  {onclose}
>
  {#snippet eyebrow()}
    <div class="prelim-eyebrow">
      <Icon
        name="warning"
        size={13}
      />
      <span>Preliminary confirmed</span>
      {#if updatedLabel}
        <span class="updated">Updated {updatedLabel}</span>
      {/if}
    </div>
  {/snippet}

  <div class="prelim-dialog">
    <div class="prelim-disclaimer">
      <Icon
        name="warning"
        size={13}
      />
      <p>
        <strong>Preliminary confirmed.</strong>
        Subject to change by Cygames before official release.
      </p>
    </div>

    <div class="prelim-list">
      {#each items as item (item.event.id)}
        <article class="prelim-item">
          <header class="prelim-item-head">
            {#if item.event.image}
              <img
                class="prelim-banner-thumb"
                src={item.event.image}
                alt={item.title}
                width="148"
                height="36"
                decoding="async"
                onerror={hideImage}
              />
            {/if}
            <div class="prelim-item-title">
              <span class="prelim-type">{item.event.typeLabel} · {item.releaseDateLabel}</span>
              <h3>{item.title}</h3>
            </div>
            <div class="prelim-item-actions">
              <Button
                size="sm"
                variant="secondary"
                onclick={() => jumpTo(item.event)}
              >
                Jump
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onclick={() => openEvent(item.event)}
              >
                Details
              </Button>
            </div>
          </header>

          <div class="prelim-body">
            {#if item.mergedEvents.length}
              <div class="prelim-line">
                <span class="prelim-label">Merged</span>
                <span class="prelim-value">
                  {#each item.mergedEvents as merged (merged.eventId)}
                    <span>
                      <strong>{merged.title}</strong>
                      {#if merged.gachaId}
                        <code>#{merged.gachaId}</code>
                      {/if}
                      {#if merged.estimatedDateLabel}
                        <span class="muted">(est. {merged.estimatedDateLabel})</span>
                      {/if}
                    </span>
                  {/each}
                </span>
              </div>
            {/if}

            {#if item.addedPickups.length || item.removedPickups.length}
              <div class="prelim-line">
                <span class="prelim-label">Pickups</span>
                <span class="prelim-chips">
                  {#each item.addedPickups as pickup (pickup.id)}
                    <span class="pickup-chip added">
                      <span class="chip-sign">+</span>
                      {#if pickup.image}
                        <img
                          class="chip-art"
                          src={pickup.image}
                          alt=""
                          width="22"
                          height="22"
                          onerror={hideImage}
                        />
                      {/if}
                      <span>{pickup.name}</span>
                    </span>
                  {/each}
                  {#each item.removedPickups as pickup (pickup.id)}
                    <span class="pickup-chip removed">
                      <span class="chip-sign">−</span>
                      {#if pickup.image}
                        <img
                          class="chip-art"
                          src={pickup.image}
                          alt=""
                          width="22"
                          height="22"
                          onerror={hideImage}
                        />
                      {/if}
                      <span>{pickup.name}</span>
                    </span>
                  {/each}
                </span>
              </div>
            {/if}

            {#if item.shiftLabel || item.durationChangeLabel || item.freePulls}
              <div class="prelim-tags">
                {#if item.estimatedDateLabel && item.shiftLabel}
                  <span class="prelim-tag">
                    <span class="before">{item.estimatedDateLabel}</span>
                    →
                    <strong>{item.releaseDateLabel}</strong>
                    <span class="tag-accent">({item.shiftLabel})</span>
                  </span>
                {/if}
                {#if item.durationChangeLabel}
                  <span class="prelim-tag">
                    Duration <strong>{item.durationChangeLabel}</strong>
                  </span>
                {/if}
                {#if item.freePulls}
                  <span class="prelim-tag free-pulls">
                    <strong>{`${item.freePulls} free pulls`}</strong>
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  </div>

  {#snippet actions()}
    <div class="prelim-footer">
      <div class="prelim-links">
        <a
          class="prelim-link"
          href="/tools/master-data?tab=history"
        >
          <Icon
            name="calendar"
            size={14}
          />
          Master version history
        </a>
        <a
          class="prelim-link"
          href="/tools/master-data?source=preliminary"
        >
          <Icon
            name="database"
            size={14}
          />
          Browse preliminary master.mdb
        </a>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onclick={onclose}
      >
        Close
      </Button>
    </div>
  {/snippet}
</Dialog>

<style>
  @import './timeline-preliminary-dialog.css';
</style>
