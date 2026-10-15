<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import type { Toast } from '@/components/feedback/ToastRegion.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import DemoBlock from '../DemoBlock.svelte';
  import { skillRecoveryIcon } from '../fixtures';

  interface Props {
    ids: string[];
    onnotify: (message?: string) => void;
    ontoast: (toast: Toast) => void;
    onopendialog: () => void;
  }

  let { ids, onnotify, ontoast, onopendialog }: Props = $props();
</script>

{#if ids.includes('feedback')}
  <DemoBlock id="feedback">
    <div class="preview-stack">
      <Banner
        title="Dataset updated"
        tone="success"
        dismissible
      >
        <p>Your collection is up to date.</p>
      </Banner><Banner
        title="Offline changes pending"
        tone="warning"
        dismissible
      >
        <p>Changes will sync when the connection returns.</p>
      </Banner><Banner
        title="Import failed"
        tone="danger"
        dismissible
      >
        <p>Check the file and try again.</p>
      </Banner><EmptyState
        compact
        icon="veterans"
        title="No Veterans yet"
        description="Import a compatible JSON file to start your collection."
      >
        {#snippet actions()}
          <Button
            size="sm"
            icon="upload"
            onclick={() => onnotify('Import preview')}
          >
            Import
          </Button>
        {/snippet}
      </EmptyState>
      <div class="preview-row">
        <Spinner />
        <span>Loading…</span>
        {#each ['info', 'success', 'warning', 'danger'] as tone}
          <Button
            variant="secondary"
            onclick={() =>
              ontoast({
                id: tone,
                title:
                  tone === 'danger'
                    ? 'Error notification'
                    : tone.charAt(0).toUpperCase() + tone.slice(1) + ' notification',
                message: 'Sample notification with a dismiss button.',
                tone: tone as Toast['tone']
              })}
          >
            {tone === 'danger' ? 'Error' : tone.charAt(0).toUpperCase() + tone.slice(1)} toast
          </Button>
        {/each}
      </div>
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('dialog')}
  <DemoBlock id="dialog">
    <div class="preview-stack">
      <div class="preview-row">
        <Button onclick={() => onopendialog()}>Open dialog</Button><InspectPopover
          label="Swinging Maestro details"
        >
          {#snippet trigger()}
            <SkillChip
              icon={skillRecoveryIcon}
              name="Swinging Maestro"
              rarity="gold"
            />
          {/snippet}
          <p>Recover endurance on a corner with good positioning.</p>
        </InspectPopover>
      </div>
      <Disclosure
        id="lab-history"
        title="Fan history"
        description="Monthly totals and ranks"
        icon="timeline"
      >
        <p>Optional details expand beneath the section heading.</p>
      </Disclosure>
    </div>
  </DemoBlock>
{/if}
