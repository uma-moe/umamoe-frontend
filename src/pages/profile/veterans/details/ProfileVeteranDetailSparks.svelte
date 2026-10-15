<script lang="ts">
  import type { ProfileVeteran } from '../../profile-repository';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import type { LineageBranch, LineageNodeData } from '@/components/lineage/lineage-types';
  import { resolveVeteranFactors, veteranFactorTotals } from '@/lib/profile/profile-veterans';
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import RadioGroup from '@/components/controls/RadioGroup.svelte';

  interface Props {
    veteran: ProfileVeteran;
    summary: VeteranUiRecord;
    family: { root: LineageNodeData; branches: LineageBranch[] };
    idPrefix: string;
    source: string;
    section?: HTMLElement;
  }

  let {
    veteran,
    summary,
    family,
    idPrefix,
    source = $bindable(),
    section = $bindable()
  }: Props = $props();

  const ownSources = $derived([
    { value: 'family', label: 'Combined', description: 'Own + P1 + P2' },
    {
      value: 'main',
      label: summary.name,
      shortLabel: 'Own',
      description: 'This veteran',
      image: summary.image
    }
  ]);
  const branchSources = $derived(
    family.branches.map(({ parent, grandparents }) => ({
      id: parent.id,
      label: 'Parent ' + parent.roleLabel.slice(1),
      options: [
        {
          value: parent.id.split(':').pop()!,
          label: parent.name,
          shortLabel: parent.roleLabel,
          description: 'Parent ' + parent.roleLabel.slice(1),
          image: parent.image
        },
        ...grandparents.map((node) => ({
          value: node.id.split(':').pop()!,
          label: node.name,
          shortLabel: 'GP' + node.roleLabel.split(' ').pop()!,
          description: node.roleLabel.replace(' legacy ', ' · Grandparent '),
          image: node.image
        }))
      ]
    }))
  );
  const selectedSparkSource = $derived(
    [...ownSources, ...branchSources.flatMap((branch) => branch.options)].find(
      (option) => option.value === source
    )
  );
  const sourceNode = $derived(
    source === 'main'
      ? veteran
      : veteran.succession_chara_array?.find((node) => String(node.position_id) === source)
  );
  const sparks = $derived(
    source === 'family'
      ? veteranFactorTotals(veteran)
      : sourceNode
        ? resolveVeteranFactors(sourceNode)
        : []
  );
  const sortedSparks = $derived(
    sparks.toSorted(
      (a, b) =>
        ['blue', 'pink', 'green', 'white'].indexOf(a.tone) -
          ['blue', 'pink', 'green', 'white'].indexOf(b.tone) || a.name.localeCompare(b.name)
    )
  );
  const contributions = $derived(
    [
      veteran,
      ...[10, 20].map((position) =>
        veteran.succession_chara_array?.find((node) => node.position_id === position)
      )
    ].map((node) => {
      const levels = new Map<number, number>();
      for (const factor of node ? resolveVeteranFactors(node) : [])
        levels.set(factor.id, (levels.get(factor.id) ?? 0) + factor.level);
      return levels;
    })
  );
</script>

<section
  class="spark-section"
  aria-label="Inheritance sparks"
  tabindex="-1"
  bind:this={section}
>
  <header class="spark-header">
    <h3>
      Sparks <span>{sparks.length}</span>
    </h3>
    <p
      class="source-name"
      title={source === 'family'
        ? 'Combined stars from this veteran and both parents.'
        : selectedSparkSource?.label + ' · ' + selectedSparkSource?.description}
    >
      {#if source === 'family'}
        Own + P1 + P2
      {:else}
        {selectedSparkSource?.label}
        <span>{' · ' + selectedSparkSource?.description}</span>
      {/if}
    </p>
  </header>
  <div
    class="spark-sources"
    role="group"
    aria-label="Show sparks from"
  >
    <div class="own-sources">
      <RadioGroup
        id={idPrefix + '-spark-runner'}
        legend="Veteran"
        options={ownSources}
        bind:value={source}
        cards
        compact
      />
    </div>
    {#each branchSources as branch (branch.id)}
      <div class="branch-sources">
        <RadioGroup
          id={idPrefix + '-spark-runner'}
          legend={branch.label}
          options={branch.options}
          bind:value={source}
          cards
          compact
        />
      </div>
    {/each}
  </div>
  <div
    class="spark-list"
    role="region"
    aria-label="All inheritance sparks"
  >
    {#each ['blue', 'pink', 'green', 'white'] as tone}
      {@const group = sortedSparks.filter((factor) => factor.tone === tone)}
      {#if group.length}
        <div
          class="spark-group"
          data-tone={tone}
          role="list"
          aria-label={tone + ' sparks'}
        >
          {#each group as factor}
            {@const contribution =
              source === 'family'
                ? factor.name +
                  ': ' +
                  factor.level +
                  ' stars total. Main ' +
                  (contributions[0]?.get(factor.id) ?? 0) +
                  ', P1 ' +
                  (contributions[1]?.get(factor.id) ?? 0) +
                  ', P2 ' +
                  (contributions[2]?.get(factor.id) ?? 0) +
                  '.'
                : factor.name + ': ' + factor.level + ' stars.'}
            <span
              class="spark-token"
              role="listitem"
              aria-label={contribution}
              title={contribution}
            >
              <SparkItem
                name={factor.name}
                level={factor.level}
                tone={factor.tone}
                title={contribution}
                mainStars={source === 'family' ? (contributions[0]?.get(factor.id) ?? 0) : 0}
                compact
              />
            </span>
          {/each}
        </div>
      {/if}
    {/each}
    {#if !sparks.length}
      <p>No sparks recorded for this source.</p>
    {/if}
  </div>
</section>

<style>
  @import './veteran-details-shared.css';
  @import './profile-veteran-detail-sparks.css';
</style>
