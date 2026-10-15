<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { searchParams } from 'sv-router';
  import { copyText } from '@/lib/clipboard';
  import {
    activePlan,
    importSharedPlan,
    type CaratPlan,
    type CaratPlanCollection
  } from '@/lib/carat-planner/carat-planner';
  import {
    decodeCompactPlannerShare,
    encodeCompactPlannerShare
  } from '@/lib/carat-planner/planner-share-codec';
  import { router } from '@/routes/router';
  import { plannerCloudRepository } from '../cloud/planner-cloud-repository';
  import { isPlannerShareId, plannerShareUrl, withCurrentPlan } from '../planner-collection';
  import { plannerCloudSync } from '../planner-state';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    active: boolean;
    collection: CaratPlanCollection;
    plan: CaratPlan;
    loggedIn: boolean;
    onpublish: (collection: CaratPlanCollection) => void;
  }

  let { active, collection, plan, loggedIn, onpublish }: Props = $props();

  let shareNotice = $state('');
  let shareUrl = $state('');

  let handledCompactShare = '';
  let handledCloudShare = '';
  let destroyed = false;

  export function notify(message: string): void {
    if (!destroyed) shareNotice = message;
  }

  async function copyShareUrl(url?: URL, updateMessage = true): Promise<boolean> {
    if (destroyed) return false;
    if (url) shareUrl = url.toString();
    if (!shareUrl) return false;
    const copied = await copyText(shareUrl);
    if (!destroyed && updateMessage)
      shareNotice = copied ? 'Share link copied.' : 'Copy the share link below.';
    return copied;
  }

  export async function share(): Promise<void> {
    shareUrl = '';
    if (loggedIn) {
      try {
        shareNotice = 'Creating share link…';
        plannerCloudSync.notifyLocalChange(collection, 0);
        const shared = await plannerCloudRepository.createShare(plan);
        if (destroyed) return;
        const url = plannerShareUrl(location.origin, { share: shared.share_id });
        const copied = await copyShareUrl(url, false);
        if (!destroyed)
          shareNotice =
            (copied ? 'Share link copied.' : 'Share link ready.') +
            ' It always opens the latest saved version of this plan. Opening it adds a separate copy.';
        return;
      } catch {
        if (destroyed) return;
      }
    }
    try {
      shareNotice = 'Creating compact share link…';
      const payload = await encodeCompactPlannerShare(plan);
      if (destroyed) return;
      const url = plannerShareUrl(location.origin, { payload });
      const copied = await copyShareUrl(url, false);
      if (!destroyed)
        shareNotice = copied
          ? 'Self-contained plan link copied. Opening it adds a separate copy.'
          : 'Self-contained plan link ready. Opening it adds a separate copy.';
    } catch (reason) {
      if (!destroyed)
        shareNotice =
          reason instanceof Error ? reason.message : 'Compact share link could not be created.';
    }
  }

  async function importCompactShare(payload: string): Promise<void> {
    shareNotice = 'Opening compact shared plan…';
    try {
      const decoded = await decodeCompactPlannerShare(payload);
      if (!destroyed && active && handledCompactShare === payload)
        openSharedPlan(decoded.plan, `b64${decoded.fingerprint}`);
    } catch (reason) {
      if (!destroyed && active && handledCompactShare === payload)
        shareNotice = reason instanceof Error ? reason.message : 'Shared plan could not be opened.';
    }
  }

  async function importCloudShare(shareId: string): Promise<void> {
    if (!isPlannerShareId(shareId)) {
      shareNotice = 'This shared plan link is invalid.';
      return;
    }
    try {
      shareNotice = 'Loading shared plan…';
      const shared = await plannerCloudRepository.getSharedPlan(shareId);
      if (!destroyed && active && handledCloudShare === shareId)
        openSharedPlan(shared.plan, shareId);
    } catch {
      if (!destroyed && active && handledCloudShare === shareId)
        shareNotice = 'Shared plan was not found or is no longer available.';
    }
  }

  function openSharedPlan(value: unknown, shareId: string): void {
    onpublish(importSharedPlan(value, shareId, withCurrentPlan(collection, plan)));
    shareNotice = `Opened ${activePlan(collection).name} as a separate copy.`;
  }

  $effect(() => {
    if (!active) {
      handledCompactShare = '';
      handledCloudShare = '';
      return;
    }
    const query = searchParams.toURLSearchParams();
    const shareId = query.get('share')?.trim() ?? '';
    const fragment = router.route.hash.replace(/^#/, '');
    const payload = shareId
      ? ''
      : (fragment.startsWith('p=') ? fragment.slice(2) : (query.get('p') ?? '')).trim();
    untrack(() => {
      if (payload !== handledCompactShare) {
        handledCompactShare = payload;
        if (payload) void importCompactShare(payload);
      }
      if (shareId !== handledCloudShare) {
        handledCloudShare = shareId;
        if (shareId) void importCloudShare(shareId);
      }
    });
  });

  onDestroy(() => {
    destroyed = true;
  });
</script>

{#if shareNotice}
  <div
    class="share-notice"
    role="status"
  >
    <Icon
      name={shareUrl ? 'share' : 'info'}
      size={18}
    />
    <span>{shareNotice}</span>
    {#if shareUrl}
      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open link
      </a>
      <Button
        size="sm"
        variant="ghost"
        icon="copy"
        onclick={() => void copyShareUrl()}
      >
        Copy link
      </Button>
    {/if}
  </div>
{/if}

<style>
  .share-notice {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--accent-primary) 7%, transparent);
    color: var(--text-secondary);
    font-size: 12px;
  }
  .share-notice > span {
    flex: 1;
    min-width: 0;
  }
  .share-notice > :global(svg),
  .share-notice > a {
    color: var(--accent-primary);
  }
  .share-notice > a {
    white-space: nowrap;
    font-size: 11px;
  }
  @media (max-width: 768px) {
    .share-notice {
      flex-wrap: wrap;
      align-items: center;
    }
    .share-notice > span {
      flex-basis: calc(100% - 28px);
    }
    .share-notice > a {
      display: flex;
      align-items: center;
      min-height: var(--touch-target);
      margin-left: 26px;
    }
  }
</style>
