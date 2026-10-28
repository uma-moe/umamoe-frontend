import {
  skillStyles,
  type SkillBuckets,
  type SkillOverview,
  type SkillDetail,
  type SkillOverviewRow
} from '../cm-exploration';

export type BucketRange = { start: number; end: number };
export type SkillCohortCell = { entries: number; wins: number; teamWins?: number };
export type SkillCohort = {
  label: string;
  variantId?: number;
  cells: Record<string, SkillCohortCell>;
  total: SkillCohortCell;
};

function validateOverviewRows(rows: SkillOverviewRow[]) {
  if (!Array.isArray(rows)) throw new Error('Skill overview rows are missing.');

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 11) throw new Error('Invalid skill overview row.');
    const [
      id,
      style,
      ,
      owned,
      active,
      ,
      repeat,
      winsActive,
      winsInactive,
      teamActive,
      teamInactive
    ] = row;
    const counts = row.slice(2);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      skillStyles[style] === undefined ||
      counts.some(
        (value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
      ) ||
      active > owned ||
      repeat > active ||
      winsActive > active ||
      teamActive > active ||
      winsInactive > owned - active ||
      teamInactive > owned - active
    ) {
      throw new Error('Invalid skill entry counts.');
    }
  }
}

export function validateSkillOverview(overview: SkillOverview) {
  validateOverviewRows(overview.rows);
  if (
    !Number.isFinite(overview.courseDistance) ||
    overview.courseDistance <= 0 ||
    !overview.allPlayerCounts ||
    typeof overview.allPlayerCounts !== 'object'
  ) {
    throw new Error('Invalid skill overview.');
  }

  for (const cell of Object.values(overview.populationByStyle ?? {})) {
    if (
      !Array.isArray(cell) ||
      cell.length < 2 ||
      cell.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      cell[1] > cell[0]
    ) {
      throw new Error('Invalid skill population counts.');
    }
  }

  for (const row of overview.rows) {
    const population = overview.populationByStyle?.[row[1]];
    if (
      population &&
      (row[3] > population[0] ||
        row[7] + row[8] > population[1] ||
        population[1] - row[7] - row[8] > population[0] - row[3])
    ) {
      throw new Error('Skill entries do not match the population.');
    }
  }
}

export function selectedStyles(styles: string[], style: string) {
  return styles.filter((key) => style === 'all' || skillStyles[key] === Number(style));
}

export function skillBucketMetrics(
  styles: SkillBuckets,
  style: string,
  range: BucketRange = { start: 0, end: 99 }
) {
  const result = { procs: 0, entries: 0, wins: 0, teamWins: 0 };

  for (const key of selectedStyles(Object.keys(styles), style)) {
    for (const [bucket, procs, entries, wins, teamWins] of styles[key] ?? []) {
      const index = Math.max(0, bucket);
      if (index < range.start || index > range.end) continue;

      result.procs += procs;
      result.entries += entries;
      result.wins += wins;
      result.teamWins += teamWins;
    }
  }

  return result;
}

export function activationTiming(bins: number[], distance: number) {
  const count = bins.reduce((sum, value) => sum + value, 0);
  if (!count) return undefined;

  let cumulative = 0;
  let median: number | undefined;
  let weighted = 0;

  bins.forEach((value, index) => {
    const midpoint = ((index + 0.5) * distance) / bins.length;
    weighted += value * midpoint;
    cumulative += value;
    if (median === undefined && cumulative >= count / 2) median = midpoint;
  });

  return { mean: weighted / count, median: median ?? 0 };
}

function cohort(label: string, cells: SkillCohort['cells'], variantId?: number): SkillCohort {
  const values = Object.values(cells);
  return {
    label,
    variantId,
    cells,
    total: {
      entries: values.reduce((sum, cell) => sum + cell.entries, 0),
      wins: values.reduce((sum, cell) => sum + cell.wins, 0),
      teamWins: values.every((cell) => cell.teamWins !== undefined)
        ? values.reduce((sum, cell) => sum + (cell.teamWins ?? 0), 0)
        : undefined
    }
  };
}

export function skillCohorts({
  overview,
  detail,
  style,
  range
}: {
  overview: SkillOverview;
  detail: SkillDetail;
  style: string;
  range?: BucketRange;
}): SkillCohort[] {
  const rows = overview.rows.filter((row) => row[0] === detail.skillId);
  const keys = selectedStyles(Object.keys(skillStyles), style);
  const cell = (row: SkillOverviewRow | undefined, inactive = false): SkillCohortCell => ({
    entries: inactive ? (row?.[3] ?? 0) - (row?.[4] ?? 0) : (row?.[4] ?? 0),
    wins: row?.[inactive ? 8 : 7] ?? 0,
    teamWins: row?.[inactive ? 10 : 9] ?? 0
  });

  const activeCells = Object.fromEntries(
    keys.map((key) => [
      key,
      range
        ? skillBucketMetrics(detail.styles, String(skillStyles[key]), range)
        : cell(rows.find((row) => row[1] === key))
    ])
  );
  const result = [cohort(overview.variants ? 'Any variant activated' : 'Activated', activeCells)];

  for (const [id, variant] of Object.entries(detail.variants ?? {})) {
    if ((overview.variants?.[detail.skillId]?.length ?? 0) < 2) continue;
    result.push(
      cohort(
        'Variant activated',
        Object.fromEntries(
          keys.map((key) => [
            key,
            range
              ? skillBucketMetrics(variant.styles, String(skillStyles[key]), range)
              : cell(variant.rows.find((row) => row[1] === key))
          ])
        ),
        Number(id)
      )
    );
  }

  // Inactive and unlearned entries have no first-activation distance to filter.
  if (range) return result;

  result.push(
    cohort(
      'Learned, not activated',
      Object.fromEntries(
        keys.map((key) => [
          key,
          cell(
            rows.find((row) => row[1] === key),
            true
          )
        ])
      )
    )
  );

  if (overview.populationByStyle) {
    const population = overview.populationByStyle;
    result.push(
      cohort(
        'No variant learned',
        Object.fromEntries(
          keys.flatMap((key) => {
            const total = population[key];
            if (!total) return [];
            const row = rows.find((row) => row[1] === key);
            return [
              [
                key,
                {
                  entries: total[0] - (row?.[3] ?? 0),
                  wins: total[1] - (row?.[7] ?? 0) - (row?.[8] ?? 0)
                }
              ]
            ];
          })
        )
      )
    );
  }

  return result;
}

export function validateSkillDetail(detail: SkillDetail) {
  const validateBuckets = (styles: SkillBuckets) => {
    if (!styles || typeof styles !== 'object')
      throw new Error('Skill activation buckets are missing.');

    for (const rows of Object.values(styles)) {
      if (!Array.isArray(rows)) throw new Error('Invalid skill activation buckets.');

      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 5)
          throw new Error('Invalid skill activation counts.');
        const [bucket, procs, entries, wins, teamWins] = row;
        if (
          !Number.isInteger(bucket) ||
          bucket < -1 ||
          bucket >= 100 ||
          [procs, entries, wins, teamWins].some(
            (value) => !Number.isSafeInteger(value) || value < 0
          ) ||
          entries > procs ||
          wins > entries ||
          teamWins > entries
        ) {
          throw new Error('Invalid skill activation counts.');
        }
      }
    }
  };

  validateBuckets(detail.styles);
  for (const variant of Object.values(detail.variants ?? {})) {
    validateBuckets(variant.styles);
    validateOverviewRows(variant.rows);
  }
}
