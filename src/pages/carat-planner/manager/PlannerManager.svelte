<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clonePlanCollection,
    createPlan,
    importPlanCollection,
    sanitizePlan,
    withoutPlannerResourceDates,
    type CaratPlan,
    type CaratPlanCollection
  } from '@/lib/carat-planner/carat-planner';
  import type { PlannerCloudStatus } from '../cloud/planner-cloud-sync';
  import { plannerCloudRepository } from '../cloud/planner-cloud-repository';
  import { duplicateActivePlan, withCurrentPlan } from '../planner-collection';
  import { plannerCloudSync } from '../planner-state';
  import PlannerShareNotice from './PlannerShareNotice.svelte';
  import Icon from '@/components/Icon.svelte';
  import Menu, { type MenuItem } from '@/components/navigation/Menu.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';

  interface Props {
    active: boolean;
    collection: CaratPlanCollection;
    plan: CaratPlan;
    saveError: string;
    cloudStatus: PlannerCloudStatus;
    importError: string;
    onpublish: (collection: CaratPlanCollection) => void;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }

  let {
    active,
    collection,
    plan,
    saveError,
    cloudStatus,
    importError = $bindable(),
    onpublish,
    oncommit
  }: Props = $props();

  let importInput: HTMLInputElement;
  let sharing: PlannerShareNotice;
  let destroyed = false;

  let draftName = $state<{ planId: string; savedName: string; value: string }>();

  const displayedName = $derived(
    draftName?.planId === plan.id && draftName.savedName === plan.name ? draftName.value : plan.name
  );

  const planOptions: MenuItem[] = $derived([
    ...collection.plans.map((item) => ({
      id: 'plan:' + item.id,
      label: item.name,
      checked: item.id === plan.id,
      icon: item.id === plan.id ? ('check' as const) : ('book' as const)
    })),
    { id: 'create', label: 'Add plan', icon: 'add', separator: true }
  ]);

  function selectPlan(value: string): void {
    onpublish({ ...withCurrentPlan(collection, plan), activePlanId: value });
  }

  function addPlan(): void {
    const next = clonePlanCollection(collection);
    const value = createPlan('New plan');
    next.plans.push(value);
    next.activePlanId = value.id;
    onpublish(next);
  }

  function deletePlan(): void {
    if (collection.plans.length < 2 || !confirm(`Delete "${plan.name}"?`)) return;
    const deletedPlanId = collection.activePlanId;
    const next = clonePlanCollection(collection);
    next.plans = next.plans.filter((item) => item.id !== next.activePlanId);
    next.activePlanId = next.plans[0]!.id;
    onpublish(next);
    if (cloudStatus.loggedIn)
      void plannerCloudRepository
        .deleteShare(deletedPlanId)
        .catch(() =>
          sharing.notify('Plan deleted, but its shared link could not be removed from the server.')
        );
  }

  function planAction(action: string) {
    if (action === 'share') void sharing.share();
    else if (action === 'duplicate')
      onpublish(duplicateActivePlan(withCurrentPlan(collection, plan)));
    else if (action === 'export') exportPlan();
    else if (action === 'import') importInput.click();
    else if (action === 'delete') deletePlan();
  }

  function exportPlan(): void {
    const blob = new Blob(
      [JSON.stringify({ version: 1, plan: withoutPlannerResourceDates(plan) }, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${plan.name.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase() || 'carat-plan'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importPlan(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Planner import is too large.');
      const json = await file.text();
      if (destroyed) return;
      onpublish(importPlanCollection(json, withCurrentPlan(collection, plan)));
      importError = '';
    } catch (reason) {
      if (!destroyed)
        importError = reason instanceof Error ? reason.message : 'Unable to import plan.';
    } finally {
      input.value = '';
    }
  }

  onMount(() => {
    const unsubscribe = plannerCloudSync.subscribe((status) => {
      if (status.kind === 'reverted') draftName = undefined;
    });

    return () => {
      destroyed = true;
      unsubscribe();
    };
  });
</script>

<header class="manager">
  <div class="identity">
    <div class="plan-picker">
      <span>Selected plan</span>
      <Menu
        label={displayedName}
        ariaLabel="Selected plan"
        menuLabel="Select a plan"
        icon="book"
        items={planOptions}
        onselect={(value) => (value === 'create' ? addPlan() : selectPlan(value.slice(5)))}
      />
    </div>
    <TextField
      id="planner-name"
      label="Plan name"
      maxlength={80}
      autocomplete="off"
      value={displayedName}
      oninput={(event) =>
        (draftName = {
          planId: plan.id,
          savedName: plan.name,
          value: (event.currentTarget as HTMLInputElement).value
        })}
      onblur={() => {
        const name = displayedName;
        oncommit((value) => (value.name = sanitizePlan({ ...value, name })!.name));
        draftName = undefined;
      }}
    />
  </div>
  <div
    class="actions"
    role="group"
    aria-label="Plan actions"
  >
    <span
      class:warning={Boolean(saveError) ||
        cloudStatus.kind === 'offline' ||
        cloudStatus.kind === 'reverted'}
      class="sync"
      role="status"
      aria-label={saveError ? 'Not saved on this device' : cloudStatus.label}
      title={saveError ? 'Not saved on this device' : cloudStatus.label}
    >
      {#if !saveError && (cloudStatus.kind === 'loading' || cloudStatus.kind === 'saving')}
        <Spinner
          label={cloudStatus.label}
          size={15}
        />
      {:else}
        <Icon
          name={saveError || cloudStatus.kind === 'offline' || cloudStatus.kind === 'reverted'
            ? 'warning'
            : 'check'}
          size={15}
        />
      {/if}
      <span>{saveError ? 'Not saved on this device' : cloudStatus.label}</span>
    </span>
    <Menu
      label="More plan actions"
      menuLabel="Plan actions"
      icon="more"
      iconOnly
      items={[
        { id: 'share', label: 'Share plan', icon: 'share' },
        { id: 'duplicate', label: 'Duplicate plan', icon: 'copy' },
        { id: 'export', label: 'Export plan', icon: 'download' },
        { id: 'import', label: 'Import plan', icon: 'upload' },
        {
          id: 'delete',
          label: 'Delete plan',
          icon: 'trash',
          danger: true,
          disabled: collection.plans.length < 2
        }
      ]}
      onselect={planAction}
    />
    <input
      bind:this={importInput}
      class="file"
      type="file"
      accept="application/json"
      onchange={importPlan}
    />
  </div>
</header>
<PlannerShareNotice
  bind:this={sharing}
  {active}
  {collection}
  {plan}
  loggedIn={cloudStatus.loggedIn}
  {onpublish}
/>

<style>
  @import './planner-manager.css';
</style>
