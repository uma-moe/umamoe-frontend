import { onMount } from 'svelte';
import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';

/**
 * The skill catalog behind a report's names and costs. Create it while the component initialises: it loads on
 * mount and keeps the failure message, since the report's figures stay readable without names.
 */
export class ReportSkillCatalog {
  lookup = $state.raw(new Map<number, SkillData>());
  error = $state('');

  constructor(unavailableMessage: string) {
    onMount(() => {
      let active = true;
      void loadSkills()
        .then((value) => {
          if (active) this.lookup = value;
        })
        .catch((reason: unknown) => {
          if (active) this.error = reason instanceof Error ? reason.message : unavailableMessage;
        });

      return () => {
        active = false;
      };
    });
  }
}
