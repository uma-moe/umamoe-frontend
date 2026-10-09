<script lang="ts">
  import IconButton from './IconButton.svelte';
  import Icon from './Icon.svelte';
  type SkillRarity = 'normal' | 'gold' | 'special' | 'unique-inherited' | 'unique-main';

  interface Props {
    name: string;
    icon?: string;
    level?: string | number;
    rarity?: SkillRarity;
    compact?: boolean;
    iconOnly?: boolean;
    variant?: 'chip' | 'row';
    onremove?: () => void;
  }

  let { name, icon, level, rarity = 'normal', compact = false, iconOnly = false, variant = 'chip', onremove }: Props = $props();
  let iconFailed = $state(false);
</script>

<span class="skill-chip rarity-{rarity}" class:compact class:icon-only={iconOnly} class:row={variant === 'row'} class:with-icon={Boolean(icon && !iconFailed)} class:removable={Boolean(onremove)} title={level === undefined ? name : `${name} ${level}`}>
  {#if icon && !iconFailed}
    <img src={icon} alt="" loading="lazy" decoding="async" onerror={() => iconFailed = true}/>
  {:else if iconOnly}<Icon name="activity" size={20}/>{/if}
  {#if !iconOnly}<span class="skill-body"><span class="skill-name">{name}</span>{#if level !== undefined}<span class="skill-level">{level}</span>{/if}{#if onremove}<IconButton icon="close" size="sm" label={`Remove ${name}`} onclick={onremove}/>{/if}</span>{/if}
</span>

<style>
  .skill-chip.icon-only { width:24px; height:24px; display:grid; place-items:center; }
  .skill-chip {
    --skill-border: rgb(255 255 255 / .10);
    --skill-bg: rgb(255 255 255 / .055);
    --skill-text: rgb(255 255 255 / .78);
    min-height: 27px; max-width: 100%; display: inline-flex; align-items: stretch; overflow: visible; color: var(--skill-text); font-size: .74rem; font-weight: 600; line-height: 1; white-space: nowrap;
  }
  img { width: 27px; height: 27px; display: block; flex: 0 0 auto; object-fit: contain; border: 0; border-radius: 0; background: none; box-shadow: none; }
  .skill-body { min-width: 0; min-height: 27px; display: inline-flex; align-items: baseline; gap: 5px; padding: 4px 7px; border: 1px solid var(--skill-border); border-radius: 6px; background: var(--skill-bg); box-shadow: inset 0 1px 0 rgb(255 255 255 / .035); }
  .with-icon .skill-body { padding-left: 6px; border-left: 0; border-radius: 0 6px 6px 0; }
  .skill-name { line-height:1.25; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .skill-level { line-height:1.25; flex: 0 0 auto; margin-left: 1px; padding-left: 5px; border-left: 1px solid color-mix(in srgb, currentColor 24%, transparent); color: inherit; font-size: .59rem; font-weight: 700; font-variant-numeric: tabular-nums; opacity: .78; }
  .rarity-gold { --skill-border: rgb(255 193 7 / .38); --skill-bg: rgb(255 170 32 / .13); --skill-text: #ffe08a; }
  .rarity-special { --skill-border: rgb(33 150 243 / .40); --skill-bg: rgb(33 150 243 / .13); --skill-text: #90caf9; }
  .rarity-unique-inherited { --skill-border: rgb(186 104 200 / .42); --skill-bg: linear-gradient(135deg, rgb(126 87 194 / .26), rgb(171 71 188 / .20)); --skill-text: #d7a6e3; }
  .rarity-unique-main { --skill-border: transparent; --skill-bg: linear-gradient(rgb(34 28 14 / .90), rgb(34 28 14 / .90)); --skill-text: #ffe8a6; }
  .rarity-unique-main .skill-body { background: var(--skill-bg) padding-box, linear-gradient(135deg, #ff8a65, #ffd166 30%, #5eead4 58%, #64b5f6 76%, #ce93d8) border-box; }
  .compact { min-height: 24px; font-size: .66rem; }
  .compact img { width: 24px; height: 24px; }
  .compact .skill-body { min-height: 24px; gap: 4px; padding-right: 5px; }
  .compact .skill-level { margin-left: 0; padding-left: 4px; font-size: .55rem; }
  .row { min-height: 24px; align-items: center; color: var(--color-text); font-size: var(--font-sm); }
  .row img { width: 24px; height: 24px; }
  .row .skill-body,
  .row.with-icon .skill-body { min-height: 24px; gap: 5px; padding: 0 2px 0 7px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .row .skill-name { color: var(--color-text); }
  .row .skill-level { margin-left: 1px; padding: 0 0 0 5px; border-left: 1px solid color-mix(in srgb, currentColor 24%, transparent); border-radius: 0; background: transparent; color: var(--color-text-muted); }
  .removable { width:100%; min-height:32px; font-size:12px; }
  .removable img { width:32px; height:32px; }
  .removable .skill-body { flex:1; min-height:32px; align-items:center; gap:6px; padding:0 2px 0 8px; }
  .removable .skill-name { flex:1; }
  .removable .skill-body :global(.icon-button) { width:28px; height:28px; color:inherit; opacity:.65; }.removable .skill-body :global(.icon-button:hover),.removable .skill-body :global(.icon-button:focus-visible) { opacity:1; }.removable :global(.icon-button svg) { width:14px; height:14px; }
  :global([data-theme='light']) .skill-chip { --skill-border: rgb(17 24 39 / .16); --skill-bg: rgb(17 24 39 / .045); --skill-text: rgb(17 24 39 / .78); }
  :global([data-theme='light']) .skill-body { box-shadow: inset 0 1px 0 rgb(255 255 255 / .6); }
  :global([data-theme='light']) .rarity-gold { --skill-border: rgb(180 83 9 / .36); --skill-bg: rgb(245 158 11 / .13); --skill-text: #92400e; }
  :global([data-theme='light']) .rarity-unique-inherited { --skill-border: rgb(126 34 206 / .32); --skill-bg: linear-gradient(135deg, rgb(126 87 194 / .10), rgb(171 71 188 / .08)); --skill-text: #6b21a8; }
  :global([data-theme='light']) .rarity-unique-main { --skill-border: transparent; --skill-bg: linear-gradient(#fffaf0, #fffaf0); --skill-text: #713f12; }
  :global([data-theme='light']) .rarity-special { --skill-border: rgb(37 99 235 / .34); --skill-bg: rgb(37 99 235 / .10); --skill-text: #1d4ed8; }
</style>
