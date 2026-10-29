<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import type { UqlEditorLanguage } from '@/lib/inheritance/uql/uql-editor';
  import DatabaseUqlExample from './DatabaseUqlExample.svelte';
  import DatabaseUqlFieldsReference from './DatabaseUqlFieldsReference.svelte';
  import DatabaseUqlScoringReference from './DatabaseUqlScoringReference.svelte';
  import DatabaseUqlSyntaxReference from './DatabaseUqlSyntaxReference.svelte';
  import './database-uql-guide.css';

  type ReferenceTopic = 'fields' | 'scopes' | 'operators' | 'values' | 'directives' | 'scoring';

  let { language, oninsert }: { language: UqlEditorLanguage; oninsert: (text: string) => void } =
    $props();

  let activeReferenceTopic = $state<ReferenceTopic>('fields');
  let open = $state(false);

  const simplePredicateDocSnippets = [
    'Groundwork > 6 and Groundwork = 3x',
    'Main Speed = 1x or Main Stamina = 1x',
    'Speed >= 3 and Wins >= 30',
    'White count >= 12',
    'target = Special Week',
    'Characters in (Special Week, Silence Suzuka)',
    'Support card = Kitasan Black [SSR] (Speed) and limitbreak >= 4'
  ];

  const threeWayMatchDocSnippets = [
    'Main has all (Groundwork, Ignited Spirit WIT) and GP1 has all (Groundwork, Ignited Spirit WIT) and GP2 has all (Groundwork, Ignited Spirit WIT)'
  ];
</script>

