<script lang="ts">
  import FeatureLink from '@/components/FeatureLink.svelte';
  import LandingPage from '@/layouts/LandingPage.svelte';
  import PageGuide from '@/components/PageGuide.svelte';
  import pages from '@/config/seo-pages.json';
  const links = [
    { href: '/database', icon: 'database' as const, accent: 'primary', title: 'Uma Friend Database', description: 'Find trainer IDs, inheritance parents and support cards' },
    { href: '/circles', icon: 'community' as const, accent: 'secondary', title: 'Clubs', description: 'Club Database and Fan Progression' },
    { href: '/rankings', icon: 'rankings' as const, accent: 'warning', title: 'Rankings', description: 'Global Trainer Fan Rankings' },
    { href: '/tierlist', icon: 'tierlist' as const, accent: 'warning', title: 'Tierlists', description: 'Support Card Tierlist' },
    { href: '/timeline', icon: 'timeline' as const, accent: 'pink', title: 'Timeline', description: 'Global Banner & Event Schedule' },
    { href: '/tools', icon: 'tools' as const, accent: 'purple', title: 'Tools & Analytics', description: 'Advanced tools and statistics' }
  ];

</script>

<svelte:head><title>{pages['/'].title}</title></svelte:head>
<LandingPage routeId="home" title="uma.moe" description={pages['/'].description}>
  {#snippet heading()}
      <div class="hero-branding"><div class="hero-logo"><img src="/logo.webp" alt="uma.moe" width="150" height="150"/></div><span class="brand-name">uma.moe</span></div>
      <h1>{pages['/'].heading}</h1>
  {/snippet}
  {#each links as link}<FeatureLink {...link}/>{/each}
</LandingPage>
<PageGuide path="/"/>

<style>
  .hero-branding { display:flex; align-items:center; justify-content:center; gap:2rem; margin-bottom:1rem; }
  .hero-logo { width:150px; height:150px; display:grid; place-items:center; }
  .hero-logo img { width:150px; height:150px; object-fit:contain; border-radius:50%; filter:drop-shadow(0 4px 8px rgb(0 0 0/.3)); }
  .brand-name { margin:0; background:var(--gradient-heading); background-clip:text; color:transparent; font-size:clamp(3rem,8vw,6rem); font-weight:800; line-height:1.1; }
  h1 { margin:0 0 12px; color:var(--text-primary); font-size:clamp(20px,3vw,28px); line-height:1.3; }
  @media (prefers-reduced-motion:no-preference) { .hero-logo img { animation:gentle-pulse 4s ease-in-out infinite; } }
  @keyframes gentle-pulse { 0%,100% { transform:scale(1); } 50% { transform:translateY(-.5rem) scale(1.05); } }
  @media (min-width:769px) and (max-height:1000px) {
    .hero-branding { margin-bottom:.75rem; }
    .hero-logo,.hero-logo img { width:clamp(72px,10dvh,100px); height:clamp(72px,10dvh,100px); }.brand-name { font-size:clamp(3rem,8vw,4rem); }
  }
  @media (max-width:768px) {
    .hero-branding { gap:12px; margin-bottom:8px; }
    .hero-logo,.hero-logo img { width:56px; height:56px; } .brand-name { font-size:2rem; }
  }
</style>
