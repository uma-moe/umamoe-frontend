<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { PlannerGachaEntry } from '@/lib/carat-planner/carat-planner';
  import type { TimelinePickupCatalog } from '@/lib/timeline/events/timeline-pickups';
  import type { TimelineCalculation } from '@/lib/timeline/prediction/timeline-prediction-types';
  import type { TimelineRewardSummary } from '@/lib/timeline/events/timeline-reward-summary';
  import { plannerResourceRepository } from '@/pages/carat-planner/planner-resource-repository';
  import type { TimelineRecord } from '../timeline-repository';

  interface Props {
    catalog: TimelinePickupCatalog;
    calculation: TimelineCalculation | null;
    rewardSummaries: ReadonlyMap<string, TimelineRewardSummary>;
    rewardsLoading: boolean;
    rewardsError: string;
    plannedIds: string[];
    onplan: (event: TimelineRecord, planned: boolean) => void;
    onretryrewards: () => void;
  }

  let {
    catalog,
    calculation,
    rewardSummaries,
    rewardsLoading,
    rewardsError,
    plannedIds,
    onplan,
    onretryrewards
  }: Props = $props();

  let detailEvent = $state<TimelineRecord>();
  let detailGacha = $state<PlannerGachaEntry>();
  let ratesLoading = $state(false);
  let ratesError = $state('');

  let detailRequest = 0;

  async function loadRates(refresh = false): Promise<void> {
    const event = detailEvent;
    const request = ++detailRequest;
    ratesError = '';
    detailGacha = undefined;
    ratesLoading = Boolean(event?.canPlan);
    if (!event?.canPlan) return;
    try {
      const core = await plannerResourceRepository.core(refresh);
      const [gacha] = await plannerResourceRepository.gachasFor([event], core, refresh);
      if (request === detailRequest) detailGacha = gacha;
    } catch (reason) {
      if (request === detailRequest)
        ratesError = reason instanceof Error ? reason.message : 'Banner rates could not be loaded.';
    } finally {
      if (request === detailRequest) ratesLoading = false;
    }
  }

  export function open(event: TimelineRecord | undefined): void {
    detailEvent = event;
    void loadRates();
  }

  function closeDetails(): void {
    detailRequest++;
    detailEvent = undefined;
  }
</script>

{#if detailEvent}
  {#key detailEvent.id}
    {#await import('./TimelineEventDetails.svelte')}
      <Dialog
        open
        title="Loading event details"
        onclose={closeDetails}
      >
        <Spinner
          centered
          minHeight="200px"
          label="Loading event details…"
        />
      </Dialog>
    {:then module}
      <module.default
        event={detailEvent}
        {catalog}
        {calculation}
        rewardSummary={rewardSummaries.get(detailEvent.id)}
        {rewardsLoading}
        {rewardsError}
        gacha={detailGacha}
        {ratesLoading}
        {ratesError}
        planned={plannedIds.includes(detailEvent.id)}
        {onplan}
        onclose={closeDetails}
        onretryrates={() => void loadRates(true)}
        {onretryrewards}
      />
    {:catch}
      <Dialog
        open
        title="Event details could not be loaded"
        onclose={closeDetails}
      >
        <Button
          variant="secondary"
          onclick={() => location.reload()}
        >
          Reload page
        </Button>
      </Dialog>
    {/await}
  {/key}
{/if}
