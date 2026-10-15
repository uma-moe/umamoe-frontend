<script lang="ts">
  import PlannerTargetGoals from '@/pages/carat-planner/goals/PlannerTargetGoals.svelte';
  import {
    createPlan,
    projectPlan,
    type PlannerDataBundle,
    type PlannerTarget
  } from '@/lib/carat-planner/carat-planner';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';

  const resources: PlannerDataBundle = {
    core: { default_spark_pulls: 200 },
    income: { rules: [] },
    rewards: { rewards: [] },
    gachas: [
      {
        gacha_id: 1,
        event_id: 'preview-support',
        banner_kind: 'support',
        start_date: '2026-09-01',
        end_date: '2026-09-15',
        rarity_rates: [{ rarity: 3, rate: 0.03 }],
        pickups: [
          { pickup_id: 30028, label: 'Kitasan Black', rate: 0.0075, exchangeable: true },
          { pickup_id: 30016, label: 'Super Creek', rate: 0.0075, exchangeable: true }
        ]
      }
    ]
  };
  const catalog: TimelinePickupCatalog = {
    characters: {},
    supports: new Map([
      [
        30028,
        { id: '30028', name: 'Kitasan Black', rarity: 3, type: 'speed', release_date: '2026-09-01' }
      ],
      [
        30016,
        { id: '30016', name: 'Super Creek', rarity: 3, type: 'stamina', release_date: '2026-09-01' }
      ]
    ])
  };

  let plan = $state(createPlan('UI preview'));

  plan.projectionStartDate = '2026-09-01';

  plan.balances.freeJewels = 30000;

  plan.targets = [
    {
      id: 'preview-goal',
      eventId: 'preview-support',
      gachaId: 1,
      title: 'Kitasan Black + Super Creek',
      bannerKind: 'support',
      bannerStart: '2026-09-01',
      bannerEnd: '2026-09-15',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      useTickets: true,
      allowPaidJewels: false,
      pickupGoals: [
        { pickupId: 30028, desiredCopies: 1 },
        { pickupId: 30016, desiredCopies: 1 }
      ]
    }
  ];

  const projection = $derived(projectPlan(plan, resources).targets[0]!);

  const pickupCopyMemory = new Map<string, number>();

  function update(mutator: (target: PlannerTarget) => void) {
    mutator(plan.targets[0]!);
  }
</script>

<PlannerTargetGoals
  target={plan.targets[0]!}
  {projection}
  {resources}
  events={[]}
  {catalog}
  {pickupCopyMemory}
  onupdate={update}
/>
