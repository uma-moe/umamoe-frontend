<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import type { UqlEditorLanguage } from '@/lib/inheritance/uql/uql-editor';
  import DatabaseUqlExample from './DatabaseUqlExample.svelte';

  let { language, oninsert }: { language: UqlEditorLanguage; oninsert: (text: string) => void } =
    $props();

  const scoringParameterDocSnippets = [
    'optional white in (Groundwork, Ignited Spirit WIT, priority = 0, type_weight = 150, level_weight = 2)',
    'lineage white in (Groundwork, Ignited Spirit WIT, priority = 1, stack_weight = 1200, base = 115, decay = 50)'
  ];
</script>

<section class="uql-doc-reference-panel">
  <header class="uql-doc-reference-panel-heading">
    <span>Advanced</span>
    <h6>White-skill ranking and raw functions</h6>
    <p>Choose preferred skills, then optionally fine-tune how matching rows are ordered.</p>
  </header>
  <div class="uql-doc-reference-body">
    <p>
      For a normal search, use one of the four ranking functions below and leave every numeric
      setting at its default.
    </p>
    <dl class="uql-doc-table uql-doc-table-compact">
      <div>
        <dt>optional white in (...)</dt>
        <dd>
          Require at least one listed skill somewhere in the combined lineage, then put rows with
          more and stronger matches first.
        </dd>
      </div>
      <div>
        <dt>optional main white in (...)</dt>
        <dd>Require at least one listed skill on the main parent, then rank the matching rows.</dd>
      </div>
      <div>
        <dt>optional any white in (...)</dt>
        <dd>
          Require at least one listed skill in either the combined lineage or the main-parent
          factors, then score matches from both.
        </dd>
      </div>
      <div>
        <dt>lineage white in (...)</dt>
        <dd>
          Do not exclude any rows. Prefer lineages that repeat the listed skills across Main, GP1,
          and GP2.
        </dd>
      </div>
    </dl>

    <div class="uql-doc-parameter-guide">
      <p><strong>How to add parameters</strong></p>
      <p>
        Keep the skills first. After the final skill, add a comma and write <span
          class="uql-doc-inline-code"
        >
          parameter_name = number
        </span>
        before the closing parenthesis. Add more parameters the same way, separated by commas.
      </p>
      <p>
        <span class="uql-doc-inline-code">priority</span>
        and
        <span class="uql-doc-inline-code">weight</span>
        work on every ranking function. Use optional-white weights only with an
        <span class="uql-doc-inline-code">optional ... white</span>
        function, and lineage weights only with
        <span class="uql-doc-inline-code">lineage white</span>
        .
      </p>
      <div class="uql-doc-parameter-examples">
        {#each scoringParameterDocSnippets as snippet, exampleIndex}
          <button
            type="button"
            class="uql-doc-snippet-button uql-doc-snippet-button-wide"
            aria-label={'Use ' +
              (exampleIndex === 0 ? 'optional-white' : 'lineage-white') +
              ' parameter example'}
            onclick={() => oninsert(snippet)}
          >
            <DatabaseUqlExample
              {language}
              text={snippet}
            />
          </button>
        {/each}
      </div>
      <p class="uql-doc-example-intro">
        These examples are clickable. The first changes optional-white scoring and the second
        changes lineage scoring.
      </p>
    </div>

    <p>
      <strong>Priority groups</strong>
      decide which preference matters first.
    </p>
    <dl class="uql-doc-table uql-doc-table-compact">
      <div>
        <dt>priority = 0</dt>
        <dd>The primary preference. Its score is compared before every higher-numbered group.</dd>
      </div>
      <div>
        <dt>priority = 1, 2, ...</dt>
        <dd>
          Fallback preferences. Group 1 is checked only when two rows have the same group-0 score.
          Group 2 only breaks a further tie.
        </dd>
      </div>
      <div>
        <dt>priority_group / prio_group / group</dt>
        <dd>
          Compatibility aliases for <span class="uql-doc-inline-code">priority</span>
          . Prefer
          <span class="uql-doc-inline-code">priority = N</span>
          in new queries.
        </dd>
      </div>
    </dl>
    <p>
      Example: put your most important ranking goal in <span class="uql-doc-inline-code">
        priority = 0
      </span>
      and a secondary goal in
      <span class="uql-doc-inline-code">priority = 1</span>
      . A very strong group-1 match can never outrank a better group-0 match.
    </p>

    <p>
      <strong>Optional-white weights</strong>
      change the default score:
      <span class="uql-doc-inline-code">100 &times; different skills found + matching stars</span>
      .
    </p>
    <dl class="uql-doc-table uql-doc-table-compact">
      <div>
        <dt>type_weight</dt>
        <dd>
          Points for each different requested skill found. Default: <span
            class="uql-doc-inline-code"
          >
            100
          </span>
          . Raise it to favor variety over star level.
        </dd>
      </div>
      <div>
        <dt>level_weight</dt>
        <dd>
          Points for each star on matching factors. Default: <span class="uql-doc-inline-code">
            1
          </span>
          . Raise it to favor higher-star copies.
        </dd>
      </div>
      <div>
        <dt>match_weight</dt>
        <dd>
          Extra points for every matching factor entry, including repeated copies of the same skill.
          Default: <span class="uql-doc-inline-code">0</span>
          .
        </dd>
      </div>
      <div>
        <dt>proc_weight</dt>
        <dd>
          Extra points based on each match's estimated inheritance chance. Default: <span
            class="uql-doc-inline-code"
          >
            0
          </span>
          (disabled).
        </dd>
      </div>
      <div>
        <dt>proc_kind</dt>
        <dd>
          Chance table used by <span class="uql-doc-inline-code">proc_weight</span>
          :
          <span class="uql-doc-inline-code">2</span>
          for race,
          <span class="uql-doc-inline-code">3</span>
          for skill (default), or
          <span class="uql-doc-inline-code">4</span>
          for scenario factors.
        </dd>
      </div>
      <div>
        <dt>affinity</dt>
        <dd>
          Replace the affinity calculated for each result with one fixed value when estimating
          inheritance chance. Normally leave this unset.
        </dd>
      </div>
    </dl>

    <p>
      <strong>Lineage weights</strong>
      control how
      <span class="uql-doc-inline-code">lineage white</span>
      rewards repeated skills.
    </p>
    <dl class="uql-doc-table uql-doc-table-compact">
      <div>
        <dt>stack_weight</dt>
        <dd>
          Starting size of each matched skill's stack score. Default: <span
            class="uql-doc-inline-code"
          >
            1000
          </span>
          .
        </dd>
      </div>
      <div>
        <dt>base</dt>
        <dd>
          Growth for repeated copies of a skill. Default: <span class="uql-doc-inline-code">
            110
          </span>
          , meaning each copy multiplies that stack component by
          <span class="uql-doc-inline-code">1.10</span>
          .
        </dd>
      </div>
      <div>
        <dt>decay</dt>
        <dd>
          How much the next-best requested skill contributes. Default: <span
            class="uql-doc-inline-code"
          >
            50
          </span>
          : best skill gets full stack value, second gets half, third gets one quarter.
        </dd>
      </div>
      <div>
        <dt>occurrence_weight</dt>
        <dd>
          Flat extra points for every matching copy, separate from the stack calculation. Default: <span
            class="uql-doc-inline-code"
          >
            0
          </span>
          .
        </dd>
      </div>
      <div>
        <dt>weight</dt>
        <dd>
          Multiply the final score from this ranking function. Default: <span
            class="uql-doc-inline-code"
          >
            1
          </span>
          . It works with both optional-white and lineage scoring.
        </dd>
      </div>
    </dl>

    <p>
      <strong>Raw helpers</strong>
      are the backend forms used by the readable syntax.
    </p>
    <dl class="uql-doc-table uql-doc-table-compact">
      <div>
        <dt>support_card / has_support_card</dt>
        <dd>
          Raw support-card functions. Accepted keys: <span class="uql-doc-inline-code">id</span>
          ,
          <span class="uql-doc-inline-code">card_id</span>
          ,
          <span class="uql-doc-inline-code">support_card_id</span>
          ,
          <span class="uql-doc-inline-code">lb</span>
          ,
          <span class="uql-doc-inline-code">limitbreak</span>
          ,
          <span class="uql-doc-inline-code">limit_break</span>
          ,
          <span class="uql-doc-inline-code">limit_break_count</span>
          ,
          <span class="uql-doc-inline-code">exp</span>
          , and
          <span class="uql-doc-inline-code">experience</span>
          .
        </dd>
      </div>
      <div>
        <dt>contains / has / any / overlaps / has_all / contains_all / all</dt>
        <dd>
          Accepted backend-style collection functions. The readable operators above are preferred.
        </dd>
      </div>
    </dl>
    <p class="uql-doc-note">
      <span>
        <Icon
          name="info"
          size={16}
        />
      </span>
      <span>
        <span class="uql-doc-inline-code">optional white</span>
        requires at least one listed match.
        <span class="uql-doc-inline-code">lineage white</span>
        only changes order. To require every listed skill, use a normal
        <span class="uql-doc-inline-code">has all</span>
        predicate.
      </span>
    </p>
  </div>
</section>
