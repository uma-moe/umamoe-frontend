<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import { router } from '@/routes/router';
  import { saveSimulatorCourse } from '../simulator-session.svelte';

  /**
   * The simulator's page: the same heading, gutters and ad rail as every other page, with the tabs beside the
   * title. It stays in place while the tab below changes, so switching tabs only swaps the content.
   */
  let { children }: { children: Snippet } = $props();

  const TABS = [
    {
      id: 'race',
      path: '/simulator/race',
      label: 'Race sim',
      icon: 'stopwatch',
      title: 'Race simulator',
      blurb: 'Race your runners, compare builds and test changes.',
      load: () => import('../RaceSimPage.svelte')
    },
    {
      id: 'stamina',
      path: '/simulator/hp',
      label: 'HP calculator',
      icon: 'battery',
      title: 'HP calculator',
      blurb: 'Check she has the HP to spurt to the finish, and the stamina it takes.',
      load: () => import('../SimulatorPage.svelte')
    },
    {
      id: 'build',
      path: '/simulator/skills',
      label: 'Build optimizer',
      icon: 'tune',
      title: 'Build optimizer',
      blurb: 'Pick the skills to buy with her remaining SP, for CM or Team Trials.',
      load: () => import('../BuildPage.svelte')
    }
  ] as const;

  const tab = $derived(
    TABS.find((item) => item.path === router.route.pathname.replace(/\/+$/, '')) ?? TABS[1]
  );

  const items: TabItem[] = TABS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.path,
    onintent: () => void item.load().catch(() => {})
  }));

  // Every tab races on the session's course; keep it in this browser so a reload returns to it.
  $effect(saveSimulatorCourse);

  // The other tabs' code loads while this one is open, so a switch shows them at once.
  onMount(() => {
    for (const item of TABS) void item.load().catch(() => {});
  });
</script>

<svelte:head>
  <title>{tab.title} · uma.moe</title>
  <meta
    name="robots"
    content="noindex, nofollow"
  />
</svelte:head>

<AppPage
  routeId={tab.id === 'stamina' ? 'simulator' : 'simulator-' + tab.id}
  title={tab.title}
  description={tab.blurb}
  width="wide"
  adSurface="tools"
>
  {#snippet actions()}
    <div class="modes">
      <Tabs
        {items}
        value={tab.id}
        label="Simulator mode"
      />
    </div>
  {/snippet}
  {@render children()}
</AppPage>

<style>
  .modes {
    min-width: 0;
    max-width: 100%;
  }
  @media (max-width: 767px) {
    .modes {
      width: 100%;
    }
  }
</style>
