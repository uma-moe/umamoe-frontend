<script lang="ts">
  import { copyText } from '@/lib/clipboard';
  import {
    buildPlannerPayload,
    LINEAGE_SAVES_KEY,
    parsePlannerPayload,
    type PlannerPayloadNode
  } from '@/lib/lineage/planner';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { Toast } from '@/components/feedback/ToastRegion.svelte';
  import type { PlannerNodes } from './lineage-planner-nodes';
  import { plannerExportText, readSavedTrees, type SavedTrees } from './lineage-planner-storage';

  interface Props {
    nodes: PlannerNodes;
    filledCount: number;
    onapply: (payload: PlannerPayloadNode[]) => void;
    onnotify: (title: string, tone?: Toast['tone'], message?: string) => void;
  }

  let { nodes, filledCount, onapply, onnotify: notify }: Props = $props();

  let savesOpen = $state(false);
  let saves = $state<SavedTrees>({});
  let saveName = $state('');
  let savesError = $state('');
  let saveAction = $state<{ kind: 'overwrite' | 'delete'; name: string } | null>(null);
  let importInput = $state<HTMLInputElement>();

  function readSaves(): boolean {
    savesError = '';
    const stored = readSavedTrees();
    if (stored) {
      saves = stored;
      return true;
    }
    savesError = 'Saved trees could not be read. Your browser data has not been replaced.';
    return false;
  }

  export function openSaves(): void {
    saveName = '';
    readSaves();
    savesOpen = true;
  }

  function writeSaves(next: SavedTrees): boolean {
    try {
      localStorage.setItem(LINEAGE_SAVES_KEY, JSON.stringify(next));
      saves = next;
      return true;
    } catch {
      savesError =
        'Changes could not be saved. Browser storage is unavailable or full; your saved trees have not changed.';
      savesOpen = true;
      return false;
    }
  }

  function saveCurrent(): void {
    const name = saveName.trim();
    const payload = buildPlannerPayload(nodes);
    if (!name || !payload.length) return;
    if (!readSaves()) return;
    if (Object.hasOwn(saves, name)) {
      savesOpen = false;
      saveAction = { kind: 'overwrite', name };
      return;
    }
    if (writeSaves({ ...saves, [name]: payload })) {
      savesOpen = false;
      saveName = '';
      notify(`Saved “${name}”`, 'success');
    }
  }

  function loadSave(name: string): void {
    if (!readSaves()) return;
    const payload = Object.hasOwn(saves, name) ? parsePlannerPayload(saves[name]) : null;
    if (!payload) {
      savesError = `Save “${name}” could not be loaded. The current tree has not changed.`;
      return;
    }
    onapply(payload);
    savesOpen = false;
    notify(`Loaded “${name}”`, 'success');
  }

  function confirmSaveAction(): void {
    const action = saveAction;
    saveAction = null;
    if (!action) return;
    if (!readSaves()) {
      savesOpen = true;
      return;
    }
    const next =
      action.kind === 'overwrite'
        ? { ...saves, [action.name]: buildPlannerPayload(nodes) }
        : { ...saves };
    if (action.kind === 'delete') delete next[action.name];
    if (!writeSaves(next)) return;
    notify(`${action.kind === 'delete' ? 'Deleted' : 'Saved'} “${action.name}”`, 'success');
    if (action.kind === 'delete') openSaves();
    else saveName = '';
  }

  function cancelSaveAction(): void {
    saveAction = null;
    openSaves();
  }

  async function copyTree(): Promise<void> {
    savesOpen = false;
    const value = plannerExportText(nodes);
    if (!value) return notify('Nothing to export', 'warning');
    if (await copyText(value)) notify('Copied tree to clipboard', 'success');
    else notify('Clipboard access was blocked', 'danger', 'Use “Download .json” instead.');
  }

  async function importClipboard(): Promise<void> {
    savesOpen = false;
    try {
      importRaw(await navigator.clipboard.readText());
    } catch {
      notify('Clipboard access was blocked', 'danger', 'Use “Import .json” instead.');
    }
  }

  function downloadTree(): void {
    const value = plannerExportText(nodes);
    if (!value) return notify('Nothing to export', 'warning');
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    const anchor = document.createElement('a');
    savesOpen = false;
    anchor.href = url;
    anchor.download = `lineage-tree-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importRaw(raw: string): void {
    try {
      const payload = parsePlannerPayload(JSON.parse(raw));
      if (!payload) throw new Error();
      onapply(payload);
      savesOpen = false;
      notify('Imported tree', 'success');
    } catch {
      notify(
        'Invalid tree data',
        'danger',
        'The file does not contain a compatible lineage planner payload.'
      );
    }
  }

  async function importFiles(files: FileList | null): Promise<void> {
    const file = files?.item(0);
    if (!file) return;
    savesOpen = false;
    try {
      importRaw(await file.text());
    } catch {
      notify(
        'Failed to read file',
        'danger',
        'The current tree has not changed. Try importing the file again.'
      );
    }
  }
</script>

{#if savesOpen}
  <div class="lineage-saves-surface">
    <Dialog
      id="lineage-saves"
      bind:open={savesOpen}
      title="Lineage Trees"
      icon="lineage"
      maxWidth="560px"
      maxHeight="85dvh"
      mobileInset="16px"
      contentPadding="16px"
      mobileContentPadding="16px"
    >
      <div class="saves-dialog">
        {#if savesError}
          <Banner
            tone="danger"
            title="Saved trees unavailable"
          >
            <p>{savesError}</p>
            <Button
              variant="secondary"
              size="sm"
              onclick={readSaves}
            >
              Retry saved trees
            </Button>
          </Banner>
        {/if}
        <section aria-labelledby="lineage-save-heading">
          <h3 id="lineage-save-heading">
            <Icon
              name="save"
              size={14}
            />Save current tree
          </h3>
          <form
            class="save-row"
            onsubmit={(event) => {
              event.preventDefault();
              saveCurrent();
            }}
          >
            <TextField
              id="lineage-save-name"
              label="Tree name"
              hideLabel
              placeholder="Tree name"
              maxlength={60}
              bind:value={saveName}
            />
            <Button
              type="submit"
              size="sm"
              icon="save"
              disabled={!saveName.trim() || !filledCount || Boolean(savesError)}
            >
              Save
            </Button>
          </form>
          {#if !filledCount}
            <p class="save-hint">Tree is empty - nothing to save yet.</p>
          {/if}
          {#if Object.hasOwn(saves, saveName.trim())}
            <p class="save-hint">A save with this name already exists. It will be overwritten.</p>
          {/if}
        </section>
        <section aria-labelledby="lineage-saved-heading">
          <h3 id="lineage-saved-heading">
            <Icon
              name="folder-open"
              size={14}
            />Saved trees ({Object.keys(saves).length})
          </h3>
          {#if !savesError}
            <div class="save-list">
              {#each Object.entries(saves).sort( ([a], [b]) => a.localeCompare(b) ) as [name, payload]}
                <div class="save-item">
                  <Button
                    variant="ghost"
                    size="sm"
                    ariaLabel={`Load ${name}`}
                    onclick={() => loadSave(name)}
                  >
                    <span class="save-meta">
                      <Icon
                        name="lineage"
                        size={18}
                      />
                      <span>
                        <strong>{name}</strong>
                        <small>{payload.length} node{payload.length === 1 ? '' : 's'}</small>
                      </span>
                    </span>
                  </Button>
                  <IconButton
                    icon="trash"
                    label={`Delete ${name}`}
                    size="sm"
                    onclick={() => {
                      savesOpen = false;
                      saveAction = { kind: 'delete', name };
                    }}
                  />
                </div>
              {:else}
                <p class="saves-empty">No saved trees yet.</p>
              {/each}
            </div>
          {/if}
        </section>
        <section aria-labelledby="lineage-transfer-heading">
          <h3 id="lineage-transfer-heading">
            <Icon
              name="share"
              size={14}
            />Share &amp; transfer
          </h3>
          <div class="transfer-actions">
            <Button
              variant="secondary"
              disabled={!filledCount}
              onclick={copyTree}
            >
              <span class="transfer-content">
                <Icon
                  name="copy"
                  size={18}
                />
                <strong>Copy share string</strong>
                <small>Send via chat or notes</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              disabled={!filledCount}
              onclick={downloadTree}
            >
              <span class="transfer-content">
                <Icon
                  name="download"
                  size={18}
                />
                <strong>Download .json</strong>
                <small>Save as a file</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              onclick={importClipboard}
            >
              <span class="transfer-content">
                <Icon
                  name="clipboard"
                  size={18}
                />
                <strong>Paste share string</strong>
                <small>Replaces current tree</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              onclick={() => {
                if (importInput) {
                  importInput.value = '';
                  importInput.click();
                }
              }}
            >
              <span class="transfer-content">
                <Icon
                  name="upload"
                  size={18}
                />
                <strong>Import .json</strong>
                <small>Load a file</small>
              </span>
            </Button>
          </div>
          <input
            bind:this={importInput}
            type="file"
            aria-label="Import lineage tree"
            accept=".json,application/json"
            hidden
            onchange={(event) => importFiles(event.currentTarget.files)}
          />
        </section>
      </div>
    </Dialog>
  </div>
{/if}

{#if saveAction}
  <Dialog
    id="lineage-save-confirm"
    open
    title={saveAction.kind === 'delete' ? 'Delete saved tree?' : 'Overwrite save?'}
    maxWidth="420px"
    mobileInset="16px"
    onclose={cancelSaveAction}
  >
    <p class="confirmation-message">
      {saveAction.kind === 'delete'
        ? `“${saveAction.name}” will be permanently removed from your browser.`
        : `A saved tree named “${saveAction.name}” already exists. Replace it with the current tree?`}
    </p>
    {#snippet actions()}
      <Button
        variant="secondary"
        onclick={cancelSaveAction}
      >
        Cancel
      </Button>
      <Button
        variant={saveAction?.kind === 'delete' ? 'danger' : 'primary'}
        onclick={confirmSaveAction}
      >
        {saveAction?.kind === 'delete' ? 'Delete' : 'Overwrite'}
      </Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  @import './lineage-saves.css';
</style>
