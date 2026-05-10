import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatListModule } from '@angular/material/list';
import { ColorsService } from '../../services/colors.service';
import { getStatisticsDistanceColor, getStatisticsDistanceIcon, getStatisticsDistanceLabel } from '../../data/statistics-lookup.data';
export interface ClassFilterState {
  [key: string]: boolean;
}
export interface BottomSheetData {
  selectedClasses: ClassFilterState;
  classStats: { [key: string]: { count: number; percentage: number } };
  selectedDistance: string | null;
  selectedDistances?: { [key: string]: boolean };
  distances: string[];
  scenarioFilters: { [key: string]: boolean };
  scenarioNames: { [key: string]: string };
  scenarioStats?: { [key: string]: { count: number; percentage: number } };
}
interface ClassOption {
  value: string;
  label: string;
  count?: number;
  percentage?: number;
}
interface ScenarioOption {
  value: string;
  label: string;
  percentage?: number;
}
@Component({
  selector: 'app-team-class-bottom-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatCheckboxModule, MatListModule],
  template: `
    <div class="bottom-sheet-header">
      <h2>Settings</h2>
      <button mat-icon-button (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <div class="bottom-sheet-content">
      <!-- Scenario Filter Section -->
      <div class="filter-section">
        <div class="section-header">
          <h3>Scenario Filter</h3>
        </div>
        
        <div class="scenario-grid">
          <button 
            *ngFor="let scenario of scenarioOptions"
            class="scenario-chip"
            [class.active]="localScenarioFilters[scenario.value]"
            (click)="toggleScenario(scenario.value)">
            <span class="chip-label">{{ scenario.label }}</span>
            <span class="chip-percent mono" *ngIf="scenario.percentage !== undefined">{{ (scenario.percentage || 0).toFixed(0) }}%</span>
          </button>
        </div>
      </div>
      <!-- Team Class Filter Section -->
      <div class="filter-section">
        <div class="section-header">
          <h3>Team Class Filter</h3>
        </div>
        
        <!-- All Classes Toggle -->
        <div class="all-classes-toggle">
          <mat-checkbox 
            [checked]="allClassesSelected"
            [indeterminate]="someClassesSelected && !allClassesSelected"
            (change)="toggleAllClasses($event.checked)">
            All Classes
          </mat-checkbox>
        </div>
        <!-- Individual Class Options -->
        <div class="class-grid">
          <button 
            *ngFor="let classOption of classOptions"
            class="class-chip"
            [class.active]="localSelectedClasses[classOption.value]"
            [style.--chip-color]="getBadgeColor(classOption.value)"
            (click)="toggleClass(classOption.value)">
            <span class="chip-label">{{ classOption.label }}</span>
            <span class="chip-percent mono">{{ (classOption.percentage || 0).toFixed(0) }}%</span>
          </button>
        </div>
      </div>
      
      <!-- Race Distance Section -->
      <div class="filter-section" *ngIf="data.distances.length > 0">
        <div class="section-header">
          <h3>Race Distance</h3>
          <button mat-button (click)="toggleAllDistances()">
            {{ allDistancesSelected ? 'None' : 'All' }}
          </button>
        </div>
        
        <div class="distance-options">
          <button 
            *ngFor="let distance of data.distances"
            class="distance-option"
            [class.selected]="localDistanceFilters[distance] !== false"
            [ngStyle]="getDistanceButtonStyle(distance)"
            (click)="toggleDistance(distance)">
            <mat-icon>{{ getDistanceIcon(distance) }}</mat-icon>
            <span>{{ getDistanceLabel(distance) }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './team-class-bottom-sheet.component.scss'
})
export class TeamClassBottomSheetComponent implements OnInit {
  classOptions: ClassOption[] = [
    { value: '6', label: 'Class 6' },
    { value: '5', label: 'Class 5' },
    { value: '4', label: 'Class 4' },
    { value: '3', label: 'Class 3' },
    { value: '2', label: 'Class 2' },
    { value: '1', label: 'Class 1' }
  ];
  scenarioOptions: ScenarioOption[] = [];
  localSelectedClasses: ClassFilterState = {};
  localScenarioFilters: { [key: string]: boolean } = {};
  localSelectedDistance: string | null = null;
  localDistanceFilters: { [key: string]: boolean } = {};
  constructor(
    private bottomSheetRef: MatBottomSheetRef<TeamClassBottomSheetComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: BottomSheetData,
    private colorsService: ColorsService
  ) {
    // Initialize local state from passed data
    this.localSelectedClasses = { ...data.selectedClasses };
    this.localScenarioFilters = { ...(data.scenarioFilters || {}) };
    this.localSelectedDistance = data.selectedDistance;
    this.localDistanceFilters = data.selectedDistances
      ? { ...data.selectedDistances }
      : data.distances.reduce((filters, distance) => {
          filters[distance] = data.selectedDistance ? data.selectedDistance === distance : true;
          return filters;
        }, {} as { [key: string]: boolean });
  }
  ngOnInit(): void {
    this.setupClassStats();
    this.setupScenarioOptions();
  }
  get allClassesSelected(): boolean {
    return this.classOptions.every(option => this.localSelectedClasses[option.value]);
  }
  get someClassesSelected(): boolean {
    return this.classOptions.some(option => this.localSelectedClasses[option.value]);
  }
  private setupClassStats(): void {
    this.classOptions = this.classOptions.map(option => {
      const stats = this.data.classStats[option.value];
      return {
        ...option,
        count: stats?.count || 0,
        percentage: stats?.percentage || 0
      };
    });
  }
  private setupScenarioOptions(): void {
    if (this.data.scenarioNames) {
      this.scenarioOptions = Object.entries(this.data.scenarioNames).map(([key, label]) => {
        const stats = this.data.scenarioStats?.[key];
        return {
          value: key,
          label: label,
          percentage: stats?.percentage
        };
      });
    }
  }
  toggleAllClasses(checked: boolean): void {
    this.classOptions.forEach(option => {
      this.localSelectedClasses[option.value] = checked;
    });
    // Don't close immediately on "All Classes" toggle? Or maybe yes?
    // The current implementation closes on every change. I will keep it for now but maybe I should change it to only close on "Close" button or backdrop click, and apply changes then?
    // But the `StatisticsComponent` expects the result in `afterDismissed`.
    // If I want to support multiple changes, I should NOT call dismiss here.
    // But if I don't call dismiss, the changes aren't applied until the user manually closes.
    // Let's assume the user wants to apply changes when they close the sheet.
    // So I will REMOVE propagateChanges() from the toggle methods and only return the data in close().
  }
  toggleClass(classValue: string): void {
    this.localSelectedClasses[classValue] = !this.localSelectedClasses[classValue];
  }
  toggleScenario(scenarioValue: string): void {
    this.localScenarioFilters[scenarioValue] = !this.localScenarioFilters[scenarioValue];
  }
  toggleDistance(distance: string): void {
    this.localDistanceFilters[distance] = this.localDistanceFilters[distance] === false;
    this.localSelectedDistance = this.data.distances.find(entry => this.localDistanceFilters[entry] !== false) || null;
  }
  toggleAllDistances(): void {
    const nextValue = !this.allDistancesSelected;
    this.data.distances.forEach(distance => {
      this.localDistanceFilters[distance] = nextValue;
    });
    this.localSelectedDistance = this.data.distances.find(entry => this.localDistanceFilters[entry] !== false) || null;
  }
  get allDistancesSelected(): boolean {
    return this.data.distances.length > 0 && this.data.distances.every(distance => this.localDistanceFilters[distance] !== false);
  }
  close(): void {
    this.bottomSheetRef.dismiss({
      classFilters: this.localSelectedClasses,
      scenarioFilters: this.localScenarioFilters,
      distance: this.localSelectedDistance,
      distanceFilters: this.localDistanceFilters
    });
  }
  getBadgeColor(classValue: string): string {
    return this.colorsService.getClassColor(classValue);
  }
  private static compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  formatNumber(num: number): string {
    if (Math.abs(num) >= 100_000) return TeamClassBottomSheetComponent.compactFmt.format(num);
    return num.toLocaleString();
  }
  getDistanceIcon(distance: string): string {
    return getStatisticsDistanceIcon(distance);
  }
  getDistanceLabel(distance: string): string {
    return getStatisticsDistanceLabel(distance);
  }
  getDistanceColor(distance: string): string {
    return getStatisticsDistanceColor(distance);
  }
  getDistanceButtonStyle(distance: string): any {
    const isSelected = this.localDistanceFilters[distance] !== false;
    const color = this.getDistanceColor(distance);
    
    if (isSelected) {
      return {
        'background': color,
        'border-color': color,
        'color': '#ffffff'
      };
    }
    
    return {
      'border-color': color + '40', // 25% opacity
      'color': color
    };
  }
}
