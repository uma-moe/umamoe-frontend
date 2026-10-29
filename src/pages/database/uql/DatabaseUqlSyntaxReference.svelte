<script lang="ts">
  let { topic }: { topic: string } = $props();
</script>

{#if topic === 'scopes'}
  <section class="uql-doc-reference-panel">
    <header class="uql-doc-reference-panel-heading">
      <span>Placement</span>
      <h6>Scopes and matching semantics</h6>
      <p>Global totals, exact slots, and entity scope.</p>
    </header>
    <div class="uql-doc-reference-body">
      <dl class="uql-doc-table uql-doc-table-compact">
        <div>
          <dt>No scope</dt>
          <dd>Uses the field's global meaning: usually a lineage total or any relevant slot.</dd>
        </div>
        <div>
          <dt>Main / Parent / Main parent</dt>
          <dd>Main-parent slot only.</dd>
        </div>
        <div>
          <dt>GP1 / Left / Great parent 1</dt>
          <dd>Left great-parent slot only.</dd>
        </div>
        <div>
          <dt>GP2 / Right / Great parent 2</dt>
          <dd>Right great-parent slot only.</dd>
        </div>
        <div>
          <dt>GP / Any GP / Great parent</dt>
          <dd>Either great parent may satisfy the predicate; it does not require both.</dd>
        </div>
        <div>
          <dt>Characters in (...)</dt>
          <dd>Any Main, GP1, or GP2 character matches a listed value.</dd>
        </div>
        <div>
          <dt>Characters not in (...)</dt>
          <dd>All three character slots must be outside the list.</dd>
        </div>
      </dl>
      <p>
        Examples: <span class="uql-doc-inline-code">Speed &gt;= 6</span>
        is a lineage total,
        <span class="uql-doc-inline-code">Main Speed &gt;= 3</span>
        is one slot, and
        <span class="uql-doc-inline-code">GP Speed &gt;= 3</span>
        accepts either great parent.
      </p>
    </div>
  </section>
{/if}

{#if topic === 'operators'}
  <section class="uql-doc-reference-panel">
    <header class="uql-doc-reference-panel-heading">
      <span>Expression grammar</span>
      <h6>Operators and expressions</h6>
      <p>Numeric, text, collection, and boolean syntax.</p>
    </header>
    <div class="uql-doc-reference-body">
      <dl class="uql-doc-table uql-doc-table-compact">
        <div>
          <dt>= == != &lt;&gt; &gt; &gt;= &lt; &lt;=</dt>
          <dd>
            Numeric or exact-value comparisons. <span class="uql-doc-inline-code">=</span>
            and
            <span class="uql-doc-inline-code">==</span>
            are equivalent, as are
            <span class="uql-doc-inline-code">!=</span>
            and
            <span class="uql-doc-inline-code">&lt;&gt;</span>
            .
          </dd>
        </div>
        <div>
          <dt>between A and B</dt>
          <dd>Inclusive numeric range.</dd>
        </div>
        <div>
          <dt>+ - * /</dt>
          <dd>Numeric arithmetic; division uses integer semantics.</dd>
        </div>
        <div>
          <dt>% / mod</dt>
          <dd>
            Modulo remainder, for example <span class="uql-doc-inline-code">Wins % 2 = 0</span>
            .
          </dd>
        </div>
        <div>
          <dt>in (...) / not in (...)</dt>
          <dd>
            Include or exclude listed values. On collections, <span class="uql-doc-inline-code">
              in
            </span>
            behaves like
            <span class="uql-doc-inline-code">has any</span>
            .
          </dd>
        </div>
        <div>
          <dt>has / contains</dt>
          <dd>Require one collection value. The names are aliases.</dd>
        </div>
        <div>
          <dt>has any / contains any</dt>
          <dd>Require at least one listed collection value.</dd>
        </div>
        <div>
          <dt>has all / contains all</dt>
          <dd>Require every listed collection value.</dd>
        </div>
        <div>
          <dt>does not have</dt>
          <dd>Exclude one collection value.</dd>
        </div>
        <div>
          <dt>like / ilike / not ilike</dt>
          <dd>
            Text patterns; <span class="uql-doc-inline-code">ilike</span>
            is case-insensitive and
            <span class="uql-doc-inline-code">%</span>
            is a wildcard.
          </dd>
        </div>
        <div>
          <dt>and / or / not</dt>
          <dd>Boolean composition and negation.</dd>
        </div>
        <div>
          <dt>( ... )</dt>
          <dd>
            Explicit grouping. Use parentheses whenever <span class="uql-doc-inline-code">and</span>
            and
            <span class="uql-doc-inline-code">or</span>
            are mixed.
          </dd>
        </div>
      </dl>
    </div>
  </section>
{/if}

{#if topic === 'values'}
  <section class="uql-doc-reference-panel">
    <header class="uql-doc-reference-panel-heading">
      <span>Value grammar</span>
      <h6>Values, skills, and readable names</h6>
      <p>Lists, star thresholds, races, cards, and scenarios.</p>
    </header>
    <div class="uql-doc-reference-body">
      <dl class="uql-doc-table uql-doc-table-compact">
        <div>
          <dt>Main has Right-Handed ○</dt>
          <dd>Named white skill at any star level.</dd>
        </div>
        <div>
          <dt>Main Right-Handed ○ &gt;= 2</dt>
          <dd>Named factor with a slot-specific star threshold.</dd>
        </div>
        <div>
          <dt>White factors in (Skill A &gt; 3, Skill B)</dt>
          <dd>Either skill; the first also has a lineage star threshold.</dd>
        </div>
        <div>
          <dt>Race wins has all (...)</dt>
          <dd>Main parent covers every listed race.</dd>
        </div>
        <div>
          <dt>Left race wins in (...)</dt>
          <dd>Left great parent covers at least one listed race.</dd>
        </div>
        <div>
          <dt>Support card = ... and LB &gt;= 4</dt>
          <dd>Selected support card with a minimum limit break.</dd>
        </div>
        <div>
          <dt>Scenario = Aoharu</dt>
          <dd>Readable scenario name compiled to its scenario ID.</dd>
        </div>
        <div>
          <dt>Trainer name ilike '%name%'</dt>
          <dd>Case-insensitive substring search.</dd>
        </div>
      </dl>
      <p>
        Character, factor, race, scenario, support-card, and owned-legacy values all autocomplete by
        readable name. Backend IDs remain searchable and valid.
      </p>
    </div>
  </section>
{/if}

{#if topic === 'directives'}
  <section class="uql-doc-reference-panel">
    <header class="uql-doc-reference-panel-heading">
      <span>Editor controls</span>
      <h6>Editor directives and sorting</h6>
      <p>Affinity context, owned legacies, and result order.</p>
    </header>
    <div class="uql-doc-reference-body">
      <p>
        Directives configure the editor or result order. They are removed before the predicate is
        sent to the backend.
      </p>
      <dl class="uql-doc-table uql-doc-table-compact">
        <div>
          <dt>target = Special Week</dt>
          <dd>Set the character used for affinity calculations.</dd>
        </div>
        <div>
          <dt>owned legacy = []</dt>
          <dd>Open the account legacy picker.</dd>
        </div>
        <div>
          <dt>owned legacy = [Name #id]</dt>
          <dd>Use the selected legacy's P2 character and races for comparison.</dd>
        </div>
        <div>
          <dt>legacy / my legacy / your legacy</dt>
          <dd>
            Accepted aliases for <span class="uql-doc-inline-code">owned legacy</span>
            .
          </dd>
        </div>
        <div>
          <dt>sort by = Total Blue stars</dt>
          <dd>Sort descending by blue-star total.</dd>
        </div>
        <div>
          <dt>sort by = Total Red stars</dt>
          <dd>Sort by pink-star total; Red is the UI alias.</dd>
        </div>
        <div>
          <dt>sort by = Total Green stars</dt>
          <dd>Sort descending by green-star total.</dd>
        </div>
        <div>
          <dt>sort by = Total White stars</dt>
          <dd>Sort descending by white-star total.</dd>
        </div>
        <div>
          <dt>sort by = White skills amount</dt>
          <dd>Sort by raw white-skill count. Affinity breaks ties.</dd>
        </div>
      </dl>
    </div>
  </section>
{/if}
