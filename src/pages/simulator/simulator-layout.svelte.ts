/**
 * Sidebar state for the simulator shell.
 *
 * Stamina, Race sim and Build search share one shell, so the panel the reader
 * left open and whether the sidebar is collapsed have to outlive a single page.
 * Stored locally so a reload lands where they left off.
 *
 * `collapsed` means the desktop icon rail on wide screens and the closed bottom
 * sheet on phones — the same flag, interpreted per form factor.
 */

/** Panels the shell can show. Stored values are checked against this list on load. */
export const SIMULATOR_PANEL_IDS = ['trainee', 'modifiers', 'field', 'search', 'access'] as const;

export type SimulatorPanelId = (typeof SIMULATOR_PANEL_IDS)[number];

export interface SimulatorLayoutState {
  /** Panel the reader last chose; a mode that does not offer it falls back to its first. */
  panel: SimulatorPanelId;
  collapsed: boolean;
}

const STORAGE_KEY = 'uma.simulator.layout';

const isSimulatorPanelId = (value: unknown): value is SimulatorPanelId =>
  SIMULATOR_PANEL_IDS.some((id) => id === value);

function readLayout(): SimulatorLayoutState {
  const fallback: SimulatorLayoutState = { panel: 'trainee', collapsed: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Partial<SimulatorLayoutState>;
    return {
      panel: isSimulatorPanelId(stored.panel) ? stored.panel : fallback.panel,
      collapsed: typeof stored.collapsed === 'boolean' ? stored.collapsed : fallback.collapsed
    };
  } catch {
    // Unreadable storage is not worth failing a page over; defaults are usable.
    return fallback;
  }
}

export const simulatorLayout = $state<SimulatorLayoutState>(readLayout());

function persistLayout(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ panel: simulatorLayout.panel, collapsed: simulatorLayout.collapsed })
    );
  } catch {
    // Storage can be blocked; the shell still works from memory.
  }
}

/** Opens a panel. Choosing a tab always reveals it, so it is also the "expand" action. */
export function openSimulatorPanel(panel: SimulatorPanelId): void {
  simulatorLayout.panel = panel;
  simulatorLayout.collapsed = false;
  persistLayout();
}

export function setSimulatorSidebarCollapsed(collapsed: boolean): void {
  simulatorLayout.collapsed = collapsed;
  persistLayout();
}
