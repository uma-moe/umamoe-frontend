import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
// Increment this number whenever you want to show the update notification again
export const CURRENT_UPDATE_VERSION = 14;
export interface ChangeItem {
    text: string;
    link?: string; // Internal route link
}
export interface ChangeCategory {
    category: 'major' | 'improvement' | 'minor' | 'bugfix';
    label: string;
    icon: string;
    color: string;
    items: ChangeItem[];
    betaOnly?: boolean;
}
export interface UpdateEntry {
    title: string;
    date?: string;
    categories: ChangeCategory[];
}
// Define your updates here - newest first
export const UPDATE_LOG: UpdateEntry[] = [
  {
    title: 'Carat Planner: Sync, Sharing, and Rewards',
    date: '2026-08-19',
    categories: [
      {
        category: 'major',
        label: 'Plans Across Devices',
        icon: 'cloud_done',
        color: '#42a5f5',
        items: [
          { text: 'Signed-in plans and settings now sync across devices and use short plan links for sharing', link: '/timeline?tab=carat-planner' },
          { text: 'Signed-out users can share a compact self-contained link. Opening either type adds a separate copy without changing the original plan' },
        ]
      },
      {
        category: 'improvement',
        label: 'Reward Planning',
        icon: 'redeem',
        color: '#ec407a',
        items: [
          { text: 'Upcoming rewards are counted automatically. Turn off only the rewards you do not expect to collect' },
          { text: 'Event rewards, free pulls, tickets, Carats, and availability windows are grouped into a clearer schedule' },
          { text: 'Cumulative login milestones and JP-parity seasonal gifts now have separate planning toggles' },
        ]
      },
      {
        category: 'improvement',
        label: 'Faster Setup',
        icon: 'tune',
        color: '#7e57c2',
        items: [
          { text: 'Quick presets, grouped toggles, and clearer result choices make income assumptions easier to configure' },
          { text: 'Global banner settings and anniversary markers make long-term pull plans easier to review' },
        ]
      },
      {
        category: 'bugfix',
        label: 'Projection Accuracy',
        icon: 'verified',
        color: '#4caf50',
        items: [
          { text: 'Global, JP, news, mission, and fallback rewards are reconciled to avoid duplicate income' },
          { text: 'Crystal shards, completed Uncap Crystals, crafted balances, and reward dates are projected separately' },
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
        icon: 'auto_awesome',
        color: '#64b5f6',
        items: [
          { text: 'Repeated sparks are grouped together and can show either total stars or the number of lineage occurrences', link: '/database' },
          { text: 'Collapse common, scenario, and race spark groups or hide unwanted sparks. Your choices are remembered' },
          { text: 'Split and combined views now show consistent inheritance chances and corrected scenario badges' },
        ]
      },
      {
        category: 'major',
        label: 'Filters & UQL',
        icon: 'filter_alt',
        color: '#ab47bc',
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
        icon: 'emoji_events',
        color: '#ffca28',
        items: [
          { text: 'Race Schedule now uses in-game race art in a denser calendar', link: '/database' },
          { text: 'Conflicting optimal races automatically move into the next available slot' },
          { text: 'Race views and history now show clearer grade, result, and cup visuals with names available on hover' },
        ]
      },
      {
        category: 'major',
        label: 'Carat Planner',
        icon: 'diamond',
        color: '#ec407a',
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
        icon: 'view_timeline',
        color: '#26a69a',
        items: [
          { text: 'Switch between horizontal and vertical timelines with compact gaps, Today, search, and event filters', link: '/timeline' },
          { text: 'Redesigned event details make rate-up odds, free pulls, rewards, races, predictions, and sources easier to scan' },
          { text: 'Improved full-screen and mobile layouts use space better, with reliable touch scrolling from interactive controls' },
        ]
      },
      {
        category: 'improvement',
        label: 'Guided Tours',
        icon: 'explore',
        color: '#7e57c2',
        items: [
          { text: 'New optional tours explain the redesigned Timeline, current Database workflow, and Carat Planner where available. Restart them anytime from the help button' },
        ]
      },
      {
        category: 'improvement',
        label: 'Circles',
        icon: 'groups',
        color: '#42a5f5',
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
        icon: 'star',
        color: '#ffc107',
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
        icon: 'upgrade',
        color: '#ff9800',
        items: [
          { text: 'Remembers search, filters, tab/account, and sort', link: '/tools/lineage-planner' },
          { text: 'Spark, factor, scope, and star settings persist' },
          { text: 'Refresh clears memory. Other pickers open fresh' },
        ]
      },
      {
        category: 'minor',
        label: 'Borrow Search',
        icon: 'add_circle',
        color: '#64b5f6',
        items: [
          { text: 'View/copy stats shown. Trainer ID copy count updates', link: '/database' },
          { text: 'Trending sort added. It is the default only without filters' },
          { text: 'Spark-filtered searches still default to affinity' },
        ]
      },
      {
        category: 'bugfix',
        label: 'Sharing & Fixes',
        icon: 'bug_report',
        color: '#4caf50',
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
        icon: 'star',
        color: '#ffc107',
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
        icon: 'upgrade',
        color: '#ff9800',
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
        icon: 'bug_report',
        color: '#4caf50',
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
        icon: 'star',
        color: '#ffc107',
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
        icon: 'upgrade',
        color: '#ff9800',
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
        icon: 'add_circle',
        color: '#64b5f6',
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
                icon: 'star',
                color: '#ffc107',
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
                icon: 'upgrade',
                color: '#ff9800',
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
                icon: 'add_circle',
                color: '#64b5f6',
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
                icon: 'bug_report',
                color: '#4caf50',
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
                icon: 'star',
                color: '#ffc107',
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
                icon: 'upgrade',
                color: '#ff9800',
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
                icon: 'add_circle',
                color: '#64b5f6',
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
                icon: 'upgrade',
                color: '#ff9800',
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
                icon: 'star',
                color: '#ffc107',
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
                icon: 'upgrade',
                color: '#ff9800',
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
                icon: 'add_circle',
                color: '#64b5f6',
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
                icon: 'star',
                color: '#ffc107',
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
                icon: 'add_circle',
                color: '#64b5f6',
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
                icon: 'bug_report',
                color: '#4caf50',
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
@Component({
    selector: 'app-update-notification',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule
    ],
    template: `
    <div class="update-dialog-container">
      <div class="dialog-header">
        <mat-icon class="header-icon">auto_awesome</mat-icon>
        <span class="header-title">{{ updates[0].title || fallbackTitle }}</span>
        <span class="header-date" *ngIf="updates[0]?.date">{{ formatDate(updates[0].date!) }}</span>
        <button class="close-btn" type="button" aria-label="Close update" (click)="dismiss()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="discord-banner">
        <mat-icon class="discord-icon">forum</mat-icon>
        <span>Have feedback or found a bug? Join our Discord!</span>
        <a href="https://discord.uma.moe/" target="_blank" class="discord-link">
          <mat-icon>open_in_new</mat-icon>
          Join
        </a>
      </div>
      <div class="dialog-body">
        <div class="category-section" *ngFor="let cat of updates[0]?.categories">
          <div class="category-label">
            <mat-icon [style.color]="cat.color">{{ cat.icon }}</mat-icon>
            <span>{{ cat.label }}</span>
          </div>
          
          <div class="category-items" [style.background]="getCategoryBg(cat.color, 0.04)" 
               [style.borderColor]="getCategoryBg(cat.color, 0.08)">
            <div class="item-row" *ngFor="let item of cat.items">
              <mat-icon class="item-icon" [style.color]="cat.color">
                {{ cat.category === 'bugfix' ? 'check_circle' : cat.category === 'major' ? 'star' : cat.category === 'improvement' ? 'upgrade' : 'add_circle' }}
              </mat-icon>
              <span>{{ item.text }}</span>
              <a *ngIf="item.link" [href]="item.link" (click)="dismiss()" class="item-link" aria-label="Open this update">
                <mat-icon>arrow_outward</mat-icon>
              </a>
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="dismiss-btn" type="button" (click)="dismiss()">
          Got it
        </button>
        <a class="open-planner-btn" href="/timeline?tab=carat-planner" (click)="dismiss()">
          <span>Open Carat Planner</span>
          <mat-icon aria-hidden="true">arrow_forward</mat-icon>
        </a>
      </div>
    </div>
  `,
    styles: [`
    .update-dialog-container {
      background: #1e1e1e;
      border-radius: 12px;
      width: 580px;
      max-width: calc(100vw - 16px);
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      box-sizing: border-box;
      @media (max-width: 640px) {
        width: calc(100vw - 16px);
      }
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 12px 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
      .header-icon {
        color: #ffc107;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .header-title {
        font-size: 15px;
        font-weight: 600;
        color: #fff;
        flex: 1;
        min-width: 0;
        line-height: 1.25;
      }
      .header-date {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.45);
        background: rgba(255, 255, 255, 0.06);
        padding: 3px 8px;
        border-radius: 4px;
      }
      @media (max-width: 480px) {
        .header-date {
          display: none;
        }
      }
      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        transition: all 0.15s;
        padding: 0;
        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
        &:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
      }
    }
    .discord-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(88, 101, 242, 0.08);
      border-bottom: 1px solid rgba(88, 101, 242, 0.15);
      flex-shrink: 0;
      .discord-icon {
        color: #5865F2;
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      span {
        flex: 1;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
      .discord-link {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        background: #5865F2;
        color: #fff;
        border-radius: 6px;
        text-decoration: none;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s;
        flex-shrink: 0;
        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
        
        &:hover {
          background: #4752c4;
        }
      }
      @media (max-width: 480px) {
        flex-wrap: wrap;
        span {
          flex-basis: calc(100% - 26px);
        }
        .discord-link {
          margin-left: 26px;
        }
      }
    }
    .dialog-body {
      padding: 12px 16px;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      &::-webkit-scrollbar {
        width: 4px;
      }
      
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
        
        &:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      }
    }
    .category-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .category-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }
    .category-items {
      border-radius: 8px;
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
    }
    .item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 6px;
      transition: background 0.15s;
      min-width: 0;
      &:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .item-icon {
        font-size: 13px;
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }
      span {
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.85);
        flex: 1;
        line-height: 1.35;
        min-width: 0;
        word-break: break-word;
      }
      .item-link {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        background: rgba(100, 181, 246, 0.12);
        color: #64b5f6;
        text-decoration: none;
        transition: all 0.15s;
        flex-shrink: 0;
        mat-icon {
          font-size: 13px;
          width: 13px;
          height: 13px;
        }
        &:hover {
          background: rgba(100, 181, 246, 0.22);
          transform: translate(1px, -1px);
        }
      }
    }
    .dialog-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      .dismiss-btn {
        height: 32px;
        padding: 0 18px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: transparent;
        color: rgba(255, 255, 255, 0.72);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        &:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
      }
      .open-planner-btn {
        height: 32px;
        padding: 0 14px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: #42a5f5;
        color: #101820;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        transition: background 0.15s, transform 0.15s;
        mat-icon {
          width: 16px;
          height: 16px;
          font-size: 16px;
        }
        &:hover {
          background: #64b5f6;
          transform: translateY(-1px);
        }
      }
      @media (max-width: 480px) {
        .dismiss-btn,
        .open-planner-btn {
          flex: 1;
        }
      }
    }
  `]
})
export class UpdateNotificationComponent implements OnInit {
    updates: UpdateEntry[] = [];
    fallbackTitle = "What's New";
    constructor(private dialogRef: MatDialogRef<UpdateNotificationComponent>) { }
    ngOnInit() {
        const isBetaHost = typeof window !== 'undefined'
            && window.location.hostname.toLowerCase() === 'beta.uma.moe';

        this.updates = UPDATE_LOG.map(update => ({
            ...update,
            categories: update.categories.filter(category => !category.betaOnly || isBetaHost)
        }));
    }
    formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
    getCategoryBg(color: string, opacity: number = 0.15): string {
        // Convert hex color to rgba with specified opacity
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    dismiss() {
        // Save the current version to localStorage
        localStorage.setItem('lastSeenUpdateVersion', CURRENT_UPDATE_VERSION.toString());
        this.dialogRef.close();
    }
}
