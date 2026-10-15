import {
  characterImagePath,
  loadReleasedCharacters,
  type CharacterData
} from '@/lib/game-data/characters';
import type { CharacterPickerSort } from '@/components/pickers/CharacterPicker.svelte';
import type { AncestorScope } from '@/lib/profile/veterans/profile-veterans';

const TARGET_KEY = 'veteran-affinity-target';

/** Released character choices for the affinity target and the include/exclude rule picker. */
export class RosterCharacters {
  #characters: () => Map<number, CharacterData>;

  targetId = $state<number>();
  loading = $state(false);
  error = $state('');
  choices = $state<CharacterData[]>([]);
  targetOpen = $state(false);
  targetSort = $state<CharacterPickerSort>('default');

  umaOpen = $state(false);
  umaScope = $state<AncestorScope>('parent');
  umaMode = $state<'include' | 'exclude'>('include');
  umaDraft = $state<string[]>([]);
  umaSort = $state<CharacterPickerSort>('default');

  target = $derived.by(() => (this.targetId ? this.#characters().get(this.targetId) : undefined));
  options = $derived(
    (this.choices.length ? this.choices : this.target ? [this.target] : []).map((character) => ({
      ...character,
      image: characterImagePath(Number(character.id))
    }))
  );

  constructor(characters: () => Map<number, CharacterData>) {
    this.#characters = characters;
  }

  async load() {
    if (this.choices.length || this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      this.choices = await loadReleasedCharacters();
    } catch {
      this.error = 'Target characters could not be loaded.';
    } finally {
      this.loading = false;
    }
  }

  selectTarget(value: string) {
    this.targetId = Number(value) || undefined;
    this.targetOpen = false;
    try {
      if (this.targetId) localStorage.setItem(TARGET_KEY, String(this.targetId));
      else localStorage.removeItem(TARGET_KEY);
    } catch {
      /* Keep the current selection when storage is unavailable. */
    }
  }

  restoreTarget() {
    try {
      const saved = Number(localStorage.getItem(TARGET_KEY));
      if (this.#characters().has(saved)) this.targetId = saved;
    } catch {
      /* Target selection is optional. */
    }
  }

  pickTarget() {
    this.targetSort = 'default';
    this.targetOpen = true;
    void this.load();
  }

  editUmas(scope: AncestorScope, mode: 'include' | 'exclude'): void {
    this.umaScope = scope;
    this.umaMode = mode;
    this.umaDraft = [];
    this.umaSort = 'default';
    this.umaOpen = true;
    void this.load();
  }
}
