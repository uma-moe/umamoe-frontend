<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import { UPDATE_LOG, type ChangeCategory } from '@/services/site/update-log';
  import { CURRENT_UPDATE_VERSION } from '@/services/site/site-services';
  import { afterPageReady } from '@/routes/after-page-paint';
  import ReleaseTour from './updates/ReleaseTour.svelte';

  let { request = 0 }: { request?: number } = $props();

  let open = $state(false);
  let history = $state(false);

  const updates = UPDATE_LOG.map((update) => ({
    ...update,
    categories: update.categories.filter(
      (category) => !category.betaOnly || __APP_ENVIRONMENT__ !== 'production'
    )
  }));

  const latest = updates[0]!;
  const featuredCategories = latest.categories.filter((category) => category.preview);
  const categoryIcons: Record<string, IconName> = {
    major: 'gauge',
    improvement: 'trending-up',
    minor: 'star',
    bugfix: 'check'
  };

  function releaseDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(`${date}T12:00:00`));
  }

  function close() {
    open = false;
    try {
      localStorage.setItem('lastSeenUpdateVersion', String(CURRENT_UPDATE_VERSION));
    } catch {
      /* Reading remains available without storage. */
    }
  }

  $effect(() => {
    if (request) {
      history = false;
      open = true;
    }
  });

  onMount(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    void afterPageReady().then(() => {
      if (stopped) return;
      timer = setInterval(() => {
        try {
          if (
            Number(localStorage.getItem('lastSeenUpdateVersion') ?? 0) >= CURRENT_UPDATE_VERSION
          ) {
            clearInterval(timer);
            return;
          }
        } catch {
          clearInterval(timer);
          return;
        }

        if (document.hidden || document.querySelector('dialog[open], [data-tour-overlay]')) return;
        open = true;
        clearInterval(timer);
      }, 1500);
    });

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  });
</script>

{#snippet releaseSections(categories: ChangeCategory[])}
  <div class="release-highlights">
    {#each categories as category}
      <section class="highlight">
        <h3>
          <Icon
            name={category.icon ?? categoryIcons[category.category] ?? 'star'}
            size={15}
          />{category.label}
        </h3>
        <ul>
          {#each category.items as item}
            <li>
              <span class="item-icon">
                <Icon
                  name={categoryIcons[category.category] ?? 'star'}
                  size={14}
                />
              </span>
              {#if item.link}
                <a
                  class="change-link"
                  href={item.link}
                  onclick={close}
                >
                  <span>{item.text}</span>
                  <Icon
                    name="arrow-right"
                    size={15}
                  />
                </a>
              {:else}
                <span class="change-text">{item.text}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/snippet}
{#if open}
  <Dialog
    {open}
    title="What’s new"
    maxWidth={history || !featuredCategories.length ? '580px' : '1000px'}
    maxHeight="90dvh"
    mobileInset="16px"
    contentPadding="0"
    mobileContentPadding="0"
    onclose={close}
  >
    {#snippet headerIdentity(titleId)}
      <div
        class="release-header"
        data-nosnippet
        class:latest-header={!history}
      >
        <span
          id={titleId}
          class="sr-only"
        >
          What’s new
        </span>
        {#if history}
          <span class="header-icon">
            <Icon
              name="timeline"
              size={18}
            />
          </span>
          <h2>Previous updates</h2>
          <span class="header-meta">{updates.length - 1} releases</span>
        {:else}
          {#if latest.version}
            <span
              class="version-badge"
              title="uma.moe {latest.version}"
            >
              {latest.version}
            </span>
          {/if}
          <div class="release-title">
            <h2>{latest.title}</h2>
            {#if latest.date}
              <time
                class="header-meta"
                datetime={latest.date}
              >
                {releaseDate(latest.date)}
              </time>
            {/if}
          </div>
        {/if}
      </div>
    {/snippet}
    <div
      class="release-content"
      data-nosnippet
    >
      {#if history}
        <div class="release-history">
          {#each updates.slice(1) as update, index}
            {#if update.date && (index === 0 || update.date.slice(0, 4) !== updates[index]?.date?.slice(0, 4))}
              <h3 class="history-year">
                {update.date.slice(0, 4)}
              </h3>
            {/if}
            <details name="release-history">
              <summary>
                {#if update.date}
                  <time
                    class="history-date"
                    datetime={update.date}
                    aria-label={releaseDate(update.date)}
                  >
                    <span>
                      {new Date(`${update.date}T12:00:00`).toLocaleDateString('en', {
                        month: 'short'
                      })}
                    </span>
                    <b>{Number(update.date.slice(8))}</b>
                  </time>
                {/if}
                <div class="history-title">
                  <strong>{update.title}</strong>
                  <span>
                    {update.categories.reduce(
                      (count, category) => count + category.items.length,
                      0
                    )} changes
                  </span>
                </div>
                <span class="disclosure">
                  <Icon
                    name="chevron"
                    size={16}
                  />
                </span>
              </summary>
              {@render releaseSections(update.categories)}
            </details>
          {/each}
        </div>
      {:else}
        <div class="latest-release">
          {#if latest.summary}
            <p class="release-summary">{latest.summary}</p>
          {/if}
          {#if featuredCategories.length}
            <ReleaseTour
              categories={featuredCategories}
              onexplore={close}
            />
          {:else}
            {@render releaseSections(latest.categories)}
          {/if}
        </div>
      {/if}
    </div>
    {#snippet actions()}
      <div class="release-actions">
        <Button
          size="sm"
          variant="ghost"
          icon={history ? 'arrow-left' : undefined}
          onclick={() => (history = !history)}
        >
          {history ? 'Latest release' : 'Previous updates'}
        </Button>
        <Button
          href="https://discord.uma.moe/"
          target="_blank"
          size="sm"
          variant="ghost"
          icon="discord"
          title="Report a bug or share feedback on Discord"
        >
          Feedback
        </Button>
        <span class="footer-spacer"></span>
        <Button
          size="sm"
          onclick={close}
        >
          Got it
        </Button>
      </div>
    {/snippet}
  </Dialog>
{/if}

<style>
  @import './update-notification.css';
</style>
