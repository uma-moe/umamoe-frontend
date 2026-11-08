import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
import type { SimulatorUma } from '../../../simulator-uma';
import { restoreSimulatorField } from '../../../simulator-roster.svelte';
import {
  ensureSimulatorCourses,
  simulatorCourseData,
  simulatorSession
} from '../../../simulator-session.svelte';
import type { SkillOffer } from '../skill-offers';
import {
  buildCodeConditions,
  buildCodeGoal,
  buildCodeOffers,
  buildCodeUma,
  codePage,
  sameRunner,
  type BuildCode,
  type BuildCodePage,
  type BuildCodeTab
} from './build-code';

/** What a page takes from an imported build. */
export interface BuildCodeImport {
  umas: SimulatorUma[];
  offers: SkillOffer[];
  goal: ReturnType<typeof buildCodeGoal>;
}

/** A page's handlers; a returned message is shown instead of closing. */
export interface BuildCodeHandlers {
  onimport: (value: BuildCodeImport) => string | void;
  /** Restores the whole tab from a code copied from it. */
  onrestore?: (page: BuildCodePage) => string | void;
}

/**
 * A build on its way into a page, from a code or a JSON file: what it loads there (the runners, the course and its
 * conditions, and for Build search what she can buy), and loading it.
 */
export class BuildCodeReview {
  code = $state.raw<BuildCode>();
  skills = $state.raw(new Map<number, SkillData>());
  characters = $state.raw(new Map<number, CharacterData>());
  gameDataError = $state('');

  #settings: () => { target: BuildCodeTab; restorable: boolean };

  constructor(settings: () => { target: BuildCodeTab; restorable: boolean }) {
    this.#settings = settings;
  }

  readonly course = $derived(
    this.code?.courseId ? simulatorCourseData.courses.get(Number(this.code.courseId)) : undefined
  );

  readonly conditions = $derived(buildCodeConditions(this.code?.racedef));

  /** The whole tab, when the code was copied from this one and the tab can take it back. */
  readonly page = $derived.by(() => {
    const { target, restorable } = this.#settings();
    return this.code && restorable ? codePage(this.code, target) : undefined;
  });

  /** The race field a whole race tab holds, or why it can't be read. */
  readonly field = $derived.by(() => {
    if (this.page?.tab !== 'race') return undefined;

    try {
      return { umas: restoreSimulatorField(this.page).umas, error: '' };
    } catch (reason) {
      return {
        umas: [],
        error: reason instanceof Error ? reason.message : 'The race field can’t be read.'
      };
    }
  });

  readonly goal = $derived(this.code ? buildCodeGoal(this.code) : {});

  readonly runners = $derived.by(() => {
    const code = this.code;
    if (!code) return [];
    if (this.field) return this.field.umas.map((uma) => ({ uma, dropped: 0 }));

    const list = [code.uma1, code.uma2].filter((runner) => runner != null);
    const takesBoth = this.#settings().target === 'race' && !sameRunner(code.uma1, code.uma2);
    const wanted = takesBoth ? list : list.slice(0, 1);
    return wanted.map((runner) => {
      const card = Number(runner.outfitId);
      return buildCodeUma(runner, {
        name: this.characters.get(card)?.name ?? (card ? 'Uma ' + card : 'Imported runner'),
        course: this.course,
        knownSkill: this.#known
      });
    });
  });

  readonly offers = $derived.by(() => {
    const runner = this.runners[0];
    if (this.#settings().target !== 'build' || !this.code || !runner) return [];

    const owned = runner.uma.skills.map((skill) => skill.skillId);
    return buildCodeOffers(this.code, owned, this.#known);
  });

  readonly ready = $derived(this.code !== undefined && this.runners.length > 0);

  #known = (id: number) => !this.skills.size || this.skills.has(id);

  /** Loads the skill and character names the preview shows; returns the cleanup that drops late answers. */
  loadGameData(): () => void {
    let active = true;
    this.gameDataError = '';
    void ensureSimulatorCourses();
    void loadSkills()
      .then((value) => {
        if (active) this.skills = value;
      })
      .catch((reason: unknown) => {
        if (active)
          this.gameDataError =
            reason instanceof Error ? reason.message : 'Skill names could not be loaded.';
      });

    void loadCharacters()
      .then((value) => {
        if (active) this.characters = value;
      })
      .catch((reason: unknown) => {
        if (active)
          this.gameDataError =
            reason instanceof Error ? reason.message : 'Character names could not be loaded.';
      });

    return () => {
      active = false;
    };
  }

  /** Loads the build into the page; returns why the page can't take it. */
  apply({ onimport, onrestore }: BuildCodeHandlers): string | undefined {
    if (!this.ready) return undefined;

    // The course first, so the page counts her skills for it; put back if the page can't take the runners.
    const before = {
      courseId: simulatorSession.courseId,
      ground: simulatorSession.ground,
      weather: simulatorSession.weather,
      season: simulatorSession.season,
      startTime: simulatorSession.startTime
    };

    const { course, conditions } = this;
    if (course) {
      simulatorSession.courseId = String(course.course_id);
      if (conditions.ground) simulatorSession.ground = conditions.ground;
      if (conditions.weather) simulatorSession.weather = conditions.weather;
      if (conditions.season) simulatorSession.season = conditions.season;
      if (conditions.startTime) simulatorSession.startTime = conditions.startTime;
    }

    const message =
      this.page && onrestore
        ? onrestore(this.page)
        : onimport({
            umas: this.runners.map((runner) => runner.uma),
            offers: this.offers,
            goal: this.goal
          });
    if (!message) return undefined;

    Object.assign(simulatorSession, before);
    return message;
  }
}
