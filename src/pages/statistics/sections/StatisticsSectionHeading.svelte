<script lang="ts">
  interface Props {
    title: string;
    context?: string;
  }

  let { title, context }: Props = $props();
</script>

<header class="section-heading">
  <div>
    <h2>{title}</h2>
  </div>
  {#if context}
    <span class="context-label">{context}</span>
  {/if}
</header>

<style>
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .section-heading h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }
  .context-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11px;
    text-align: right;
    flex: none;
  }
  @container statistics (max-width:700px) {
    .context-label {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .section-heading {
      margin-bottom: 10px;
    }
    .section-heading h2 {
      font-size: 18px;
    }
  }
</style>
