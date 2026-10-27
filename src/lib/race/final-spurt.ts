/** Earliest spurt opportunity; a runner's actual start depends on her remaining HP. */
export function finalSpurtSection(distance: number) {
  return {
    start: (distance * 2) / 3,
    end: distance,
    label: 'Final spurt window',
    color: '#dfba72'
  };
}

export const FINAL_SPURT_HELP =
  'Final spurt can begin at the start of late race (two thirds of the course). Each runner’s actual start depends on her remaining HP.';
