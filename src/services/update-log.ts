import type { IconName } from '@/components/icon-types';

export interface ChangeItem {
    text: string;
    link?: string; // Internal route link
}
export interface ChangeCategory {
    category: 'major' | 'improvement' | 'minor' | 'bugfix';
    label: string;
    icon?: IconName;
    items: ChangeItem[];
    betaOnly?: boolean;
}
export interface UpdateEntry {
    title: string;
    date?: string;
    version?: string;
    summary?: string;
    categories: ChangeCategory[];
}
// Define your updates here - newest first
export const UPDATE_LOG: UpdateEntry[] = [
  {
    title: 'Usability update',
    date: '2026-09-30',
    categories: [
      {
        category: 'major', label: 'Pull plans & actual results', icon: 'diamond',
        items: [
          { text: 'Save notes for each banner, with a preview below its details.', link: '/timeline?tab=carat-planner' },
          { text: 'Record actual pulls and copies, compare them with your plan, and carry savings or extra spending into future balances.' },
          { text: 'See goals met and copies still needed, including planned Uncap Crystals. Odds remain available for comparison.' },
          { text: 'Notes and results save automatically and travel with saved, synced, shared and exported plans. Clear actual pulls to return to your planned budget.' }
        ]
      },
      {
        category: 'improvement', label: 'Income & ticket planning', icon: 'paid',
        items: [
          { text: 'Choose monthly ticket exchanges separately: Friend Points, Clovers, and Silver, Gold or Rainbow Cleats. Each shows its tickets and exchange cost.', link: '/timeline?tab=carat-planner' },
          { text: 'See projected Carats, tickets, shards and Uncap Crystals through your last planned pull, or a 30-day preview before adding banners.' },
          { text: 'Team Trials Classes 3.5, 4.5 and 5.5 model alternating promotion and demotion rewards, with weekly averages.' },
          { text: 'Duplicate Daily Carat Pack entries now count only once, preserving your saved selection.' }
        ]
      },
      {
        category: 'improvement', label: 'Spark filters', icon: 'search',
        items: [
          { text: 'Set separate star and parent-occurrence ranges for the full lineage. Switching between them keeps both limits, including after reload.', link: '/database' },
          { text: 'Main-parent filters use star ranges and combine requirements with AND/OR. UQL also supports lineage occurrence counts, such as Groundwork = 3x.' },
          { text: 'More compact filter rows, preferred and lineage white-factor controls, and smaller star/occurrence icons.' }
        ]
      },
      {
        category: 'improvement', label: 'Parent picker', icon: 'lineage',
        items: [{ text: 'Find bookmarked and saved partner parents by trainer username as well as Uma name.', link: '/tools/lineage-planner' }]
      },
      {
        category: 'improvement', label: 'Timeline', icon: 'timeline',
        items: [
          { text: 'Smoother scrolling and date navigation, with fewer jumps as vertical Timeline rows and artwork load.', link: '/timeline' },
          { text: 'Consistent mouse-wheel and drag scrolling over cards and pickups. Hold Shift to scroll vertically in the horizontal view.' }
        ]
      },
      {
        category: 'bugfix', label: 'Layout & wording', icon: 'check',
        items: [
          { text: 'Tighter pull-plan breakpoints and compact mobile Notes/Results buttons beside banner details.' },
          { text: 'Dialogs now center vertically by default, including the notes and results editors.' },
          { text: 'Updated navigation badges highlight the changed sections on desktop and mobile.' },
          { text: 'Remaining “jewels” labels now say “Carats.”' }
        ]
      }
    ]
  },
  {
    title: 'uma.moe 2.0',
    version: '2.0',
    date: '2026-09-18',
     summary: 'Rebuilt in Svelte for a lighter app, clearer tools, and a better experience on every screen.',
    categories: [
      {
        category: 'major', label: 'Rebuilt for performance', icon: 'gauge',
        items: [
          { text: 'Moved from Angular to Svelte. Pages and heavier tools now load on demand.' },
          { text: 'A consistent design, from phone to widescreen.' }
        ]
      },
      {
        category: 'improvement', label: 'Veterans & search', icon: 'veterans',
        items: [
          { text: 'Compact veteran cards, clearer comparisons, and target Uma affinity.', link: '/veterans' },
          { text: 'Refined filters with live UQL results as you type.', link: '/veterans' }
        ]
      },
      {
        category: 'improvement', label: 'Lineage & planning', icon: 'lineage',
        items: [
          { text: 'Pick parents and follow affinity through your lineage.', link: '/tools/lineage-planner' },
          { text: 'A refined Timeline and more room in the Carat Planner.', link: '/timeline' }
        ]
      }
    ]
  },
  {
    title: 'Carat Planner Accuracy and Sync',
    date: '2026-08-20',
    categories: [
      {
        category: 'major',
        label: 'More Accurate Planning',
        items: [
          { text: 'Completionist now selects the highest results and every optional dated reward', link: '/timeline?tab=carat-planner' },
          { text: 'Older maxed plans are migrated to Completionist and restore missing Champion\'s Meeting qualifying-round income' },
          { text: 'Reward totals now respect the selected plan start date, reward availability, and exact event settings' },
        ]
      },
      {
        category: 'improvement',
        label: 'Reward Planning',
        items: [
          { text: 'Upcoming rewards are counted automatically. Turn off only the rewards you do not expect to collect' },
          { text: 'Story Events, missions, challenges, stories, free pulls, tickets, and Uncap Crystals use sourced dated rewards' },
          { text: 'Cumulative login milestones, Valentine\'s Day, White Day, and Christmas gifts have separate planning toggles' },
          { text: 'Global, JP, news, mission, and fallback rewards are reconciled to prevent duplicate income' },
        ]
      },
      {
        category: 'improvement',
        label: 'Plan Sync and Sharing',
        items: [
          { text: 'Signed-in plans load immediately from this device, then sync compact changes across devices' },
          { text: 'Server updates are bundled and sent only when the plan actually changes' },
          { text: 'Signed-in plans use short share links. Signed-out plans use compressed self-contained links' },
        ]
      },
      {
        category: 'improvement',
        label: 'Faster Setup and Mobile',
        items: [
          { text: 'Quick presets, grouped controls, and clearer result choices make assumptions easier to configure' },
          { text: 'Manual changes are visibly tracked as edits to the selected preset' },
          { text: 'Mobile spacing, reward rows, help buttons, dropdowns, and plan controls use screen space more efficiently' },
          { text: 'Global banner settings and simple anniversary markers make long-term pull plans easier to review' },
        ]
      }
    ]
  },
  {
    title: 'August Update - Inheritance, Races & Planning',
    date: '2026-08-05',
    categories: [
      {
        category: 'major',
        label: 'Inheritance Results',
        items: [
          { text: 'Repeated sparks are grouped together and can show either total stars or the number of lineage occurrences', link: '/database' },
          { text: 'Collapse common, scenario, and race spark groups or hide unwanted sparks. Your choices are remembered' },
          { text: 'Split and combined views now show consistent inheritance chances and corrected scenario badges' },
        ]
      },
      {
        category: 'major',
        label: 'Filters & UQL',
        items: [
          { text: 'Filter common, scenario, and race whites by count or total stars for the full lineage or main parent', link: '/database' },
          { text: 'A new UQL guide explains scopes, exact three-way matching, every available property, operators, and ranking parameters', link: '/database' },
          { text: 'Training Scenario and special-spark filters now include clearer normal and upgraded choices' },
          { text: 'Switching searches no longer leaves stale UQL filters active' },
        ]
      },
      {
        category: 'improvement',
        label: 'Race Tools',
        items: [
          { text: 'Race Schedule now uses in-game race art in a denser calendar', link: '/database' },
          { text: 'Conflicting optimal races automatically move into the next available slot' },
          { text: 'Race views and history now show clearer grade, result, and cup visuals with names available on hover' },
        ]
      },
      {
        category: 'major',
        label: 'Carat Planner',
        items: [
          { text: 'Create, rename, duplicate, import, export, and switch between saved plans', link: '/timeline?tab=carat-planner' },
          { text: 'Plan multiple rate-up goals with published probabilities, exchange copies, and Rainbow or Gold Uncap Crystals' },
          { text: 'Project your balance using recurring income, upcoming rewards, free pulls, and selectable event results' },
          { text: 'A compact mobile layout makes plans, banner goals, rewards, and pull controls easier to use' },
        ]
      },
      {
        category: 'improvement',
        label: 'Timeline',
        items: [
          { text: 'Switch between horizontal and vertical timelines with compact gaps, Today, search, and event filters', link: '/timeline' },
          { text: 'Redesigned event details make rate-up odds, free pulls, rewards, races, predictions, and sources easier to scan' },
          { text: 'Improved full-screen and mobile layouts use space better, with reliable touch scrolling from interactive controls' },
        ]
      },
      {
        category: 'improvement',
        label: 'Guided Tours',
        items: [
          { text: 'New optional tours explain the redesigned Timeline, current Database workflow, and Carat Planner where available. Restart them anytime from the help button' },
        ]
      },
      {
        category: 'improvement',
        label: 'Circles',
        items: [
          { text: 'Circle pages now show live rank, tier progress, monthly navigation, and clearer club information', link: '/circles' },
          { text: 'Member progression can be explored as a chart or calendar with daily contributor breakdowns' },
          { text: 'Search members, customize visible metrics, open profiles, and export circle data' },
          { text: 'Progress averages no longer include an unfinished current day' },
        ]
      }
    ]
  },
  {
    title: 'Search & UQL Update',
    date: '2026-06-28',
    categories: [
      {
        category: 'major',
        label: 'UQL',
        items: [
          { text: 'optional white in (February S., priority = 0)', link: '/database' },
          { text: 'lineage white in (Ramp Up, priority = 2)' },
          { text: '0 is highest priority. Higher numbers tie-break later' },
          { text: 'Arithmetic: (Stamina + Power + Wit) >= 7. Wins % 2 = 0' },
          { text: 'Dirt = 0 means missing Dirt. == now works' },
          { text: 'Owned legacy: owned legacy = [] + affinity >= 150' },
        ]
      },
      {
        category: 'improvement',
        label: 'Lineage Picker',
        items: [
          { text: 'Remembers search, filters, tab/account, and sort', link: '/tools/lineage-planner' },
          { text: 'Spark, factor, scope, and star settings persist' },
          { text: 'Refresh clears memory. Other pickers open fresh' },
        ]
      },
      {
        category: 'minor',
        label: 'Borrow Search',
        items: [
          { text: 'View/copy stats shown. Trainer ID copy count updates', link: '/database' },
          { text: 'Trending sort added. It is the default only without filters' },
          { text: 'Spark-filtered searches still default to affinity' },
        ]
      },
      {
        category: 'bugfix',
        label: 'Sharing & Fixes',
        items: [
          { text: 'Prio controls for Preferred and Lineage whites', link: '/database' },
          { text: 'Advanced filters generate cleaner readable UQL' },
          { text: 'optional_white(...) links restore as readable UQL' },
          { text: 'Shared URLs keep selected legacy context safely' },
          { text: 'Manual, partner, and bookmark picks share safer' },
          { text: 'Invalid UQL highlights errors. Names handle punctuation' },
          { text: 'Owned legacy is faster and avoids hidden white filters' },
          { text: 'Manual Unknown legacy and UQL sync fixes' },
          { text: 'Bookmark refresh and GP spark highlights fixed' },
        ]
      }
    ]
  },
  {
    title: 'June Update - Search & Veteran Polish',
    date: '2026-06-01',
    categories: [
      {
        category: 'major',
        label: 'Search Updates',
        items: [
          {
            text: 'UQL and basic inheritance filters have been expanded for more precise parent searches',
            link: '/database'
          },
          {
            text: 'Owned legacy are now part of the Query and will be resolved if the link is shared',
            link: '/database'
          },
        ]
      },
      {
        category: 'improvement',
        label: 'Improvements',
        items: [
          {
            text: 'Profile and veteran data loading is more reliable',
            link: '/profile'
          },
          { text: 'Veteran displays' },
          { text: 'Skills have visually been overhauled' },
          {
            text: 'Timeline data has been updated for June events and banners',
            link: '/timeline'
          },
        ]
      },
      {
        category: 'bugfix',
        label: 'Bug Fixes',
        items: [
          { text: 'Fixed selected veterans not restoring correctly in some saved or shared filter states' },
          { text: 'Fixed stale app files after updates causing pages to fail loading for some users' },
        ]
      }
    ]
  },
  {
    title: '30.04 Update - Lineage Planner & More!',
    date: '2026-04-30',
    categories: [
      {
        category: 'major',
        label: 'New Features',
        items: [
          {
            text: 'Lineage Planner with full parent and grandparent planning',
            link: '/tools/lineage-planner'
          },
          {
            text: 'Veteran Picker! Supports veterans, Practice/Trainer ID lookups, bookmarks, and manual entry',
            link: '/tools/lineage-planner'
          },
          {
            text: 'Lineage Planner save/load/import/export support for sharing and backup',
            link: '/tools/lineage-planner'
          },
          {
            text: 'New Lineage White Factors filter for borrow optimization by depth-aware weighting',
            link: '/database'
          },
        ]
      },
      {
        category: 'improvement',
        label: 'Improvements',
        items: [
          { text: 'Inheritance database is more compact and easier to use on mobile' },
          { text: 'Lineage Planner and Veteran Picker received mobile responsiveness' },
          { text: 'Character picker now supports multiple sorting methods' },
          { text: 'Added spark proc rate displays to the database' },
          { text: 'Refreshed input styling across the site for consistent visuals' },
          { text: 'Inheritance database now supports full affinity sorting for a full lineage' },
          { text: 'Race filter now supports search-based adding' },
          { text: 'Navbar now includes a live server status indicator' },
        ]
      },
      {
        category: 'minor',
        label: 'Club Improvements',
        items: [
          {
            text: 'Club members are now searchable by both name and ID',
            link: '/circles'
          },
          {
            text: 'Trainer ID is now visible for club members',
            link: '/circles'
          },
          {
            text: 'Direct profile opening added in clubs',
            link: '/circles'
          },
          {
            text: 'Direct ID copy added to the clubs menu',
            link: '/circles'
          },
        ]
      }
    ]
  },
    {
        title: 'Lineage Planner & Inheritance Update',
        date: '2026-04-21',
        categories: [
            {
                category: 'major',
                label: 'New Features',
                items: [
                    {
                        text: 'Legacy Builder - plan full inheritance trees with parents and grandparents',
                        link: '/tools/lineage-planner'
                    },
                    {
                        text: 'Veteran Picker - pick parents from veterans, ID lookups, bookmarks, or manual entry',
                        link: '/tools/lineage-planner'
                    },
                    {
                        text: 'Bookmarks - save entries from the Inheritance Database for quick reuse',
                        link: '/database'
                    },
                ]
            },
            {
                category: 'improvement',
                label: 'Database & UI Improvements',
                items: [
                    { text: 'Spark proc rates shown for each entry' },
                    { text: 'Per-parent affinity values, not just the combined total' },
                    { text: 'Sort by true affinity for your chosen legacy' },
                    { text: 'Race filter now uses a search bar instead of dropdowns' },
                    { text: 'Live server status indicator in the navbar' },
                    { text: 'Cleaner, more mobile-friendly database layout' },
                    { text: 'Mobile layout for the Legacy Tree view' },
                    { text: 'Refreshed inputs across the site for visual consistency' },
                ]
            },
            {
                category: 'minor',
                label: 'Minor Changes',
                items: [
                    {
                        text: 'Search clubs by user ID or name',
                        link: '/circles'
                    },
                    { text: 'User ID shown beneath club member names for easy copying' },
                ]
            },
            {
                category: 'bugfix',
                label: 'Bug Fixes',
                items: [
                    { text: 'Fixed login issues' },
                ]
            }
        ]
    },
    {
        title: '🐴 Easter Update 🐇 Part 1',
        date: '2026-04-01',
        categories: [
            {
                category: 'major',
                label: 'Major Changes',
                items: [
                    { text: 'User logins - sign in to save and sync your data' },
                    {
                        text: 'Profile page - view your trainer stats, veterans, and more',
                        link: '/profile'
                    },
                    {
                        text: 'Veteran browser - browse, filter, and inspect your trained characters',
                        link: '/profile'
                    },
                ]
            },
            {
                category: 'improvement',
                label: 'Improvements',
                items: [
                    { text: 'Search for parents with specific run races in the inheritance database' },
                    {
                        text: 'Spark splitting - click a parent to view their individual sparks',
                        link: '/database'
                    },
                ]
            },
            {
                category: 'minor',
                label: 'Minor Changes',
                items: [
                    { text: 'Infinite scroll replaces pagination in the veteran browser' },
                    { text: 'Updated rank badge color scheme' },
                    { text: 'Consistent race grade colors across all dialogs' },
                    { text: 'Added export instructions for veteran data upload' },
                    { text: 'Various layout and styling improvements' },
                ]
            },
        ]
    },
    {
        title: 'Timeline Improvements & Predictions',
        date: '2026-03-01',
        categories: [
            {
                category: 'improvement',
                label: 'Improvements',
                items: [
                    { text: 'Improved the timeline\'s prediction algorithm to provide much stabler output for future event dates based on recent official announcements.' },
                    { text: 'Added layout adjustments to better account for uneven prediction gaps like dead weeks.' }
                ]
            }
        ]
    },
    {
        title: 'February 2026 Update',
        date: '2026-02-15',
        categories: [
            {
                category: 'major',
                label: 'Major Changes',
                items: [
                    {
                        text: 'New Trainer Rankings page - monthly, all-time, and recent gain leaderboards',
                        link: '/rankings'
                    },
                ]
            },
            {
                category: 'improvement',
                label: 'Improvements',
                items: [
                    {
                        text: 'Added include/exclude character filters for main parents and grandparents',
                        link: '/database'
                    },
                    { text: 'Adjusted selection dialogs to match site design' },
                    { text: 'Improved mobile responsive layout for inheritance filters' },
                    {
                        text: 'Circle calendar view, daily gain graph, and row display mode',
                        link: '/circles'
                    },
                ]
            },
            {
                category: 'minor',
                label: 'Minor Changes',
                items: [
                    { text: 'Rankings support sorting by various metrics across all-time and recent gains tabs' },
                    { text: 'Rankings show circle affiliation with link to club page' },
                    { text: 'Responsive mobile layout with compact number formatting for rankings' },
                    { text: 'Include prior circle fans in progression data' },
                    {
                        text: 'Max followers indicator in inheritance database',
                        link: '/database'
                    },
                ]
            },
        ]
    },
    {
        title: 'January 2026 Update',
        date: '2026-01-04',
        categories: [
            {
                category: 'major',
                label: 'Major Changes',
                items: [
                    {
                        text: 'New statistic for Team Trials, including new filters for scenarios',
                        link: '/tools/statistics'
                    },
                ]
            },
            {
                category: 'minor',
                label: 'Minor Changes',
                items: [
                    {
                        text: 'Added filter for total star count in inheritance',
                        link: '/database?filters=eyJic3MiOjl9'
                    },
                    { text: 'Improved active filter chip display' },
                    { text: 'Made filter UI more compact and responsive' },
                    { text: 'Improved mobile filtering for statistics page' },
                ]
            },
            {
                category: 'bugfix',
                label: 'Bug Fixes',
                items: [
                    { text: 'Fixed filter changes not updating results immediately' },
                    { text: 'Fixed number inputs only updating on blur instead whiles typing' },
                    { text: 'Fixed min white count not being saved in URL/shareable links' },
                    { text: 'Fixed main white filter chip not being removable via active filters' },
                    { text: 'Fixed active filter chips vertical alignment issues' },
                    { text: 'Fixed filter state not syncing properly between components' },
                    { text: 'Fixed min main white count filter not being applied to result count query' },
                    { text: 'Fixed result count cache returning stale counts for different filter combinations' },
                    { text: 'Fixed optional white factor filtering breaking search with non-affinity sort orders' },
                    { text: 'Fixed sort being ignored when using optional white factor scoring' },
                ]
            }
        ]
    }
];
