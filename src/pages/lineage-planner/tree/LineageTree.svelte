<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    plannerAffinityBreakdown,
    type plannerAffinityFlows,
    type PlannerAffinity,
    type PlannerPosition
  } from '@/lib/lineage/planner';
  import Icon from '@/components/Icon.svelte';
  import LazyContent from '@/components/LazyContent.svelte';
  import type { PlannerNodes } from '../lineage-planner-nodes';

  interface Props {
    nodes: PlannerNodes;
    affinity: PlannerAffinity | null;
    flows: ReturnType<typeof plannerAffinityFlows>;
    node: Snippet<[PlannerPosition]>;
  }

  let { nodes, affinity, flows, node }: Props = $props();

  const parentBranches = [
    {
      parent: 'p1',
      gps: [
        { gp: 'p1-1', greats: ['p1-1-1', 'p1-1-2'] },
        { gp: 'p1-2', greats: ['p1-2-1', 'p1-2-2'] }
      ]
    },
    {
      parent: 'p2',
      gps: [
        { gp: 'p2-1', greats: ['p2-1-1', 'p2-1-2'] },
        { gp: 'p2-2', greats: ['p2-2-1', 'p2-2-2'] }
      ]
    }
  ] as const;

  let expandedGPs = $state(new Set<string>());

  function toggleGreats(position: string): void {
    const next = new Set(expandedGPs);
    next.has(position) ? next.delete(position) : next.add(position);
    expandedGPs = next;
  }
</script>

<div class="tree-canvas">
  <div class="target-row">
    <div class="root-node">{@render node('target')}</div>
    {#if !nodes.p1.characterId || !nodes.p2.characterId}
      <p class="planner-guide">
        Pick a veteran to import their lineage, or choose an Uma to plan your own.
      </p>
    {/if}
  </div>
  <div
    class="parent-connections"
    aria-label="Affinity flowing to target"
  >
    <span
      class="target-arrow"
      aria-hidden="true"
    ></span>
    {#each parentBranches as branch, branchIndex}
      <div class="parent-flow">
        <span
          class="flow-value"
          aria-label={`Parent ${branchIndex + 1} contribution to target`}
        >
          <span>P{branchIndex + 1}</span>
          <Icon
            name="heart"
            size={12}
          />
          <b>{flows ? (branch.parent === 'p1' ? flows.p1 : flows.p2) : '-'}</b>
        </span>
      </div>
    {/each}
    <span
      class="shared-flow"
      title="Shared parent affinity and race bonus, counted once in the target total."
      aria-label="Shared contribution to target"
    >
      <Icon
        name="connect"
        size={13}
      />Shared
      <b>{flows?.shared ?? '-'}</b>
    </span>
  </div>
  <div class="parents">
    {#each parentBranches as branch, branchIndex}
      <section
        class="parent-branch"
        aria-label={`Parent ${branchIndex + 1} lineage`}
      >
        <header class="branch-heading">
          <div>
            <span class="branch-number">P{branchIndex + 1}</span>
            <h2>Parent {branchIndex + 1} lineage</h2>
          </div>
          <span class="branch-affinity">
            <span aria-hidden="true">↑</span>
            <small>Target</small>
            <Icon
              name="heart"
              size={14}
            />{flows ? (branch.parent === 'p1' ? flows.p1 : flows.p2) : '-'}
          </span>
        </header>
        <LazyContent
          height={380}
          eager={branchIndex === 0}
        >
          <div class="branch-node">{@render node(branch.parent)}</div>
          <div class="grandparents">
            <LazyContent height={220}>
              {#each branch.gps as item}
                {@const contribution = plannerAffinityBreakdown(affinity, item.gp)}
                <section class="gp-branch">
                  <span
                    class="gp-flow"
                    aria-label={`${nodes[item.gp].label} affinity connection`}
                    title={contribution
                      ? `${contribution.base} base + ${contribution.race} race bonus`
                      : 'Choose this lineage to calculate affinity'}
                  >
                    <span aria-hidden="true">↑</span>
                    <Icon
                      name="heart"
                      size={11}
                    />
                    <b>{contribution?.total ?? '-'}</b>
                  </span>
                  <div class="branch-node">{@render node(item.gp)}</div>
                  <button
                    class="great-toggle"
                    class:expanded={expandedGPs.has(item.gp)}
                    aria-label="Great-Grandparents"
                    aria-expanded={expandedGPs.has(item.gp)}
                    aria-controls={'greats-' + item.gp}
                    onclick={() => toggleGreats(item.gp)}
                  >
                    <Icon
                      name="lineage"
                      size={13}
                    />Great-grandparents
                    <span>
                      {item.greats.filter((position) => nodes[position].characterId).length}/2
                    </span>
                    <Icon
                      name="chevron"
                      size={13}
                    />
                  </button>
                  <div
                    class="greats"
                    id={'greats-' + item.gp}
                    hidden={!expandedGPs.has(item.gp)}
                  >
                    {#if expandedGPs.has(item.gp)}
                      {#each item.greats as position}
                        {@render node(position)}
                      {/each}
                    {/if}
                  </div>
                </section>
              {/each}
            </LazyContent>
          </div>
        </LazyContent>
      </section>
    {/each}
  </div>
</div>

<style>
  @import './lineage-tree.css';
</style>
