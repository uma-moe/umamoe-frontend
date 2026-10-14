<script lang="ts">
  import { tick } from 'svelte';
  import { characterImagePath, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { decodeFactor, factorOptions, factorCatalogState } from '@/lib/catalog/factor-catalog';
  import { manualBestFits, type ManualParent } from '@/lib/veterans/parent-picker';
  import type { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import type { CharacterPickerSort } from '@/components/pickers/CharacterPicker.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import RaceWinPickerDialog from './RaceWinPickerDialog.svelte';
  import SparkAddControl from '@/components/sparks/SparkAddControl.svelte';
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  interface Props {
    entry?: ManualParent;
    characters: Map<number, CharacterCatalogEntry>;
    selectableCharacters: CharacterCatalogEntry[];
    targetId?: number;
    engine?: VeteranAffinityEngine;
    onsave: (entry: ManualParent) => void;
    oncancel: () => void;
  }

  let { entry, characters, selectableCharacters, targetId, engine, onsave, oncancel }: Props =
    $props();
  const id = $props.id();

  let label = $state('');
  let nodes = $state<Array<{ cardId: number | null; factors: number[]; wins: number[] }>>([]);
  let characterSlot = $state(0);
  let characterOpen = $state(false);
  let bestSlot = $state<number | null>(null);

  let bestTrigger: HTMLElement | undefined;

  let bestPanel = $state<HTMLElement>();
  let characterSort = $state<CharacterPickerSort>('default');
  let raceSlot = $state(0);
  let raceOpen = $state(false);

  const labels = ['Parent 1', 'Grandparent 1', 'Grandparent 2'];

  const factors = $derived(
    factorOptions().map((factor) => ({ value: factor.id, label: factor.text, type: factor.type }))
  );

  $effect(() => {
    label = entry?.label ?? '';
    nodes = [
      {
        cardId: entry?.mainCardId ?? null,
        factors: [...(entry?.ownSparkIds ?? [])],
        wins: [...(entry?.mainWinSaddleIds ?? [])]
      },
      {
        cardId: entry?.p1CardId ?? null,
        factors: [...(entry?.p1SparkIds ?? [])],
        wins: [...(entry?.p1WinSaddleIds ?? [])]
      },
      {
        cardId: entry?.p2CardId ?? null,
        factors: [...(entry?.p2SparkIds ?? [])],
        wins: [...(entry?.p2WinSaddleIds ?? [])]
      }
    ];
  });

  function payload(): ManualParent {
    return {
      id: entry?.id ?? crypto.randomUUID(),
      label: label.trim(),
      mainCardId: nodes[0]?.cardId ?? 0,
      ownSparkIds: nodes[0]?.factors ?? [],
      p1CardId: nodes[1]?.cardId ?? null,
      p1SparkIds: nodes[1]?.factors ?? [],
      p2CardId: nodes[2]?.cardId ?? null,
      p2SparkIds: nodes[2]?.factors ?? [],
      mainWinSaddleIds: nodes[0]?.wins ?? [],
      p1WinSaddleIds: nodes[1]?.wins ?? [],
      p2WinSaddleIds: nodes[2]?.wins ?? [],
      createdAt: entry?.createdAt ?? new Date().toISOString()
    };
  }

  const choices = $derived(
    selectableCharacters.map((character) => ({
      id: String(character.id),
      name: character.name,
      image: characterImagePath(Number(character.id))
    }))
  );
  const pickerCharacters = $derived(
    new Map(selectableCharacters.map((character) => [Number(character.id), character]))
  );
  const affinityTargets = $derived([
    ...new Set(
      [targetId, characterSlot ? nodes[0]?.cardId : undefined]
        .filter((value): value is number => Boolean(value))
        .map((value) => (value >= 100000 ? Math.floor(value / 100) : value))
    )
  ]);
  const characterChoices = $derived(
    choices.map((choice) => ({
      ...choice,
      affinity:
        engine && affinityTargets.length
          ? affinityTargets.reduce(
              (sum, target) => sum + engine.pair(Math.floor(Number(choice.id) / 100), target),
              0
            )
          : undefined
    }))
  );
  const bestChoices = $derived(
    bestSlot === null
      ? []
      : manualBestFits(
          nodes.map((node) => node.cardId),
          bestSlot,
          targetId,
          engine,
          pickerCharacters
        )
  );
  const affinities = $derived.by(() => {
    if (!engine?.ready || !nodes[0]?.cardId) return [0, 0, 0];
    const main = Math.floor(nodes[0].cardId / 100),
      target = targetId && (targetId >= 10000 ? Math.floor(targetId / 100) : targetId);
    const grandparents = nodes
      .slice(1)
      .map((node) =>
        !node.cardId
          ? 0
          : target
            ? engine.triple(target, main, Math.floor(node.cardId / 100))
            : engine.pair(main, Math.floor(node.cardId / 100))
      );
    return [
      (target ? engine.pair(target, main) : 0) +
        grandparents.reduce((sum, value) => sum + value, 0),
      ...grandparents
    ];
  });

  function choose(slot: number): void {
    bestSlot = null;
    characterSlot = slot;
    characterSort = targetId || (slot && nodes[0]?.cardId) ? 'affinity' : 'default';
    characterOpen = true;
  }

  function openBestFits(slot: number, event: MouseEvent): void {
    bestTrigger = event.currentTarget as HTMLElement;
    bestSlot = bestSlot === slot ? null : slot;
  }

  function closeBestFits(): void {
    bestSlot = null;
    bestTrigger?.focus({ preventScroll: true });
  }

  $effect(() => {
    if (!bestPanel) return;
    const panel = bestPanel;
    const onkey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeBestFits();
      }
    };
    panel.addEventListener('keydown', onkey);
    panel.scrollIntoView({ block: 'nearest' });
    panel.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => panel.removeEventListener('keydown', onkey);
  });

  async function selectBestFit(slot: number, cardId: number, event: MouseEvent): Promise<void> {
    const owner = (event.currentTarget as HTMLElement).closest('.manual-node');
    nodes[slot]!.cardId = cardId;
    bestSlot = null;
    await tick();
    owner
      ?.querySelector<HTMLButtonElement>(`button[aria-label="Change ${labels[slot]}"]`)
      ?.focus({ preventScroll: true });
  }

  function openWins(slot: number): void {
    raceSlot = slot;
    raceOpen = true;
  }
