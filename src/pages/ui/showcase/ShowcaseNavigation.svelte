<script lang="ts">
  import IconButton from '@/components/controls/IconButton.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import Menu from '@/components/navigation/Menu.svelte';
  import Tooltip from '@/components/overlays/Tooltip.svelte';
  import DemoBlock from '../DemoBlock.svelte';

  interface Props {
    ids: string[];
    onnotify: (message?: string) => void;
  }

  let { ids, onnotify }: Props = $props();

  let tab = $state('database'),
    page = $state(1),
    statisticsTab = $state('overview');
</script>

{#if ids.includes('navigation')}
  <DemoBlock id="navigation">
    <div class="preview-stack">
      <div class="preview-narrow">
        <Tabs
          variant="pills"
          label="Database source"
          items={[
            { id: 'database', label: 'Database', icon: 'database' },
            { id: 'bookmarks', label: 'Bookmarks', icon: 'veterans', badge: '6' }
          ]}
          bind:value={tab}
        />
      </div>
      <Tabs
        variant="pills"
        label="Statistics sections"
        items={[
          { id: 'overview', label: 'Overview', icon: 'grid' },
          { id: 'supports', label: 'Supports', icon: 'cards' },
          { id: 'skills', label: 'Skills', icon: 'star' },
          { id: 'stats', label: 'Stats', icon: 'chart' },
          { id: 'characters', label: 'Characters', icon: 'users' }
        ]}
        bind:value={statisticsTab}
      /><Pagination
        pages={834}
        total={10000}
        pageSize={12}
        jump
        bind:page
      />
    </div>
  </DemoBlock>
{/if}
{#if ids.includes('table')}
  <DemoBlock id="table">
    <DataTable
      caption="Veteran comparison"
      columns={[
        { key: 'name', label: 'Veteran', priority: 'primary' },
        { key: 'rank', label: 'Rank' },
        { key: 'speed', label: 'Speed', numeric: true },
        { key: 'distance', label: 'Distance', priority: 'secondary' }
      ]}
      rows={[
        { name: 'Mejiro McQueen', rank: 'UE1', speed: 1542, distance: 'Long' },
        { name: 'Oguri Cap', rank: 'UF4', speed: 1430, distance: 'Mile' }
      ]}
    />
  </DemoBlock>
{/if}
{#if ids.includes('menu')}
  <DemoBlock id="menu">
    <div class="preview-row">
      <Menu
        label="Trainer"
        icon="user"
        menuLabel="Account"
        items={[
          { id: 'profile', label: 'My profile', icon: 'user' },
          { id: 'settings', label: 'Settings', icon: 'tune', href: '/settings' },
          { id: 'signout', label: 'Sign out', icon: 'arrow-right', separator: true }
        ]}
        onselect={() => onnotify('Account action preview')}
      /><Tooltip text="Open filters">
        <IconButton
          icon="filter"
          label="Filter tooltip"
        />
      </Tooltip>
    </div>
  </DemoBlock>
{/if}
