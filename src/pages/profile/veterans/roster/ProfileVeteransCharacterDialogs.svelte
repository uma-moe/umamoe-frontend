<script lang="ts">
  import CharacterSelectDialog from '@/components/pickers/CharacterSelectDialog.svelte';
  import type { RosterCharacters } from './roster-characters.svelte';
  import type { RosterFilters } from './filters/roster-filters.svelte';

  interface Props {
    picks: RosterCharacters;
    filters: RosterFilters;
  }

  let { picks, filters }: Props = $props();
</script>

<CharacterSelectDialog
  id="veteran-uma-rules"
  bind:open={picks.umaOpen}
  options={picks.options}
  loading={picks.loading}
  error={picks.error}
  onretry={() => picks.load()}
  bind:selected={picks.umaDraft}
  existing={(
    (picks.umaMode === 'include' ? filters.include : filters.exclude)[picks.umaScope] ?? []
  ).map(String)}
  mode={picks.umaMode}
  multiple
  bind:sort={picks.umaSort}
  onselect={(values) => {
    filters.addAncestors(picks.umaScope, picks.umaMode, values.map(Number));
    picks.umaOpen = false;
  }}
/>
<CharacterSelectDialog
  id="veteran-target-select"
  bind:open={picks.targetOpen}
  options={picks.options}
  loading={picks.loading}
  error={picks.error}
  onretry={() => picks.load()}
  selected={picks.targetId ? [String(picks.targetId)] : []}
  bind:sort={picks.targetSort}
  onselect={(values) => picks.selectTarget(values[0] ?? '')}
/>
