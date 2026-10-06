<script lang="ts">
  import FeatureLink from '@/components/FeatureLink.svelte';
  import LandingPage from '@/layouts/LandingPage.svelte';
  const links = [
    { href: '/database', icon: 'database' as const, accent: 'primary', title: 'Database', description: 'Browse the Database' },
    { href: '/circles', icon: 'community' as const, accent: 'secondary', title: 'Clubs', description: 'Club Database and Fan Progression' },
    { href: '/rankings', icon: 'rankings' as const, accent: 'warning', title: 'Rankings', description: 'Global Trainer Fan Rankings' },
    { href: '/tierlist', icon: 'tierlist' as const, accent: 'warning', title: 'Tierlists', description: 'Support Card Tierlist' },
    { href: '/timeline', icon: 'timeline' as const, accent: 'pink', title: 'Timeline', description: 'Estimated Release Schedule' },
    { href: '/tools', icon: 'tools' as const, accent: 'purple', title: 'Tools & Analytics', description: 'Advanced tools and statistics' }
  ];

</script>

<svelte:head><title>uma.moe Umamusume Database &amp; Tools</title><meta name="description" content="Umamusume Database, Timeline, Tierlist, and tools for the global version"/></svelte:head>
<LandingPage routeId="home" title="uma.moe" description="Umamusume resource hub for the global version">
  {#snippet heading()}
      <div class="hero-branding"><div class="hero-logo"><img src="/logo.webp" alt="uma.moe" width="150" height="150"/></div><h1>uma.moe</h1></div>
  {/snippet}
  {#each links as link}<FeatureLink {...link}/>{/each}
</LandingPage>

<style>
  .hero-branding { display:flex; align-items:center; justify-content:center; gap:2rem; margin-bottom:1rem; }
  .hero-logo { width:150px; height:150px; display:grid; place-items:center; }
  .hero-logo img { width:150px; height:150px; object-fit:contain; border-radius:50%; filter:drop-shadow(0 4px 8px rgb(0 0 0/.3)); }
  h1 { margin:0; background:var(--gradient-heading); background-clip:text; color:transparent; font-size:clamp(3rem,8vw,6rem); font-weight:800; line-height:1.1; }
  @media (prefers-reduced-motion:no-preference) { .hero-logo img { animation:gentle-pulse 4s ease-in-out infinite; } }
  @keyframes gentle-pulse { 0%,100% { transform:scale(1); } 50% { transform:translateY(-.5rem) scale(1.05); } }
  @media (min-width:769px) and (max-height:1000px) {
    .hero-branding { margin-bottom:.75rem; }
    .hero-logo,.hero-logo img { width:clamp(72px,10dvh,100px); height:clamp(72px,10dvh,100px); }h1 { font-size:clamp(3rem,8vw,4rem); }
  }
  @media (max-width:768px) {
    .hero-branding { gap:12px; margin-bottom:8px; }
    .hero-logo,.hero-logo img { width:56px; height:56px; } h1 { font-size:2rem; }
  }
</style>
