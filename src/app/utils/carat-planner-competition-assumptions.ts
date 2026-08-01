import { PlannerCurrency } from '../models/carat-planner.model';

export interface PlannerCompetitionAssumptionOption {
  value: string;
  label: string;
  amounts: Readonly<Partial<Record<PlannerCurrency, number>>>;
}

export interface PlannerCompetitionAssumptionGroup {
  id: string;
  label: string;
  eventType: 'champions_meeting' | 'league_of_heroes';
  icon: string;
  scheduleLabel: string;
  options: readonly PlannerCompetitionAssumptionOption[];
}

function outcome(
  value: string,
  label: string,
  carats: number,
  totalTickets: number,
): PlannerCompetitionAssumptionOption {
  const ticketsPerBanner = Math.floor(totalTickets / 2);
  return {
    value,
    label,
    amounts: {
      free_jewels: carats,
      uma_ticket: ticketsPerBanner,
      support_ticket: ticketsPerBanner,
    },
  };
}

/**
 * Performance assumptions from Henry Handsome Derby's 5.5 calculator.
 * Ticket totals in that sheet are the combined trainee + support tickets,
 * so each even total is split equally between the two banner-specific pools.
 */
export const PLANNER_COMPETITION_ASSUMPTION_GROUPS: readonly PlannerCompetitionAssumptionGroup[] = [
  {
    id: 'champions_meeting_result',
    label: "Champion's Meeting",
    eventType: 'champions_meeting',
    icon: 'emoji_events',
    scheduleLabel: 'Each matching event',
    options: [
      outcome('champion', 'Champion', 3300, 10),
      outcome('second', 'Second', 2400, 8),
      outcome('third', 'Third', 1600, 6),
      outcome('group_b_first', 'Group B 1st', 1800, 6),
      outcome('group_b_second', 'Group B 2nd', 1250, 4),
      outcome('group_b_third', 'Group B 3rd', 1000, 2),
      outcome('open_first', 'Open League 1st', 1500, 6),
      outcome('open_second', 'Open League 2nd', 1250, 4),
      outcome('open_third', 'Open League 3rd', 1000, 2),
    ],
  },
  {
    id: 'league_of_heroes_rank',
    label: 'League of Heroes',
    eventType: 'league_of_heroes',
    icon: 'military_tech',
    scheduleLabel: 'Each matching event',
    options: [
      outcome('platinum_4', 'Platinum 4', 3300, 4),
      outcome('platinum_3', 'Platinum 3', 2800, 4),
      outcome('platinum_2', 'Platinum 2', 2300, 4),
      outcome('platinum_1', 'Platinum 1', 1800, 4),
      outcome('gold_4', 'Gold 4', 1300, 4),
      outcome('gold_3', 'Gold 3', 1000, 2),
      outcome('gold_2', 'Gold 2', 700, 2),
      outcome('gold_1', 'Gold 1', 550, 0),
      outcome('silver_4', 'Silver 4', 400, 0),
    ],
  },
] as const;

export function plannerCompetitionAssumptionGroup(
  groupId: string,
): PlannerCompetitionAssumptionGroup | undefined {
  return PLANNER_COMPETITION_ASSUMPTION_GROUPS.find(group => group.id === groupId);
}
