<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    context?: string;
  }

  let { title, description, context }: Props = $props();
</script>

<header class="section-heading">
  <div>
    <h2>{title}</h2>
    {#if description}
      <p>{description}</p>
    {/if}
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
    margin-bottom: 12px;
  }
  .section-heading h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }
  .section-heading p {
    max-width: 70ch;
    margin: 3px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.55;
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
    .section-heading p {
      font-size: 11px;
    }
  }
</style>