{#snippet topicButton(topic: ReferenceTopic, number: string, title: string, detail: string)}
  <button
    type="button"
    class:active={activeReferenceTopic === topic}
    aria-current={activeReferenceTopic === topic ? 'page' : null}
    onclick={() => (activeReferenceTopic = topic)}
  >
    <span>{number}</span>
    <strong>{title}</strong>
    <small>{detail}</small>
  </button>
{/snippet}

<details
  class="uql-wiki-panel"
  bind:open
>
  <summary>
    <span class="uql-wiki-summary-main">
      <span>
        <Icon
          name="book"
          size={16}
        />
      </span>
      <span>UQL guide & reference</span>
    </span>
    <small>Quick start, complete property catalog, operators, and scoring</small>
    <span class="uql-wiki-chevron">
      <Icon
        name="chevron"
        size={16}
      />
    </span>
  </summary>

  {#if open}
    <article class="uql-doc-article">
      <header class="uql-doc-hero">
        <p class="uql-doc-kicker">Quick start</p>
        <h5>Compose predicates over inheritance data.</h5>
        <p>
          UQL filters each database row with readable field and factor names. The editor supplies <span
            class="uql-doc-inline-code"
          >
            where
          </span>
          ; enter the predicate only. Autocomplete exposes the available fields, values, and operators
          at the cursor.
        </p>
      </header>

      <section
        class="uql-doc-section"
        aria-labelledby="uql-anatomy"
      >
        <h6 id="uql-anatomy">Predicate anatomy</h6>
        <div
          class="uql-doc-anatomy"
          aria-label="Example predicate: Main Speed greater than or equal to 3"
        >
          <div>
            <span>
              Scope <small>optional</small>
            </span>
            <code>Main</code>
          </div>
          <div>
            <span>Field or factor</span>
            <code>Speed</code>
          </div>
          <div>
            <span>Operator</span>
            <code>&gt;=</code>
          </div>
          <div>
            <span>Value</span>
            <code>3</code>
          </div>
        </div>
        <p>
          Without a scope, named factors are totaled across the visible lineage. Prefix a field with <span
            class="uql-doc-inline-code"
          >
            Main
          </span>
          ,
          <span class="uql-doc-inline-code">GP1</span>
          ,
          <span class="uql-doc-inline-code">GP2</span>
          , or
          <span class="uql-doc-inline-code">GP</span>
          when position matters. Join predicates with
          <span class="uql-doc-inline-code">and</span>
          or
          <span class="uql-doc-inline-code">or</span>
          .
        </p>
        <p>
          Add <code>x</code>
          to count parents carrying a factor:
          <code>Groundwork = 3x</code>
          . Stars and occurrences can be combined. Main counts 0–1; the full lineage counts 0–3.
        </p>
        <p class="uql-doc-example-intro">Click an example to add it to the query:</p>
        <div class="uql-doc-example-row">
          {#each simplePredicateDocSnippets as snippet}
            <button
              type="button"
              class="uql-doc-snippet-button"
              aria-label={'Use example: ' + snippet}
              onclick={() => oninsert(snippet)}
            >
              <DatabaseUqlExample
                {language}
                text={snippet}
              />
            </button>
          {/each}
        </div>
      </section>

      <section
        class="uql-doc-section uql-doc-featured"
        aria-labelledby="uql-three-way"
      >
        <div class="uql-doc-featured-heading">
          <span class="uql-doc-featured-icon">
            <span>
              <Icon
                name="lineage"
                size={16}
              />
            </span>
          </span>
          <div>
            <p class="uql-doc-kicker">Common recipe</p>
            <h6 id="uql-three-way">Require the same skills in all three slots</h6>
          </div>
        </div>
        <p>
          Apply the requirement separately to <span class="uql-doc-inline-code">Main</span>
          ,
          <span class="uql-doc-inline-code">GP1</span>
          , and
          <span class="uql-doc-inline-code">GP2</span>
          , then connect all three predicates with
          <span class="uql-doc-inline-code">and</span>
          .
        </p>
        {#each threeWayMatchDocSnippets as snippet}
          <button
            type="button"
            class="uql-doc-snippet-button uql-doc-snippet-button-wide"
            aria-label={'Use three-way match example: ' + snippet}
            onclick={() => oninsert(snippet)}
          >
            <DatabaseUqlExample
              {language}
              text={snippet}
            />
          </button>
        {/each}
        <p class="uql-doc-note">
          <span>
            <Icon
              name="info"
              size={16}
            />
          </span>
          <span>
            <span class="uql-doc-inline-code">lineage white</span>
            ranks by lineage depth; it does not require every slot to match. Use explicit scoped predicates
            for a hard three-way requirement.
          </span>
        </p>
      </section>

      <section
        class="uql-doc-section"
        aria-labelledby="uql-reference"
      >
        <div class="uql-doc-section-heading">
          <div>
            <h6 id="uql-reference">UQL Reference</h6>
          </div>
        </div>
        <p>
          Everything UQL accepts, grouped like the database filters. Readable names are shown first;
          backend-style underscore names remain valid.
        </p>

        <div class="uql-doc-reference-layout">
          <nav
            class="uql-doc-reference-nav"
            aria-label="UQL reference topics"
          >
            {@render topicButton('fields', '01', 'Fields & properties', 'What you can query')}
            {@render topicButton('scopes', '02', 'Scopes & matching', 'Where UQL looks')}
            {@render topicButton('operators', '03', 'Operators', 'How values compare')}
            {@render topicButton('values', '04', 'Values & names', 'Skills, races, and IDs')}
            {@render topicButton(
              'directives',
              '05',
              'Directives & sorting',
              'Editor and result order'
            )}
            {@render topicButton('scoring', '06', 'Scoring & raw syntax', 'Advanced ranking')}
          </nav>

          <div class="uql-doc-reference-panels">
            {#if activeReferenceTopic === 'fields'}
              <DatabaseUqlFieldsReference />
            {/if}

            <DatabaseUqlSyntaxReference topic={activeReferenceTopic} />

            {#if activeReferenceTopic === 'scoring'}
              <DatabaseUqlScoringReference
                {language}
                {oninsert}
              />
            {/if}
          </div>
        </div>
      </section>
    </article>
  {/if}
</details>
