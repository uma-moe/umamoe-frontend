<script lang="ts">
  import FeatureLink from '@/components/FeatureLink.svelte';
  import LandingPage from '@/layouts/LandingPage.svelte';
  const tools = [
    { href: '/tools/master-data', icon: 'database' as const, accent: 'primary', title: 'Master Data', description: 'Explore game tables, inspect schemas, and run local SQL queries', updated: true },
    { href: '/tools/statistics', icon: 'chart' as const, accent: 'primary', title: 'Team Stadium Statistics', description: 'Interactive charts and data analysis' },
    { href: '/timeline?tab=carat-planner', icon: 'paid' as const, accent: 'secondary', title: 'Carat Planner', description: 'Project income, tickets, pulls, and banner goals', updated: true },
    { href: '/tools/lineage-planner', icon: 'lineage' as const, accent: 'success', title: 'Lineage Planner', description: 'Plan your full inheritance tree' },
    { icon: 'battery' as const, accent: 'warning', title: 'Stamina Calculator', description: 'Calculate optimal stamina for races' },
    { icon: 'gauge' as const, accent: 'pink', title: 'Race Simulator', description: 'Simulate race outcomes and performance' }
  ];

</script>

<svelte:head><title>Tools &amp; Calculators - uma.moe</title><meta name="description" content="Calculation tools and utilities for Umamusume trainers including statistics, training calculators, and simulation tools"/></svelte:head>
<LandingPage routeId="tools" title="Tools & Calculators" description="Calculation tools and utilities for Umamusume trainers">
  {#snippet heading()}<h1>Tools &amp; Calculators</h1>{/snippet}
  {#each tools as tool}<FeatureLink {...tool}/>{/each}
</LandingPage>

<style>
  h1 { margin:0 0 1rem; background:var(--gradient-heading); background-clip:text; color:transparent; font-size:clamp(2rem,5vw,3rem); font-weight:800; line-height:1.1; }
  @media (max-width:768px) { h1 { margin-bottom:8px; font-size:2rem; } }
</style>
