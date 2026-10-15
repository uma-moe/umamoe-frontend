<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { isElementVisible } from '@/lib/element-visibility';
  import { router } from '@/routes/router';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import GuidedTourCallout from '@/components/overlays/GuidedTourCallout.svelte';
  import {
    pageStepIds,
    pageTourForUrl,
    tourSteps,
    type PageTourId,
    type TourStep
  } from './page-tours';
  import {
    tourAudience,
    hasSeenTour,
    markTourSeen,
    tourStepId,
    interactiveTourSteps
  } from './tour-state';
  import { calloutPosition, tourHole } from './tour-position';
  import PageTourIntro from './PageTourIntro.svelte';

  let { startRequest = 0 }: { startRequest?: number } = $props();

  let intro = $state<PageTourId>();
  let steps = $state<TourStep[]>([]);
  let index = $state(-1);
  let shown = $state(false);
  let problem = $state('');

  let layer: HTMLDivElement;

  let callout = $state<HTMLDivElement>();

  let anchor: HTMLElement | undefined;
  let returnFocus: HTMLElement | undefined;
  let introTimer: ReturnType<typeof setTimeout>;
  let generation = 0;
  let frame = 0;
  let sizing: ResizeObserver | undefined;
  let lastRequest = 0;
  let activePage: PageTourId | undefined;
  let oldOverflow = '';
  let scrollLocked = false;

  const step = $derived(steps[index]);

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  function closeIntro(): void {
    if (intro) markTourSeen(intro);
    intro = undefined;
  }

  function end(): void {
    generation++;
    shown = false;
    index = -1;
    tourStepId.set('');
    delete document.body.dataset.tourStepId;
    if (layer?.matches(':popover-open')) layer.hidePopover();
    if (scrollLocked) {
      document.documentElement.style.overflow = oldOverflow;
      scrollLocked = false;
    }

    if (returnFocus?.isConnected && !document.querySelector('dialog[open]'))
      returnFocus.focus({ preventScroll: true });
    returnFocus = undefined;
    anchor = undefined;
    sizing?.disconnect();
  }

  function target(current: TourStep): HTMLElement | undefined {
    const matches = [...document.querySelectorAll<HTMLElement>(current.selector)].filter((node) =>
      isElementVisible(node)
    );

    // Repeated timeline cards: inspect the one already in the viewport before scrolling to a fallback.
    if (current.stepId === 'timeline-event-card')
      return (
        matches.find((node) => {
          const r = node.getBoundingClientRect();
          return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
        }) ?? matches[0]
      );
    return matches[0];
  }

  function position(): void {
    if (!shown || !anchor?.isConnected || !callout || !step) return;
    const hole = tourHole(anchor.getBoundingClientRect(), innerWidth, innerHeight);
    layer.style.setProperty('--hole-left', hole.left + 'px');
    layer.style.setProperty('--hole-top', hole.top + 'px');
    layer.style.setProperty('--hole-right', Math.max(hole.left, hole.right) + 'px');
    layer.style.setProperty('--hole-bottom', Math.max(hole.top, hole.bottom) + 'px');
    const placed = calloutPosition(
      hole,
      callout.getBoundingClientRect(),
      step,
      innerWidth,
      innerHeight
    );

    callout.style.left = placed.left + 'px';
    callout.style.top = placed.top + 'px';
  }

  function schedulePosition(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  }

  async function show(next: number, direction = 1): Promise<void> {
    const ticket = ++generation;
    shown = false;
    if (next < 0 || next >= steps.length) {
      end();
      return;
    }

    index = next;
    const current = steps[next]!;
    tourStepId.set(current.stepId);
    document.body.dataset.tourStepId = current.stepId;
    await tick();
    await wait(current.delayBeforeStepShow ?? 80);
    const deadline = performance.now() + (current.asyncStepTimeout ?? 5000);
    let found = target(current);
    while (!found && ticket === generation && performance.now() < deadline) {
      await wait(100);
      found = target(current);
    }

    if (ticket !== generation) return;
    if (!found) {
      if (current.isOptional) {
        void show(next + direction, direction);
        return;
      }

      problem =
        'The tour could not find “' +
        current.title +
        '”. Wait for the page to finish loading, then try the help button again.';
      end();
      return;
    }

    anchor = found;
    found.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    shown = true;
    await tick();
    if (ticket !== generation) return;
    if (!layer.matches(':popover-open')) layer.showPopover();
    sizing?.disconnect();
    sizing?.observe(found);
    if (callout) sizing?.observe(callout);
    position();
    callout?.querySelector<HTMLElement>('.tour')?.focus({ preventScroll: true });
    schedulePosition();
  }

  async function start(): Promise<void> {
    clearTimeout(introTimer);
    closeIntro();
    end();
    problem = '';
    activePage = pageTourForUrl(location.href);
    if (activePage) markTourSeen(activePage);
    // Angular starts the Activity tour on the list even when launched from a report.
    if (activePage === 'activity' && location.pathname !== '/activity')
      await router.navigate('/activity');
    await tick();
    const ids = activePage ? pageStepIds[activePage] : ['replay'];
    steps = ids.map((id) => tourSteps.find((candidate) => candidate.stepId === id)!);
    if (activePage === 'timeline' || activePage === 'carat-planner')
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (activePage === 'timeline')
      window.dispatchEvent(new CustomEvent('umamoe:prepare-timeline-tour'));
    // Touch Safari clears activeElement during the launching click; keep the explicit replay control.
    returnFocus =
      document.querySelector<HTMLElement>('[aria-label="Start guided tour"]') ?? undefined;
    oldOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    scrollLocked = true;
    void show(0);
  }

  function next(): void {
    if (shown && step && !interactiveTourSteps.has(step.stepId)) void show(index + 1);
  }

  function interaction(event: Event): void {
    if (
      shown &&
      step &&
      (event as CustomEvent<string>).detail === step.stepId &&
      interactiveTourSteps.has(step.stepId)
    )
      void show(index + 1);
  }

  function keydown(event: KeyboardEvent): void {
    if (index < 0 || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      end();
      return;
    }

    const node = event.target as HTMLElement;
    if (event.key === 'Tab') {
      const selector =
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]';

      const controls = [
        ...(anchor?.matches(selector) ? [anchor] : []),
        ...(anchor?.querySelectorAll<HTMLElement>(selector) ?? []),
        ...(callout?.querySelectorAll<HTMLElement>(selector) ?? [])
      ].filter((node) => isElementVisible(node));

      if (!controls.length) return;
      event.preventDefault();
      const at = controls.findIndex((control) => control === document.activeElement);
      const next = (at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next]?.focus();
    } else if (
      !interactiveTourSteps.has(step?.stepId ?? '') &&
      !node.closest('input,textarea,select,[role="combobox"],[role="radiogroup"],[role="tablist"]')
    ) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        void show(index - 1, -1);
      }
    }
  }

  function scheduleIntro(delay = 1800): void {
    clearTimeout(introTimer);
    const page = pageTourForUrl(location.href);
    if (!page || index >= 0 || intro || hasSeenTour(page) || tourAudience() !== 'new') return;
    introTimer = setTimeout(() => {
      if (page !== pageTourForUrl(location.href) || index >= 0 || intro) return;
      if (document.querySelector('dialog[open]')) {
        scheduleIntro(1000);
        return;
      }

      intro = page;
    }, delay);
  }

  function pageChanged(): void {
    if (index >= 0 && activePage !== pageTourForUrl(location.href)) end();
    scheduleIntro();
  }

  $effect(() => {
    router.route.pathname;
    untrack(pageChanged);
  });

  $effect(() => {
    if (startRequest > lastRequest) {
      lastRequest = startRequest;
      untrack(() => void start());
    }
  });

  onMount(() => {
    addEventListener('umamoe:tour-interaction', interaction);
    addEventListener('umamoe:tour-page-changed', pageChanged);
    addEventListener('keydown', keydown);
    addEventListener('resize', schedulePosition);
    addEventListener('scroll', schedulePosition, true);
    sizing = new ResizeObserver(schedulePosition);
    return () => {
      clearTimeout(introTimer);
      cancelAnimationFrame(frame);
      sizing?.disconnect();
      end();
      closeIntro();
      removeEventListener('umamoe:tour-interaction', interaction);
      removeEventListener('umamoe:tour-page-changed', pageChanged);
      removeEventListener('keydown', keydown);
      removeEventListener('resize', schedulePosition);
      removeEventListener('scroll', schedulePosition, true);
    };
  });
