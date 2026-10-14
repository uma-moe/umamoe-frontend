<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import SourcePage from '@/layouts/SourcePage.svelte';
</script>

<svelte:head><title>Work in progress · uma.moe</title></svelte:head>

<SourcePage
  routeId="wip"
  title="Coming Soon"
  width="normal"
>
  <div class="wip-placeholder">
    <section
      class="wip-card"
      aria-labelledby="wip-title"
    >
      <div class="wip-icon">
        <Icon
          name="tools"
          size={64}
        />
      </div>
      <h1 id="wip-title">Coming Soon</h1>
      <p class="wip-description">
        This feature is currently under development and will be available in the future.
      </p>
      <div class="wip-status">
        <Icon
          name="tools"
          size={20}
        />
        <span>Work in Progress</span>
      </div>
      <div class="wip-actions">
        <Button
          href="/"
          icon="home"
        >
          Back to Home
        </Button>
      </div>
    </section>
  </div>
</SourcePage>

<style>
  .wip-placeholder {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    font-size: 1rem;
  }
  .wip-card {
    width: 100%;
    max-width: 600px;
    position: relative;
    overflow: hidden;
    padding: 3rem 2rem;
    text-align: center;
  }
  .wip-card::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 4px;
    background: linear-gradient(90deg, #ff9800, #2196f3, #4caf50, #e91e63);
    background-size: 400% 400%;
    animation: gradient-shift 3s ease-in-out infinite;
  }
  .wip-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
    color: var(--accent-primary);
  }
  h1 {
    margin: 0 0 1rem;
    font-size: 2.5rem;
    font-weight: 600;
    background: var(--gradient-brand);
    background-clip: text;
    color: transparent;
  }
  .wip-description {
    margin: 0 0 2rem;
    color: var(--text-secondary);
    font-size: 1.125rem;
    line-height: 1.6;
  }
  .wip-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 2rem;
    padding: 0.75rem 1.5rem;
    background: rgb(255 152 0 / 0.1);
    border: 1px solid var(--accent-warning);
    border-radius: 25px;
    color: var(--accent-warning);
    font-weight: 500;
  }
  .wip-status :global(svg) {
    flex: 0 0 auto;
  }
  .wip-actions {
    display: grid;
    margin-bottom: 2rem;
  }
  @keyframes gradient-shift {
    0%,
    100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }
  @media (max-width: 768px) {
    .wip-placeholder {
      padding: 1rem;
    }
    .wip-card {
      padding: 2rem 1.5rem;
    }
    h1 {
      font-size: 2rem;
    }
    .wip-description {
      font-size: 1rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .wip-card::before {
      animation: none;
    }
  }
</style>
