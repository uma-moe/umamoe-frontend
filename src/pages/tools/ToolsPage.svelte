<script lang="ts">
  import FeatureLink from '@/components/cards/FeatureLink.svelte';
  import LandingPage from '@/layouts/LandingPage.svelte';

  const tools = [
    {
      href: '/tools/master-data',
      icon: 'database' as const,
      accent: 'primary',
      title: 'Master Data',
      description: 'Query every game table',
      updated: true
    },
    {
      href: '/tools/skill-explorer',
      icon: 'chart' as const,
      accent: 'pink',
      title: 'Skill Explorer',
      description: 'Skill values per course'
    },
    {
      href: '/tools/statistics',
      icon: 'chart' as const,
      accent: 'primary',
      title: 'Team Stadium Statistics',
      description: 'Charts and data analysis'
    },
    {
      href: '/timeline?tab=carat-planner',
      icon: 'paid' as const,
      accent: 'secondary',
      title: 'Carat Planner',
      description: 'Plan pulls and banners'
    },
    {
      href: '/tools/lineage-planner',
      icon: 'lineage' as const,
      accent: 'success',
      title: 'Lineage Planner',
      description: 'Plan your inheritance tree'
    },
    {
      href: '/simulator/hp',
      icon: 'battery' as const,
      accent: 'warning',
      title: 'HP Calculator',
      description: 'Check HP for a full spurt'
    },
    {
      href: '/simulator/race',
      icon: 'gauge' as const,
      accent: 'pink',
      title: 'Race Simulator',
      description: 'Simulate race outcomes'
    },
    {
      href: '/simulator/skills',
      icon: 'tune' as const,
      accent: 'success',
      title: 'Build Optimizer',
      description: 'Find the best skill buys'
    }
  ];
</script>

<svelte:head>
  <title>Tools &amp; Calculators - uma.moe</title>
  <meta
    name="description"
    content="Calculation tools and utilities for Umamusume trainers including statistics, training calculators, and simulation tools"
  />
</svelte:head>
<LandingPage
  routeId="tools"
  title="Tools & Calculators"
  description="Calculation tools and utilities for Umamusume trainers"
>
  {#each tools as tool}
    <FeatureLink {...tool} />
  {/each}
</LandingPage>
