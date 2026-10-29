<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { ChangeCategory } from '@/services/site/update-log';

  let { categories, onexplore }: { categories: ChangeCategory[]; onexplore: () => void } = $props();

  const pickerId = $props.id();

  let selected = $state(0);

  const feature = $derived(categories[selected]);
  const isFirst = $derived(selected === 0);
  const isLast = $derived(selected === categories.length - 1);

  function show(index: number) {
    selected = Math.min(Math.max(index, 0), categories.length - 1);
  }

  /** Arrow keys walk the highlights from either the picker or the preview. */
  function step(event: KeyboardEvent) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      show(selected + 1);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      show(selected - 1);
    }
  }

  // The next preview is fetched while this one is read, so stepping through never waits on an image.
  $effect(() => {
    const next = categories[selected + 1]?.preview?.image;
    if (!next) return;

    const image = new Image();
    image.decoding = 'async';
    image.src = next;
  });
</script>

<div class="release-tour">
  <nav
    class="feature-picker"
    aria-label="Update highlights"
  >
    {#each categories as category, index}
      <button
        type="button"
        id={pickerId + '-' + index}
        aria-pressed={selected === index}
        aria-label={category.label}
        title={category.label}
        onclick={() => show(index)}
        onkeydown={step}
      >
        <Icon
          name={category.icon ?? 'star'}
          size={18}
        />
        <span class="picker-label">{category.label}</span>
      </button>
    {/each}
  </nav>
  {#if feature?.preview}
    <section
      class="feature-stage"
      aria-labelledby={pickerId + '-title'}
    >
      <figure class="feature-image">
        {#key feature.preview.image}
          <img
            src={feature.preview.image}
            alt={feature.preview.alt}
            width="1120"
            height="630"
            decoding="async"
          />
        {/key}
      </figure>
      <div
        class="feature-copy"
        aria-live="polite"
      >
        <header class="feature-heading">
          <h3 id={pickerId + '-title'}>{feature.label}</h3>
          <div class="feature-pager">
            <span class="feature-count">
              {selected + 1} of {categories.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon="arrow-left"
              ariaLabel="Previous highlight"
              disabled={isFirst}
              onclick={() => show(selected - 1)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon="arrow-right"
              ariaLabel="Next highlight"
              disabled={isLast}
              onclick={() => show(selected + 1)}
            />
          </div>
        </header>
        <ul>
          {#each feature.items as item}
            <li>{item.text}</li>
          {/each}
        </ul>
        <div class="feature-action">
          <Button
            href={feature.preview.link}
            size="sm"
            icon="arrow-right"
            onclick={onexplore}
          >
            {feature.preview.action}
          </Button>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  @import './release-tour.css';
</style>
