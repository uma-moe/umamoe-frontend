<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import SimulatorRunnerFace from './SimulatorRunnerFace.svelte';
  import { runnerColor } from './simulation-report';
  import type { MarginUnit } from './simulation-comparison';
  import type { MonteCarloResult } from '../simulator-repository';
  import type { SimulatorUma } from '../simulator-uma';

  /** The sticky bar over the report: section links, comparison scope, margin unit and who is compared. */
  interface Props {
    result?: MonteCarloResult;
    umas: SimulatorUma[];
    selected: number[];
    scoped: number[];
    reference: number;
    notice: string;
    scope: 'picked' | 'field';
    marginUnit: MarginUnit;
    /** The bar's height, so section anchors scroll clear of it. */
    navHeight?: number;
  }

  let {
    result,
    umas,
    selected,
    scoped,
    reference,
    notice,
    scope = $bindable(),
    marginUnit = $bindable(),
    navHeight = $bindable(0)
  }: Props = $props();

  let activeSection = $state('overview');
  // One long page: the pill bar jumps to each section and follows the scroll position.
  const sections: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'stamina', label: 'Stamina & race', icon: 'battery' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'field', label: 'Full field', icon: 'users' },
    { id: 'replays', label: 'Replays', icon: 'race' }
  ].map((item) => ({ ...item, href: '#report-' + item.id })) as TabItem[];

  let navigation = $state<HTMLElement>(),
    navWidth = $state(0);

  function jump(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#report-"]');
    if (
      !link ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    // Handled here so the router does not treat the anchor as a page navigation.
    event.preventDefault();
    const id = link.hash.slice('#report-'.length);
    activeSection = id;
    document
      .getElementById('report-' + id)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  $effect(() => {
    if (!result) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (navigation?.getBoundingClientRect().bottom ?? 0) + 24;
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      let current = sections[0]!.id;
      for (const section of sections) {
        const top = document.getElementById('report-' + section.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = section.id;
      }

      activeSection = atEnd ? sections.at(-1)!.id : current;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => {
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  });

  const runnerName = (source: number) => umas[source]!.name;
  // The sticky bar shows who is being compared with whom as portraits; the names are in its tooltip.
  const compared = $derived(scoped.filter((source) => source !== reference));
  const list = (names: string[]) =>
    names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : (names[0] ?? '');

  const comparisonTitle = $derived(
    'Comparing ' +
      (scope === 'picked' ? list(compared.map(runnerName)) : 'all ' + umas.length + ' runners') +
      ' with baseline ' +
      runnerName(reference) +
      '. Select to choose runners.'
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Delegates activation of the section links inside.) -->
<div
  class="workspace-navigation"
  bind:this={navigation}
  bind:offsetHeight={navHeight}
  bind:clientWidth={navWidth}
  onclick={jump}
>
  <Tabs
    variant="pills"
    compact
    id="simulation-tabs"
    label="Simulation results sections"
    items={sections}
    value={activeSection}
  />
  <div class="scope-bar">
    <SegmentedControl
      compact
      label="Comparison scope"
      options={[
        { value: 'picked', label: selected.length + ' picked' },
        { value: 'field', label: 'All ' + umas.length }
      ]}
      bind:value={scope}
    />
    <SegmentedControl
      compact
      label="Margin unit"
      options={[
        {
          value: 'lengths',
          label: navWidth && navWidth < 600 ? 'L' : 'Lengths',
          title: 'Margins in lengths first'
        },
        {
          value: 'seconds',
          label: navWidth && navWidth < 600 ? 's' : 'Seconds',
          title: 'Margins in seconds first'
        }
      ]}
      bind:value={marginUnit}
    />
    <button
      type="button"
      class="comparison-pick"
      aria-label="Choose runners"
      title={comparisonTitle}
      onclick={() =>
        document.getElementById('simulation-field-overview')?.scrollIntoView({ block: 'start' })}
    >
      <span class="faces">
        {#each compared.slice(0, 5) as source (source)}<span
            class="ring"
            style:--runner={runnerColor(source)}
          >
            <SimulatorRunnerFace
              cardId={umas[source]!.cardId}
              size={24}
            />
          </span>{/each}{#if compared.length > 5}<small>+{compared.length - 5}</small>{/if}
      </span>
      <small>vs</small>
      <span
        class="ring baseline"
        style:--runner={runnerColor(reference)}
      >
        <SimulatorRunnerFace
          cardId={umas[reference]!.cardId}
          size={24}
        />
      </span>
    </button>
  </div>
  {#if notice}<p role="status">{notice}</p>{/if}
</div>
