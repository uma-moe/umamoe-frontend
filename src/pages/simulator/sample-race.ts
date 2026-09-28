/**
 * A small, valid Monte Carlo request so the lab can send something immediately.
 *
 * Three runners on Kyoto 2200m turf. Shapes match the normalized race contract:
 * `course_id` is the loaded course, `setup` carries the race metadata, and each
 * runner needs its own gate, stats, aptitudes and skills.
 */

export const monteCarloBody = {
  input: {
    course_id: 11103,
    seed: 42,
    setup: {
      race_instance_id: 0,
      race_type: 0,
      season: 1,
      weather: 1,
      ground_condition: 1,
      start_time_type: 2
    },
    runners: [
      {
        source_input_index: 0,
        frame_order: 1,
        has_viewer_id: false,
        stats: { speed: 1200, stamina: 900, power: 1000, guts: 600, wisdom: 800 },
        running_style: 'Nige',
        motivation: 3,
        team_id: 0,
        single_mode_team_rank: 0,
        single_mode_win_count: 0,
        aptitudes: { distance: [7, 7, 7, 7], running_style: [7, 7, 7, 7], ground: [7, 7] },
        skills: []
      },
      {
        source_input_index: 1,
        frame_order: 2,
        has_viewer_id: false,
        stats: { speed: 1000, stamina: 1100, power: 900, guts: 700, wisdom: 700 },
        running_style: 'Senko',
        motivation: 3,
        team_id: 0,
        single_mode_team_rank: 0,
        single_mode_win_count: 0,
        aptitudes: { distance: [7, 7, 7, 7], running_style: [7, 7, 7, 7], ground: [7, 7] },
        skills: []
      },
      {
        source_input_index: 2,
        frame_order: 3,
        has_viewer_id: false,
        stats: { speed: 1100, stamina: 800, power: 1100, guts: 800, wisdom: 600 },
        running_style: 'Oikomi',
        motivation: 3,
        team_id: 0,
        single_mode_team_rank: 0,
        single_mode_win_count: 0,
        aptitudes: { distance: [7, 7, 7, 7], running_style: [7, 7, 7, 7], ground: [7, 7] },
        skills: []
      }
    ]
  },
  runs: 5,
  output_mode: 'results',
  output_format: 'json'
};
