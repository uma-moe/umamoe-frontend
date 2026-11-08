<script lang="ts">
  import type { IconName } from './icon-types';
  import { iconPaths } from './icon-paths';

  interface Props {
    name: IconName;
    size?: number;
    label?: string;
  }

  let { name, size = 20, label }: Props = $props();

  const filledIcons = new Set<IconName>(['discord', 'google', 'github', 'ko-fi', 'play']);
  const pathFills: Partial<Record<IconName, string[]>> = {
    google: ['#4285f4', '#34a853', '#fbbc05', '#ea4335']
  };
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill={filledIcons.has(name) ? 'currentColor' : 'none'}
  stroke={filledIcons.has(name) ? 'none' : 'currentColor'}
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={label ? undefined : 'true'}
  role={label ? 'img' : undefined}
>
  {#if label}
    <title>{label}</title>
  {/if}
  {#each iconPaths[name] as path, index}
    <path
      d={path}
      fill={pathFills[name]?.[index]}
      class:kofi-heart={name === 'ko-fi' && index === 1}
    ></path>
  {/each}
</svg>