</script>

<div
  bind:this={layer}
  class="tour-layer"
  popover="manual"
>
  {#if shown && step}
    <div
      class="hole"
      aria-hidden="true"
    ></div>
    <div
      class="block above"
      aria-hidden="true"
    ></div>
    <div
      class="block below"
      aria-hidden="true"
    ></div>
    <div
      class="block before"
      aria-hidden="true"
    ></div>
    <div
      class="block after"
      aria-hidden="true"
    ></div>
    <div
      class="callout"
      bind:this={callout}
    >
      <GuidedTourCallout
        title={step.title}
        description={step.content}
        step={index + 1}
        total={steps.length}
        nextLabel={step.nextBtnTitle}
        nextDisabled={interactiveTourSteps.has(step.stepId)}
        onback={() => void show(index - 1, -1)}
        onnext={next}
        ondismiss={end}
      />
    </div>
  {/if}
</div>
{#if intro}
  <PageTourIntro
    {intro}
    onclose={closeIntro}
    onstart={() => {
      const page = intro;
      closeIntro();
      if (page === pageTourForUrl(location.href)) void start();
    }}
  />
{/if}
{#if problem}
  <Dialog
    title="Tour unavailable"
    open
    onclose={() => (problem = '')}
  >
    <p>{problem}</p>
  </Dialog>
{/if}

<style>
  .tour-layer {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    overflow: visible;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
  .tour-layer::backdrop {
    background: transparent;
    pointer-events: none;
  }
  .hole {
    position: absolute;
    top: var(--hole-top);
    left: var(--hole-left);
    width: calc(var(--hole-right) - var(--hole-left));
    height: calc(var(--hole-bottom) - var(--hole-top));
    border-radius: 4px;
    box-shadow: 0 0 0 200vmax rgb(3 7 18/0.64);
    outline: 1px solid rgb(var(--accent-primary-rgb) / 0.4);
  }
  .block {
    position: absolute;
    pointer-events: auto;
  }
  .above {
    inset: 0 0 auto;
    height: var(--hole-top);
  }
  .below {
    inset: var(--hole-bottom) 0 0;
  }
  .before {
    top: var(--hole-top);
    bottom: calc(100% - var(--hole-bottom));
    left: 0;
    width: var(--hole-left);
  }
  .after {
    top: var(--hole-top);
    bottom: calc(100% - var(--hole-bottom));
    left: var(--hole-right);
    right: 0;
  }
  .callout {
    position: absolute;
    width: min(410px, calc(100vw - 24px));
    pointer-events: auto;
  }
  @media (max-width: 600px) {
    .callout {
      width: calc(100vw - 16px);
    }
  }
</style>
