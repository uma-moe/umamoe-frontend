import { CmSkillDetails } from '../../champions-meeting/skills/cm-skill-details.svelte';
import type { SkillDetail } from '../../champions-meeting/cm-exploration';

/** CM Data's per-skill activation cache, filled from the session's runners instead of requests. */
export class SessionSkillDetails extends CmSkillDetails {
  constructor(values: Record<number, SkillDetail>) {
    super();
    this.values = values;
  }

  /** Every skill's detail is already present; there is nothing to request. */
  override load() {
    return Promise.resolve();
  }

  override prefetch() {}
}
