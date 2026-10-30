<!-- The visible part of an info trigger: a small labelled badge, matching Hakuraku's info buttons. The surrounding button or popover trigger owns the interaction and its accessible name. -->
<span
  class="info-badge"
  aria-hidden="true"
>
  Info
</span>

<style>
  .info-badge {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 1px 5px;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
  }
  .info-badge:hover {
    color: var(--color-text);
  }
</style>
