<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import { UPDATE_LOG, type ChangeCategory } from '@/services/update-log';
  import { CURRENT_UPDATE_VERSION } from '@/services/site-services';
  import { afterPageReady } from '@/routes/after-page-paint';
  let { request = 0 }: { request?: number } = $props();
  let open = $state(false);
  let history = $state(false);
  const updates = UPDATE_LOG.map(update => ({ ...update, categories: update.categories.filter(category => !category.betaOnly || __APP_ENVIRONMENT__ !== 'production') }));
  const latest = updates[0]!;
  const categoryIcons: Record<string, IconName> = { major: 'gauge', improvement: 'trending-up', minor: 'star', bugfix: 'check' };
  $effect(() => { if (request) { history = false; open = true; } });
  function releaseDate(date: string): string {
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
  }
  function close() {
    open = false;
    try { localStorage.setItem('lastSeenUpdateVersion', String(CURRENT_UPDATE_VERSION)); } catch { /* Reading remains available without storage. */ }
  }
  onMount(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    void afterPageReady().then(() => {
      if (stopped) return;
      timer = setInterval(() => {
        try {
          if (Number(localStorage.getItem('lastSeenUpdateVersion') ?? 0) >= CURRENT_UPDATE_VERSION) { clearInterval(timer); return; }
        } catch { clearInterval(timer); return; }
        if (document.hidden || document.querySelector('dialog[open], [data-tour-overlay]')) return;
        open = true; clearInterval(timer);
      }, 1500);
    });
    return () => { stopped = true; clearInterval(timer); };
  });
