/** Small weighted ridge regressions, for the Skill Explorer's statline and win-rate fits. */

/** Solves `matrix · x = vector` by Gauss–Jordan elimination with partial pivoting; an unresolved term reads 0. */
function solve(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]!]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    }

    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const lead = rows[column]![column]!;
    if (Math.abs(lead) < 1e-12) continue;

    for (let row = 0; row < size; row++) {
      if (row === column) continue;

      const factor = rows[row]![column]! / lead;
      for (let k = column; k <= size; k++) rows[row]![k]! -= factor * rows[column]![k]!;
    }
  }

  return rows.map((row, index) => {
    const lead = row[index]!;
    return Math.abs(lead) < 1e-12 ? 0 : row[size]! / lead;
  });
}

export interface Observation {
  features: number[];
  target: number;
  /** Relative weight; 1 when every observation counts alike. */
  weight?: number;
}

/**
 * Coefficients minimising Σ weight·(target − features·β)² + ridge·|β|². A light ridge keeps a feature the
 * observations cannot tell apart at zero instead of letting it swing.
 */
export function ridgeRegression(
  observations: Observation[],
  width: number,
  ridge: number
): number[] {
  const gram = Array.from({ length: width }, (_, row) =>
    Array.from({ length: width }, (_, column) => (row === column ? ridge : 0))
  );
  const moment = new Array<number>(width).fill(0);
  for (const { features, target, weight = 1 } of observations) {
    for (let row = 0; row < width; row++) {
      const weighted = weight * features[row]!;
      moment[row]! += weighted * target;
      for (let column = 0; column < width; column++)
        gram[row]![column]! += weighted * features[column]!;
    }
  }

  return solve(gram, moment);
}

export function predict(coefficients: number[], features: number[]): number {
  return coefficients.reduce((sum, weight, index) => sum + weight * features[index]!, 0);
}
