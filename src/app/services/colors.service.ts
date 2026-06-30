import { Injectable } from '@angular/core';
export interface ColorScheme {
  class: { [key: string]: string };
  stat: { [key: string]: string };
  chart: string[];
}
@Injectable({
  providedIn: 'root'
})
export class ColorsService {
  private colors: ColorScheme = {
    class: {
      'overall': '#64b5f6',
      '1': '#4FC3F7',
      '2': '#66BB6A',
      '3': '#C6FF00',
      '4': '#FFB300',
      '5': '#F4511E',
      '6': '#8E24AA'
    },
    stat: {
      'speed': '#098cdb',
      'power': '#db7602',
      'stamina': '#da4b38',
      'wiz': '#009e5e',
      'wit': '#009e5e',
      'intelligence': '#009e5e',
      'wisdom': '#009e5e', // alias for wiz
      'int': '#009e5e',    // alias for wiz
      'guts': '#db447e',
      'friend': '#ffb441',
      'group': '#21ce3e'
    },
    chart: [
      '#4E79A7', '#F28E2B', '#76B7B2', '#E15759', '#59A14F', '#EDC948',
      '#64b5f6', '#81c784', '#ffb74d', '#f06292'
    ]
  };
  getClassColor(classKey: string): string {
    const key = classKey === 'overall' ? 'overall' : String(classKey);
    return this.getCssColor(`--chart-class-${key}`, this.colors.class[key] || this.colors.class['1']);
  }

  getStatColor(statKey: string): string {
    const key = this.normalizeStatKey(statKey);
    return this.getCssColor(`--chart-stat-${key}`, this.colors.stat[key] || '#64b5f6');
  }

  getChartColors(): string[] {
    return this.colors.chart.map((fallback, index) => this.getCssColor(`--chart-series-${index + 1}`, fallback));
  }

  getClassColors(): string[] {
    return Object.keys(this.colors.class).map(key => this.getClassColor(key));
  }

  getStatColors(): string[] {
    return Object.keys(this.colors.stat).map(key => this.getStatColor(key));
  }
  /**
   * Get color array for team class data in order (Class 1-6)
   */
  getOrderedClassColors(): string[] {
    return ['1', '2', '3', '4', '5', '6'].map(cls => this.getClassColor(cls));
  }
  /**
   * Get color array for stats in typical order
   */
  getOrderedStatColors(): string[] {
    return ['speed', 'stamina', 'power', 'guts', 'wiz', 'friend', 'group'].map(stat => this.getStatColor(stat));
  }
  /**
   * Create a color mapping for series data based on series names
   * Prioritizes class and stat colors when detected in series names
   */
  getSeriesColorMapping(seriesNames: string[]): { [seriesName: string]: string } {
    const mapping: { [seriesName: string]: string } = {};
    seriesNames.forEach((name, index) => {
      const lowerName = name.toLowerCase();
      // Check for class patterns
      const classMatch = lowerName.match(/class\s*(\d+)/);
      if (classMatch) {
        mapping[name] = this.getClassColor(classMatch[1]);
        return;
      }
      // Check for stat patterns
      for (const statKey of Object.keys(this.colors.stat)) {
        if (lowerName.includes(statKey)) {
          mapping[name] = this.getStatColor(statKey);
          return;
        }
      }
      // Default to chart colors
      mapping[name] = this.getChartColors()[index % this.colors.chart.length];
    });
    return mapping;
  }
  /**
   * Generate a unique, consistent color based on an ID using hash function
   * This ensures the same ID always gets the same color
   */
  getHashBasedColor(id: string | number): string {
    const stringId = String(id);
    let hash = 0;
    // Simple hash function
    for (let i = 0; i < stringId.length; i++) {
      const char = stringId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert hash to positive number
    hash = Math.abs(hash);
    // Generate HSL color with enough contrast for the active theme.
    const hue = hash % 360; // 0-359 degrees
    const saturation = 65 + (hash % 25); // 65-90% for vibrant colors
    const lightness = this.isLightMode()
      ? 34 + (hash % 12)
      : 45 + (hash % 20);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
  /**
   * Get intelligent color for an item, using hash-based colors for items with IDs
   */
  getIntelligentColorForItem(item: { id?: string | number; label: string; character_color?: string }, fallbackIndex: number): string {
    // If item has character color from game database, use it
    if (item.character_color && typeof item.character_color === 'string') {
      // Convert game color format to CSS color if needed
      return this.convertGameColorToCss(item.character_color);
    }
    // If item has an ID, use hash-based color
    if (item.id !== undefined && item.id !== null && item.id !== '') {
      return this.getHashBasedColor(item.id);
    }
    // Otherwise fall back to label-based or index-based color
    return this.getIntelligentColorForLabel(item.label, fallbackIndex);
  }
  /**
   * Convert game UI color format to CSS color
   * Game colors might be in hex format or need conversion
   */
  private convertGameColorToCss(gameColor: string): string {
    // If it's already a valid CSS color, return as-is
    if (gameColor.startsWith('#') || gameColor.startsWith('rgb') || gameColor.startsWith('hsl')) {
      return gameColor;
    }
    // If it's a hex color without #, add it
    if (/^[0-9A-Fa-f]{6}$/.test(gameColor)) {
      return `#${gameColor}`;
    }
    // If it's a number, convert to hex color
    if (/^\d+$/.test(gameColor)) {
      const colorNum = parseInt(gameColor);
      const hex = colorNum.toString(16).padStart(6, '0');
      return `#${hex}`;
    }
    // For any other format, try to use as-is or fallback
    return gameColor || '#64b5f6';
  }
  /**
   * Get intelligent color based on label patterns
   */
  getIntelligentColorForLabel(label: string, fallbackIndex: number): string {
    const lowerLabel = label.toLowerCase();
    // Check for stat names
    if (lowerLabel.includes('speed')) return this.getStatColor('speed');
    if (lowerLabel.includes('power')) return this.getStatColor('power');
    if (lowerLabel.includes('stamina')) return this.getStatColor('stamina');
    if (lowerLabel.includes('wit') || lowerLabel.includes('wisdom') || lowerLabel.includes('int') || lowerLabel.includes('intelligence')) return this.getStatColor('wiz');
    if (lowerLabel.includes('guts')) return this.getStatColor('guts');
    if (lowerLabel.includes('friend')) return this.getStatColor('friend');
    if (lowerLabel.includes('group')) return this.getStatColor('group');
    // Check for class names
    const classMatch = lowerLabel.match(/class\s*(\d+)/);
    if (classMatch) {
      return this.getClassColor(classMatch[1]);
    }
    // Use hash-based color for the label itself
    return this.getHashBasedColor(label);
  }

  private normalizeStatKey(statKey: string): string {
    const key = String(statKey || '').toLowerCase();
    if (key === 'wit' || key === 'intelligence' || key === 'wisdom' || key === 'int') {
      return 'wiz';
    }
    return key;
  }

  private getCssColor(token: string, fallback: string): string {
    if (typeof document === 'undefined') {
      return fallback;
    }

    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  private isLightMode(): boolean {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('light-theme');
  }
}
