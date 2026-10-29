<script lang="ts">
  import FeatureLink from '@/components/cards/FeatureLink.svelte';
  import LandingPage from '@/layouts/LandingPage.svelte';
  import { toolLinks } from '@/routes/tool-links';
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
  {#each toolLinks as tool}
    <FeatureLink {...tool} />
  {/each}
</LandingPage>
