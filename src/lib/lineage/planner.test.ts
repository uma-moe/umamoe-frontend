import { describe, expect, it, vi } from 'vitest';
import { plannerAffinityBreakdown, plannerAffinityFlows } from './planner';
import {
  applyPlannerPayload,
  buildPlannerPayload,
  buildShareState,
  calculatePlannerAffinity,
  emptyPlannerNodes,
  parsePlannerPayload,
  parsePlannerTransfer,
  plannerSparkChance,
  plannerSkillSparks,
  plannerNodeAffinity,
  plannerExcludedCharacters,
  canPlacePlannerCharacter,
  plannerCharacterAffinity,
  type PlannerPosition
} from './planner';

describe('Angular lineage planner compatibility', () => {
  it('counts only skill factors on parents and grandparents for training creation odds', () => {
    const nodes = emptyPlannerNodes();
    const skill = { factorId: 20001, name: 'Corner Recovery', type: 3, level: 2 };

    nodes.target.sparks = nodes['p1-1-1'].sparks = [skill];
    nodes.p1.sparks = [skill, { ...skill, factorId: 30001, type: 4 }];
    nodes['p2-1'].sparks = [
      { ...skill, level: 1 },
      { ...skill, factorId: 20002, name: 'Other skill' }
    ];

    expect(plannerSkillSparks(nodes)).toEqual([
      {
        factorId: 20001,
        name: 'Corner Recovery',
        count: 2,
        learned: 24.2,
        upgraded: 30.25,
        gold: 48.4
      },
      { factorId: 20002, name: 'Other skill', count: 1, learned: 22, upgraded: 27.5, gold: 44 }
    ]);

    expect(plannerSkillSparks(emptyPlannerNodes())).toEqual([]);
  });

  it('enforces the Angular slot exclusions across outfits and legacy base IDs for all 15 slots', () => {
    const nodes = emptyPlannerNodes();
    Object.values(nodes).forEach((node, index) => (node.characterId = (1001 + index) * 100 + 1));
    const expected: Record<PlannerPosition, PlannerPosition[]> = {
      target: ['p1', 'p2'],
      p1: ['target', 'p2', 'p1-1', 'p1-2'],
      p2: ['target', 'p1', 'p2-1', 'p2-2'],
      'p1-1': ['p1', 'p1-2', 'p1-1-1', 'p1-1-2'],
      'p1-2': ['p1', 'p1-1', 'p1-2-1', 'p1-2-2'],
      'p2-1': ['p2', 'p2-2', 'p2-1-1', 'p2-1-2'],
      'p2-2': ['p2', 'p2-1', 'p2-2-1', 'p2-2-2'],
      'p1-1-1': ['p1-1', 'p1-1-2'],
      'p1-1-2': ['p1-1', 'p1-1-1'],
      'p1-2-1': ['p1-2', 'p1-2-2'],
      'p1-2-2': ['p1-2', 'p1-2-1'],
      'p2-1-1': ['p2-1', 'p2-1-2'],
      'p2-1-2': ['p2-1', 'p2-1-1'],
      'p2-2-1': ['p2-2', 'p2-2-2'],
      'p2-2-2': ['p2-2', 'p2-2-1']
    };

    for (const [position, conflicts] of Object.entries(expected)) {
      expect(plannerExcludedCharacters(nodes, position as PlannerPosition)).toEqual(
        new Set(conflicts.map((conflict) => Math.floor(nodes[conflict].characterId! / 100)))
      );
      for (const conflict of conflicts) {
        expect(
          canPlacePlannerCharacter(
            nodes,
            position as PlannerPosition,
            nodes[conflict].characterId! + 1
          )
        ).toBe(false);
        expect(
          canPlacePlannerCharacter(
            nodes,
            position as PlannerPosition,
            Math.floor(nodes[conflict].characterId! / 100)
          )
        ).toBe(false);
      }

      expect(
        canPlacePlannerCharacter(
          nodes,
          position as PlannerPosition,
          nodes[position as PlannerPosition].characterId!
        )
      ).toBe(true);
    }

    expect(canPlacePlannerCharacter(nodes, 'p1-1', nodes.target.characterId!)).toBe(true);
  });

  it('scores trial characters without mutating the tree or retaining the old slot race bonus', () => {
    const nodes = emptyPlannerNodes();
    nodes.p1.winSaddleIds = nodes.p2.winSaddleIds = nodes['p1-1'].winSaddleIds = [1];
    const engine = { ready: true, pair: () => 2, triple: () => 3 } as never;
    const groups = new Map([[1, 100]]);
    expect(plannerCharacterAffinity(engine, nodes, 'target', 100101, groups)).toBe(24);
    expect(plannerCharacterAffinity(engine, nodes, 'p1', 100101, groups)).toBe(10);
    expect(plannerCharacterAffinity(engine, nodes, 'p2', 100101, groups)).toBe(10);
    expect(plannerCharacterAffinity(engine, nodes, 'p1-1', 100101, groups)).toBe(3);
    expect(plannerCharacterAffinity(engine, nodes, 'p1-1-1', 100101, groups)).toBeUndefined();
    expect(plannerCharacterAffinity(undefined, nodes, 'p1', 100101, groups)).toBeUndefined();
    expect(nodes.p1.winSaddleIds).toEqual([1]);
    expect(nodes.p1.characterId).toBeNull();
  });

  it('keeps the exact 15-position breadth-first tree order in storage', () => {
    const nodes = emptyPlannerNodes();
    nodes.target.characterId = 100101;
    nodes['p2-2-2'].characterId = 101101;
    expect(buildPlannerPayload(nodes).map((entry) => entry.position)).toEqual(['target', 'p2-2-2']);
    expect(Object.keys(applyPlannerPayload(buildPlannerPayload(nodes)))).toHaveLength(15);
  });

  it('accepts Angular bare arrays and versioned export envelopes', () => {
    const payload = [{ position: 'p1', characterId: 100101, sparks: [], manualWinSaddleIds: [] }];
    expect(parsePlannerPayload(payload)?.[0]?.position).toBe('p1');
    expect(parsePlannerPayload({ version: 1, payload })?.[0]?.characterId).toBe(100101);
  });

  it('rejects malformed imports as a whole instead of silently clearing or partially replacing a tree', () => {
    const valid = { position: 'target', characterId: 100101, sparks: [], manualWinSaddleIds: [] };

    for (const invalid of [
      null,
      1,
      {},
      { ...valid, position: 'unknown' },
      { ...valid, characterId: -1 },
      { ...valid, characterId: true },
      { ...valid, characterId: 'invalid' }
    ]) {
      expect(parsePlannerPayload([invalid])).toBeNull();
      expect(parsePlannerPayload([valid, invalid])).toBeNull();
    }

    expect(parsePlannerPayload([valid, valid])).toBeNull();
    expect(parsePlannerPayload([{ ...valid, characterId: null }])?.[0]?.characterId).toBeNull();
    expect(parsePlannerPayload([{ ...valid, characterId: '100101' }])?.[0]?.characterId).toBe(
      100101
    );

    expect(parsePlannerPayload([])).toEqual([]);
  });

  it('calculates the same additive parent, triple, shared, and race terms', () => {
    const nodes = emptyPlannerNodes();
    for (const [position, id] of Object.entries({
      target: 100101,
      p1: 100201,
      p2: 100301,
      'p1-1': 100401,
      'p1-2': 100501,
      'p2-1': 100601,
      'p2-2': 100701
    }))
      nodes[position as keyof typeof nodes].characterId = id;
    nodes.p1.winSaddleIds = [1, 3, 99];
    nodes.p2.winSaddleIds = [2, 99];
    nodes['p1-1'].winSaddleIds = [2];
    const engine = { ready: true, pair: vi.fn(() => 2), triple: vi.fn(() => 3) } as never;
    const affinity = calculatePlannerAffinity(
      engine,
      nodes,
      new Map([
        [1, 100],
        [2, 100],
        [3, 100]
      ])
    );

    expect(affinity).toMatchObject({
      relationTotal: 18,
      race: { parentPair: 3, p1Left: 3 },
      total: 24
    });

    expect(plannerNodeAffinity(affinity, 'p1')).toBe(16);
    expect(plannerNodeAffinity(affinity, 'p2')).toBe(13);
    expect(plannerAffinityBreakdown(affinity, 'p1')).toEqual({ base: 10, race: 6, total: 16 });
    const flows = plannerAffinityFlows(affinity)!;
    expect(flows).toEqual({ p1: 11, p2: 8, shared: 5 });
    expect(flows.p1 + flows.p2 + flows.shared).toBe(affinity!.total);
    expect(plannerAffinityBreakdown(affinity, 'p1-1-1')).toEqual({ base: 0, race: 0, total: 0 });
    expect(plannerAffinityBreakdown(null, 'target')).toBeNull();
    expect(plannerAffinityFlows(null)).toBeNull();
  });

  it('uses the Angular two-roll display rule', () => {
    expect(plannerSparkChance({ factorId: 1, name: 'Speed', type: 0, level: 1 }, 0, false)).toBe(
      70
    );

    expect(plannerSparkChance({ factorId: 1, name: 'Speed', type: 0, level: 1 }, 0, true)).toBe(91);
  });

  it('does not create a share state for an empty tree', () =>
    expect(buildShareState(emptyPlannerNodes())).toBeNull());
  it('consumes both Angular and normalized Database planner records', () => {
    const angular = parsePlannerTransfer({
      targetCharaId: 100101,
      record: {
        main_parent_id: 100201,
        main_blue_factors: 101,
        main_white_factors: [202161],
        main_win_saddles: [7],
        parent_left_id: 100301
      }
    });

    expect(angular?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 'target', characterId: 100101 }),
        expect.objectContaining({ position: 'p1', characterId: 100201, manualWinSaddleIds: [7] }),
        expect.objectContaining({ position: 'p1-1', characterId: 100301 })
      ])
    );

    const normalized = parsePlannerTransfer({
      record: { mainParentId: 100201, mainBlue: 101, leftParentId: 100301, leftWhite: [202161] }
    });

    expect(normalized?.payload.map((entry) => entry.position)).toEqual(['p1', 'p1-1']);
  });

  it('maps local Veteran parents into the selected planner branch', () => {
    const transfer = parsePlannerTransfer(
      {
        veteranPosition: 'p2',
        veteran: {
          cardId: 100201,
          factors: [{ id: 10, level: 3 }],
          parents: [{ positionId: 10, cardId: 100301, factors: [{ id: 20, level: 2 }] }]
        }
      },
      'profile'
    );

    expect(transfer?.source).toBe('profile');
    expect(transfer?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 'p2', characterId: 100201 }),
        expect.objectContaining({ position: 'p2-1', characterId: 100301 })
      ])
    );
  });
});