</script>

<section
  class="manual-editor"
  aria-label={entry ? 'Edit manual parent' : 'New manual parent'}
>
  <div class="editor-heading">
    <strong>{entry ? 'Edit manual parent' : 'New manual parent'}</strong>
    <div class="entry-label">
      <TextField
        id={`${id}-name`}
        label="Entry name (optional)"
        hideLabel
        prefixIcon="tag"
        bind:value={label}
        placeholder="Label (optional)"
      />{#if label}
        <IconButton
          icon="close"
          size="sm"
          label="Clear entry name"
          onclick={() => {
            label = '';
            document.getElementById(`${id}-name`)?.focus();
          }}
        />
      {/if}
    </div>
  </div>
  <div class="manual-tree">
    {#each nodes as node, index}
      <div
        class="tree-branch"
        class:grandparent={index > 0}
      >
        <section
          class:main={index === 0}
          class:filled={Boolean(node.cardId)}
          class="manual-node"
          aria-label={labels[index]}
        >
          {#if node.cardId}
            <header class="identity">
              <Artwork
                src={characterImagePath(node.cardId)}
                alt=""
                size="sm"
              />
              <div class="identity-copy">
                <strong>{characters.get(node.cardId)?.name ?? `Character ${node.cardId}`}</strong>
                <div class="tagline">
                  <small>{index === 0 ? 'Parent' : labels[index]}</small>
                  {#if affinities[index]}
                    <span
                      class="affinity"
                      aria-label={`Affinity ${affinities[index]}`}
                    >
                      <Icon
                        name="heart"
                        size={10}
                      />{affinities[index]}
                    </span>
                  {/if}
                </div>
              </div>
              <div class="node-actions">
                <IconButton
                  icon="trophy"
                  size="sm"
                  label={`Race wins for ${labels[index]}`}
                  title={`${node.wins.length} race wins`}
                  onclick={() => openWins(index)}
                /><IconButton
                  icon="swap"
                  size="sm"
                  label={`Change ${labels[index]}`}
                  onclick={() => choose(index)}
                /><IconButton
                  icon="close"
                  size="sm"
                  label={`Remove ${labels[index]}`}
                  onclick={() => (nodes[index] = { cardId: null, factors: [], wins: [] })}
                />
              </div>
            </header>
            <div class="sparks-editor">
              <div class="node-sparks">
                {#each node.factors as encoded, factorIndex}
                  {@const factor = decodeFactor(encoded)}<SparkItem
                    name={factor.name}
                    tone={factor.type === 0
                      ? 'blue'
                      : factor.type === 1
                        ? 'pink'
                        : factor.type === 5
                          ? 'green'
                          : 'white'}
                    level={factor.level}
                    compact
                    removeLabel={`Remove ${factor.name} from ${labels[index]}`}
                    onremove={() =>
                      (node.factors = node.factors.filter((_, i) => i !== factorIndex))}
                  />
                {/each}
              </div>
              <SparkAddControl
                id={`${id}-factor-${index}`}
                label={labels[index]!}
                options={factors}
                {...$factorCatalogState}
                onadd={(value, level) =>
                  (node.factors = [...node.factors, Number(value) * 10 + level])}
              />
            </div>
          {:else}
            <div class="empty-actions">
              <button
                type="button"
                class="empty-node"
                aria-label={`Choose ${labels[index]}`}
                onclick={() => choose(index)}
              >
                <span>
                  <Icon
                    name="users-add"
                    size={20}
                  />
                </span>
                <div>
                  <strong>{labels[index]}</strong>
                  <small>Choose a character</small>
                </div>
              </button>
              {#if engine?.ready && targetId && (index === 0 || nodes[0]?.cardId)}
                <IconButton
                  icon="search"
                  size="sm"
                  label="Best Fits"
                  title="Best affinity fit"
                  ariaExpanded={bestSlot === index}
                  onclick={(event) => openBestFits(index, event)}
                />
              {/if}
            </div>
          {/if}
          {#if bestSlot === index}
            <section
              class="best-fits"
              aria-label={`Best Fits for ${labels[index]}`}
              bind:this={bestPanel}
            >
              <header>
                <strong>Best Fits</strong>
                <IconButton
                  icon="close"
                  label="Close best fits"
                  onclick={closeBestFits}
                />
              </header>
              <div class="best-list">
                {#each bestChoices as choice, rank}
                  <button
                    type="button"
                    aria-label={`Choose ${choice.character.name}: affinity ${choice.totalAffinity}, contribution ${choice.individualAffinity}`}
                    onclick={(event) => selectBestFit(index, Number(choice.character.id), event)}
                  >
                    <span class="best-rank">{rank + 1}</span>
                    <Artwork
                      src={characterImagePath(Number(choice.character.id))}
                      alt=""
                      size="sm"
                    />
                    <span class="best-name">{choice.character.name}</span>
                    <span
                      class="best-score"
                      title="Total affinity"
                    >
                      {choice.totalAffinity}
                    </span>
                    <span
                      class="best-delta"
                      title="Individual affinity"
                    >
                      +{choice.individualAffinity}
                    </span>
                  </button>
                {:else}
                  <p>No matching characters available.</p>
                {/each}
              </div>
            </section>
          {/if}
        </section>
      </div>
    {/each}
  </div>
  <footer>
    <Button
      variant="secondary"
      onclick={oncancel}
    >
      Cancel
    </Button><Button
      icon="save"
      disabled={!nodes[0]?.cardId}
      onclick={() => onsave(payload())}
    >
      {entry ? 'Save Changes' : 'Save Entry'}
    </Button>
  </footer>
</section>
<CharacterSelectDialog
  bind:open={characterOpen}
  label={`Character for ${labels[characterSlot]}`}
  options={characterChoices}
  selected={nodes[characterSlot]?.cardId ? [String(nodes[characterSlot]!.cardId)] : []}
  bind:sort={characterSort}
  onselect={(selected) => {
    nodes[characterSlot]!.cardId = Number(selected[0]);
    characterOpen = false;
  }}
/>
{#if raceOpen}
  <RaceWinPickerDialog
    bind:open={raceOpen}
    charName={characters.get(nodes[raceSlot]?.cardId ?? 0)?.name}
    winSaddleIds={nodes[raceSlot]?.wins ?? []}
    onconfirm={(wins) => (nodes[raceSlot]!.wins = wins)}
  />
{/if}

<style>
  @import './manual-parent-editor.css';
</style>
