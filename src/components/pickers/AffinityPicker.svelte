<script lang="ts">
  import Icon from '../Icon.svelte';
  import Button from '../controls/Button.svelte';
  import SegmentedControl from '../controls/SegmentedControl.svelte';
  import VeteranSummary from '../game/VeteranSummary.svelte';
  import type { CharacterPickerOption } from './picker-types';
  import type { VeteranUiRecord } from '../game/veteran-ui-types';

  interface Props {
    target?: CharacterPickerOption;
    veteran?: VeteranUiRecord;
    sharedLegacyLabel?: string;
    targetOnly?: boolean;
    ontargetpick: () => void;
    ontargetclear: () => void;
    onlegacypick?: () => void;
    onlegacyclear?: () => void;
  }

  let {
    target,
    veteran,
    sharedLegacyLabel,
    targetOnly = false,
    ontargetpick,
    ontargetclear,
    onlegacypick,
    onlegacyclear
  }: Props = $props();

  let sparkView = $state('combined');
  let legacyGroup = $state<HTMLDivElement>();

  /** Restore focus after a caller-owned dialog replaces the legacy selection. */
  export function focusLegacy(): void {
    legacyGroup
      ?.querySelector<HTMLButtonElement>(
        'button[aria-label="Clear selected legacy"],button[aria-label="Pick your legacy"]'
      )
      ?.focus();
  }
</script>

<div
  class="affinity-tree"
  class:target-only={targetOnly}
>
  <div class="tree-group tree-group--target">
    <span class="tree-label tree-label--target">Target (ace)</span>
    <div
      class="target-selection"
      class:has-target={Boolean(target)}
    >
      <button
        class="ace"
        class:empty={!target}
        class:selected={Boolean(target)}
        type="button"
        aria-label={target ? `Change target ${target.name}` : 'Pick target character'}
        onclick={ontargetpick}
      >
        <span class="ace-portrait">
          {#if target?.image}
            <img
              src={target.image}
              alt=""
            />
          {:else}
            <Icon
              name="search"
              size={22}
            />
          {/if}
        </span>
        <span class="slot-copy">
          <strong>{target?.name ?? 'Select character'}</strong>
          {#if target?.subtitle}
            <small>{target.subtitle}</small>
          {:else if !target}
            <small>Target (ace)</small>
          {/if}
        </span>
        <span class="slot-chevron">
          <Icon
            name="chevron"
            size={16}
          />
        </span>
      </button>
      {#if target}
        <div class="ace-actions">
          <Button
            variant="secondary"
            size="sm"
            ariaLabel="Change target character"
            onclick={ontargetpick}
          >
            Change
          </Button><Button
            variant="secondary"
            icon="trash"
            ariaLabel="Clear target character"
            size="sm"
            onclick={ontargetclear}
          />
        </div>
      {/if}
    </div>
  </div>

  {#if !targetOnly}
    <div
      class="tree-group tree-group--veteran"
      bind:this={legacyGroup}
    >
      <div class="legacy-heading">
        <span class="tree-label tree-label--veteran">Your Legacy</span>
        <div class="legacy-actions">
          {#if veteran}
            <Button
              variant="secondary"
              size="sm"
              ariaLabel="Change selected legacy"
              onclick={onlegacypick}
            >
              Change
            </Button><SegmentedControl
              label="Legacy spark display"
              options={[
                { value: 'split', label: 'Split' },
                { value: 'combined', label: 'Combined' }
              ]}
              bind:value={sparkView}
            />
          {/if}
          {#if veteran || sharedLegacyLabel}
            <Button
              variant="secondary"
              icon="trash"
              ariaLabel="Clear selected legacy"
              size="sm"
              onclick={onlegacyclear}
            />
          {/if}
        </div>
      </div>
      {#if veteran}
        <VeteranSummary
          {veteran}
          compact
          showStats={false}
          combined={sparkView === 'combined'}
        />
      {:else if sharedLegacyLabel}
        <p class="shared-legacy">{sharedLegacyLabel}</p>
      {:else}
        <button
          class="legacy-picker"
          type="button"
          aria-label="Pick your legacy"
          onclick={onlegacypick}
        >
          <span class="slot-portrait">
            <Icon
              name="search"
              size={22}
            />
          </span>
          <span class="slot-copy">
            <strong>Select veteran</strong>
            <small>Your legacy</small>
          </span>
          <span class="slot-chevron">
            <Icon
              name="chevron"
              size={16}
            />
          </span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  @import './affinity-picker.css';
</style>
