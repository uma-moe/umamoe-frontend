<script lang="ts">
  import type { SeoPage } from '@/services/seo';
  let { path }: { path: string } = $props();
  let sections = $state<SeoPage['guide']>();
  $effect(() => {
    const route = path;
    let active = true;
    void import('@/config/page-guides.json').then(module => {
      if (active) sections = (module.default as Record<string, SeoPage['guide']>)[route];
    }).catch(() => {});
    return () => { active = false; };
  });
</script>

{#if sections}
  <section class="page-guide" aria-label="Getting started" style="flex:none">
    {#each sections as section}
      <div><h2>{section.heading}</h2><p>{section.text}</p>
        {#if section.href}<a href={section.href}>{section.label}</a>{/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .page-guide { width:100%; max-width:960px; margin:0 auto; padding:24px var(--page-gutter-compact,16px); color:var(--text-secondary); font-size:14px; line-height:1.65; }
  .page-guide>div+div { margin-top:20px; }
  h2 { margin:0 0 6px; font-size:18px; color:var(--text-primary); }
  p { margin:0 0 8px; }
  a { color:var(--accent-primary); text-underline-offset:3px; }
</style>
