<script lang="ts">
  import { copyText } from '@/lib/clipboard';
  import { loadCatalog, type CatalogEntry } from '@/pages/database/catalog-repository';
  import InheritanceResultCard from '@/pages/database/results/InheritanceResultCard.svelte';
  import { queueBorrowView, trackBorrowCopy } from '@/pages/database/borrow-interactions';
  import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
  import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import { loadG1SaddleGroups } from '@/lib/catalog/race-catalog';
  import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
  import { profileInheritanceRecord } from '@/lib/profile/profile-display';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import { inheritanceRepository } from '@/pages/database/inheritance-repository';
  import type { ProfileResponse } from '../profile-repository';

  let { profile }: { profile: ProfileResponse } = $props();

  const accountId = $derived(profile.trainer.account_id);

  let catalogCharacters = $state<CatalogEntry[]>([]);
  let catalogSupports = $state<CatalogEntry[]>([]);
  let affinityEngine = $state<VeteranAffinityEngine>();
  let affinityError = $state('');
  let raceGroups = $state<ReadonlyMap<number, number>>(new Map());
  let borrowCopies = $state.raw<{ profile: ProfileResponse; count: number }>();
  let toasts = $state<Toast[]>([]);
  let inheritanceActionBusy = $state(false);
  let inheritanceNotice = $state('');

  function notify(title: string, tone: Toast['tone']): void {
    toasts = [...toasts, { id: crypto.randomUUID(), title, tone }].slice(-4);
  }

  async function copyTrainer(profile: ProfileResponse, record: InheritanceRecord): Promise<void> {
    if (!record.accountId) return notify('No Trainer ID to copy', 'warning');
    if (!(await copyText(record.accountId))) return notify('Failed to copy Trainer ID', 'danger');
    if (accountId !== profile.trainer.account_id) return;
    notify(`Trainer ID copied: ${record.accountId}`, 'success');
    const pending = trackBorrowCopy(record);
    if (!pending) return;
    borrowCopies = { profile, count: record.borrowCopies + 1 };
    const count = await pending;
    if (accountId === profile.trainer.account_id && borrowCopies?.profile === profile)
      borrowCopies = { profile, count };
  }

  async function loadAffinity(refresh = false): Promise<void> {
    affinityError = '';
    try {
      affinityEngine = new VeteranAffinityEngine(await veteranAffinityRepository.load(refresh));
    } catch {
      affinityError =
        'Local affinity calculations are unavailable. Showing the stored inheritance score.';
    }
  }

  function openPlanner(record: InheritanceRecord): void {
    try {
      localStorage.setItem(
        'planner_transfer',
        JSON.stringify({ record, targetCharaId: null, veteran: null })
      );
    } catch {
      /* Legacy one-shot transfer is best effort. */
    }
    window.open('/tools/lineage-planner?from=profile', '_blank', 'noopener');
  }

  async function shareInheritance(record: InheritanceRecord): Promise<void> {
    const copied = await copyText(
      `${location.origin}/database?trainer_id=${encodeURIComponent(record.accountId)}`
    );
    notify(
      copied ? 'Link copied to clipboard' : 'Failed to copy link',
      copied ? 'success' : 'danger'
    );
  }

  async function requestInheritanceUpdate(record: InheritanceRecord): Promise<void> {
    if (
      !confirm(
        `Report trainer ${record.accountId}'s inheritance as outdated and queue a refresh? It can take up to 5 minutes to update in the database.`
      )
    )
      return;
    inheritanceActionBusy = true;
    try {
      await inheritanceRepository.reportUnavailable(record.accountId);
      notify('Update requested. It can take up to 5 minutes to appear in the database.', 'success');
    } catch {
      notify('Could not request an inheritance update. Please try again.', 'danger');
    } finally {
      inheritanceActionBusy = false;
    }
  }

  $effect(() => {
    void loadAffinity();
    void loadG1SaddleGroups()
      .then((groups) => (raceGroups = groups))
      .catch(() => {
        inheritanceNotice = 'Race affinity details could not be loaded.';
      });
    void Promise.all([loadCatalog('characters'), loadCatalog('supports')])
      .then(([characters, supports]) => {
        catalogCharacters = characters;
        catalogSupports = supports;
      })
      .catch(() => {
        inheritanceNotice = 'Some character details could not be loaded.';
      });
  });

  const inheritanceRecord = $derived(profileInheritanceRecord(profile, raceGroups));
</script>

{#if inheritanceRecord}
  <InheritanceResultCard
    record={{
      ...inheritanceRecord,
      borrowCopies:
        borrowCopies?.profile === profile ? borrowCopies.count : inheritanceRecord.borrowCopies
    }}
    {affinityEngine}
    {raceGroups}
    characters={catalogCharacters}
    supports={catalogSupports}
    actionBusy={inheritanceActionBusy}
    reportText="Update inheritance"
    reportIcon="refresh"
    reportTooltip="Report this inheritance as outdated and queue a database refresh"
    oncopy={(record) => copyTrainer(profile, record)}
    onvisible={queueBorrowView}
    onplanner={openPlanner}
    onshare={shareInheritance}
    onreport={requestInheritanceUpdate}
  />
{/if}
{#if affinityError}
  <Banner
    title="Affinity details unavailable"
    tone="danger"
  >
    <p>{affinityError}</p>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => void loadAffinity(true)}
    >
      Retry affinity
    </Button>
  </Banner>
{/if}
{#if inheritanceNotice}
  <p
    class="inheritance-notice"
    aria-live="polite"
  >
    {inheritanceNotice}
  </p>
{/if}
<ToastRegion
  {toasts}
  ondismiss={(id) => (toasts = toasts.filter((toast) => toast.id !== id))}
/>

<style>
  .inheritance-notice {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-sm);
  }
</style>