</script>
{#snippet releaseSections(categories: ChangeCategory[])}
  <div class="release-highlights">
    {#each categories as category}
      <section class="highlight">
        <h3><Icon name={category.icon ?? categoryIcons[category.category] ?? 'star'} size={15}/>{category.label}</h3>
        <ul>{#each category.items as item}<li>
          <span class="item-icon"><Icon name={categoryIcons[category.category] ?? 'star'} size={14}/></span>
          {#if item.link}<a class="change-link" href={item.link} onclick={close}><span>{item.text}</span><Icon name="arrow-right" size={15}/></a>{:else}<span class="change-text">{item.text}</span>{/if}
        </li>{/each}</ul>
      </section>
    {/each}
  </div>
{/snippet}
{#if open}<Dialog {open} title="What’s new" maxWidth="580px" maxHeight="85dvh" mobileInset="16px" contentPadding="0" mobileContentPadding="0" onclose={close}>
  {#snippet headerIdentity(titleId)}
    <div class="release-header" data-nosnippet class:latest-header={!history}>
      <span class="header-star"><Icon name={history ? 'timeline' : 'star'} size={20}/></span>
      <span id={titleId} class="sr-only">What’s new</span>
      <h2>{history ? 'Previous updates' : latest.title}</h2>
      {#if history}<span class="history-count">{updates.length - 1} releases</span>{:else if latest.date}<time datetime={latest.date}>{releaseDate(latest.date)}</time>{/if}
    </div>
  {/snippet}
  <div class="release-content" data-nosnippet>
    {#if history}
      <div class="release-history">
        {#each updates.slice(1) as update, index}
          {#if update.date && (index === 0 || update.date.slice(0, 4) !== updates[index]?.date?.slice(0, 4))}<h3 class="history-year">{update.date.slice(0, 4)}</h3>{/if}
          <details name="release-history">
            <summary>
              {#if update.date}<time class="history-date" datetime={update.date} aria-label={releaseDate(update.date)}><span>{new Date(`${update.date}T12:00:00`).toLocaleDateString('en', { month: 'short' })}</span><b>{Number(update.date.slice(8))}</b></time>{/if}
              <div class="history-title"><strong>{update.title}</strong><span>{update.categories.reduce((count, category) => count + category.items.length, 0)} changes</span></div>
              <span class="disclosure"><Icon name="chevron" size={16}/></span>
            </summary>
            {@render releaseSections(update.categories)}
          </details>
        {/each}
      </div>
    {:else}
      <div class="latest-release">
        {#if latest.summary}<p class="release-summary">{latest.summary}</p>{/if}
        {@render releaseSections(latest.categories)}
      </div>
      <div class="feedback-banner">
        <Icon name="discord" size={18}/>
        <span>Feedback or a bug? Let us know.</span>
        <Button href="https://discord.uma.moe/" target="_blank" size="sm" variant="ghost">Discord <span aria-hidden="true">↗</span></Button>
      </div>
    {/if}
  </div>
  {#snippet actions()}<div class="release-actions"><Button size="sm" variant="ghost" icon={history ? 'arrow-left' : undefined} onclick={() => history = !history}>{history ? 'Latest release' : 'Previous updates'}</Button><span class="footer-spacer"></span><Button size="sm" variant="secondary" onclick={close}>Got it</Button>{#if !history}<Button size="sm" onclick={close}>Explore update</Button>{/if}</div>{/snippet}
</Dialog>{/if}
<style>
  .release-content { min-width:0; }
  .release-header { display:flex; align-items:center; gap:8px; min-width:0; }
  .header-star { display:flex; color:var(--accent-warning); }
  .release-header h2 { flex:1; margin:0; font-size:16px; line-height:1.3; }
  .latest-header h2 { font-size:20px; letter-spacing:-.4px; }
  .release-header time { padding:4px 7px; background:var(--surface-2); border-radius:var(--radius-sm); }
  time { color:var(--color-text-muted); font-size:var(--font-xs); white-space:nowrap; }
  .feedback-banner { display:flex; align-items:center; gap:8px; padding:8px 16px; color:var(--color-text-muted); border-top:1px solid var(--border-subtle); font-size:12px; line-height:1.4; }
  .feedback-banner > :global(svg) { flex:none; color:var(--accent-purple); }
  .feedback-banner > span { flex:1; }
  .release-summary { margin:16px 20px 0; color:var(--color-text-muted); font-size:14px; line-height:1.6; max-width:52ch; }
  .release-highlights { display:grid; gap:14px; padding:14px 16px 16px; }
  .highlight { --section-color:var(--accent-success); min-width:0; }
  .highlight:nth-child(3n + 2) { --section-color:var(--color-accent); }
  .highlight:nth-child(3n) { --section-color:var(--accent-purple); }
  h3 { margin:0 0 6px; font-size:13px; line-height:1.5; }
  .highlight h3 { display:flex; align-items:center; gap:6px; color:var(--color-text-muted); font-size:11px; font-weight:600; letter-spacing:.4px; text-transform:uppercase; }
  .highlight h3 :global(svg), .item-icon { flex:none; color:var(--section-color); }
  ul { margin:0; padding:0; list-style:none; font-size:13px; line-height:1.45; }
  .highlight ul { padding:4px 8px; border:1px solid color-mix(in srgb,var(--section-color) 16%,transparent); border-radius:var(--radius-md); background:color-mix(in srgb,var(--section-color) 5%,transparent); }
  .highlight li { display:flex; align-items:flex-start; gap:8px; padding:6px 2px; }
  .change-text, .change-link { flex:1; min-width:0; }
  .item-icon { display:flex; padding-top:3px; }
  .change-link { display:flex; align-items:center; justify-content:space-between; gap:12px; color:inherit; text-decoration:none; border-radius:var(--radius-sm); }
  .change-link > :global(svg) { flex:none; color:var(--section-color); }
  .change-link:hover { color:var(--section-color); }
  .change-link:hover > span { text-decoration:underline; text-underline-offset:3px; }
  .latest-release .release-highlights { gap:12px; padding:16px 20px 20px; }
  .latest-release .highlight { padding:12px 14px 6px; border:1px solid color-mix(in srgb,var(--section-color) 18%,transparent); border-radius:var(--radius-md); background:color-mix(in srgb,var(--section-color) 4%,transparent); }
  .latest-release .highlight h3 { gap:8px; margin:0 0 5px; color:var(--section-color); font-size:13px; text-transform:none; letter-spacing:0; }
  .latest-release .highlight ul { padding:0; border:0; background:none; }
  .latest-release .item-icon { display:none; }
  .latest-release .highlight li { padding:0; }
  .latest-release .change-text, .latest-release .change-link { padding-block:7px; }
  .latest-release .highlight li + li { border-top:1px solid color-mix(in srgb,var(--section-color) 10%,transparent); }
  .release-actions { width:100%; display:flex; align-items:center; gap:8px; }
  .footer-spacer { flex:1; }
  .history-count { color:var(--color-text-muted); font-size:var(--font-xs); white-space:nowrap; }
  .history-year { margin:0; padding:10px 16px 6px; color:var(--color-text-muted); font-size:11px; letter-spacing:1px; }
  details + details { border-top:1px solid var(--border-subtle); }
  summary { position:sticky; top:0; z-index:1; display:flex; align-items:center; gap:12px; padding:10px 16px; background:var(--dialog-surface-bg); cursor:pointer; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  .history-date { display:grid; flex:0 0 38px; justify-items:center; gap:1px; line-height:1.1; text-transform:uppercase; }
  .history-date span { font-size:10px; letter-spacing:.5px; }
  .history-date b { font-size:20px; font-weight:600; color:var(--color-text); font-variant-numeric:tabular-nums; }
  .history-title { display:grid; flex:1; gap:4px; min-width:0; }
  .history-title strong { font-size:13px; line-height:1.4; }
  .history-title > span { font-size:11px; color:var(--color-text-muted); }
  .disclosure { display:flex; color:var(--color-text-muted); }
  details[open] .disclosure { transform:rotate(180deg); }
  details[open] > summary { box-shadow:inset 3px 0 var(--color-accent); background:var(--dialog-surface-bg); }
  details[open] .history-title strong, details[open] .history-date b { color:var(--color-accent); }
  summary:hover { background:var(--surface-2); }
  @media (max-width:600px) {
    summary { padding:10px 12px; gap:10px; }
    .feedback-banner { padding:8px 12px; }
    .release-summary { margin-inline:12px; }
    .release-highlights { padding:12px; }
    .latest-header h2 { font-size:18px; }
    .latest-release .release-highlights { padding:12px; }
    .latest-release .highlight { padding:10px 12px 4px; }
    .change-link { min-height:36px; }
    .release-actions { flex-wrap:wrap; gap:6px; }
  }
</style>
