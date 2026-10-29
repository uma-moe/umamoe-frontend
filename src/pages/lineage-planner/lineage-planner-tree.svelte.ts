import {
  loadCharacters,
  loadReleasedCharacters,
  type CharacterData
} from '@/lib/game-data/characters';
import {
  applyPlannerPayload,
  BTREE_ORDER,
  emptyPlannerNodes,
  type PlannerNode,
  type PlannerPayloadNode,
  type PlannerPosition
} from '@/lib/lineage/planner';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import {
  applySuccession,
  characterImage,
  hydratePlannerNodes,
  sparksFrom
} from './lineage-planner-nodes';
import { persistPlannerTree, restoredPlannerPayload } from './lineage-planner-storage';

export class LineagePlannerTree {
  nodes = $state(emptyPlannerNodes());
  characters = $state(new Map<number, CharacterData>());
  selectableCharacters = $state<CharacterData[]>([]);
  charactersLoading = $state(false);
  charactersError = $state('');
  filledCount = $derived(
    BTREE_ORDER.filter((position) => this.nodes[position].characterId != null).length
  );

  #legacyCardIds = new Set<number>();
  #disposed = false;

  hydrate(): void {
    this.nodes = hydratePlannerNodes(this.nodes, this.characters, this.#legacyCardIds);
  }

  persist(): void {
    persistPlannerTree(this.nodes);
  }

  update(position: PlannerPosition, patch: Partial<PlannerNode>, shouldPersist = true): void {
    this.nodes = { ...this.nodes, [position]: { ...this.nodes[position], ...patch } };

    if (shouldPersist) this.persist();
  }

  apply(payload: PlannerPayloadNode[]): void {
    this.nodes = hydratePlannerNodes(
      applyPlannerPayload(payload),
      this.characters,
      this.#legacyCardIds
    );
    this.persist();
  }

  clear(): void {
    this.nodes = emptyPlannerNodes();
  }

  clearNode(position: PlannerPosition): void {
    this.nodes = { ...this.nodes, [position]: emptyPlannerNodes()[position] };

    this.persist();
  }

  restore(onwarning: (message: string) => void): void {
    const payload = restoredPlannerPayload(this.characters, this.#legacyCardIds, onwarning);
    if (payload) this.apply(payload);
  }

  async loadCharacters(): Promise<void> {
    if (this.charactersLoading) return;
    this.charactersLoading = true;
    this.charactersError = '';
    try {
      this.selectableCharacters = await loadReleasedCharacters();
      this.characters = await loadCharacters();
      if (this.#disposed) return;
      this.hydrate();
      if (this.#legacyCardIds.size) {
        this.#legacyCardIds.clear();
        this.persist();
      }
    } catch (error) {
      this.charactersError =
        error instanceof Error ? error.message : 'The character catalog could not be loaded.';
    } finally {
      this.charactersLoading = false;
    }
  }

  placeCharacter(position: PlannerPosition, entry: CharacterData): void {
    this.update(position, {
      characterId: Number(entry.id),
      name: entry.name,
      image: characterImage(entry),
      sparks: [],
      winSaddleIds: [],
      veteran: undefined,
      succession: undefined
    });
  }

  placeVeteran(
    position: PlannerPosition,
    id: number,
    entry: CharacterData | undefined,
    veteran: ProfileVeteran
  ): void {
    this.update(
      position,
      {
        characterId: id,
        name: entry?.name ?? `Character ${id}`,
        image: characterImage(entry),
        sparks: sparksFrom(veteran),
        winSaddleIds: veteran.win_saddle_id_array ?? veteran.race_results ?? [],
        veteran,
        succession: undefined
      },
      false
    );

    this.nodes = applySuccession(
      this.nodes,
      position,
      veteran.succession_chara_array ?? [],
      this.characters
    );
    this.persist();
  }

  dispose(): void {
    this.#disposed = true;
  }
}
