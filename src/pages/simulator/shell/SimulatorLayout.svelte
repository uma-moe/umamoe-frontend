<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import { router } from '@/routes/router';

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
      icon: 'race',
      title: 'Race simulator',
      blurb: 'Compare runners, understand race performance, and test changes to your builds.',
      load: () => import('../RaceSimPage.svelte')
    },
    {
      id: 'stamina',
      path: '/simulator',
      label: 'HP calculator',
      icon: 'battery',
      title: 'HP calculator',
      blurb:
        'Check whether a runner’s HP lasts a full last spurt on your course, and how much stamina she needs.',
      load: () => import('../SimulatorPage.svelte')
    },
    {
      id: 'build',
      path: '/simulator/build',
      label: 'Build search',
      icon: 'tune',
      title: 'Build search',
      blurb:
        'Find the skills to buy with her SP at the end of a career, for a CM or Team Trials race.',
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
  eyebrow="Simulator"
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
