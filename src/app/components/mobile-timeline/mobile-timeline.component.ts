import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, HostListener, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { TimelineCalculation, TimelineEvent, EventType, TimelineAnniversary } from '../../models/timeline.model';
import { combineLatest, Subscription } from 'rxjs';
import { TimelineAvatar, TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelinePredictionInsight, TimelinePredictionService } from '../../services/timeline-prediction.service';
import { TimelinePredictionDialogComponent, TimelinePredictionDialogData } from '../../pages/timeline/timeline-prediction-dialog.component';
import { AdInContentComponent } from '../ads/ad-in-content.component';

interface MobileTimelineItem {
    date: Date;
    label: string;
    type: 'milestone' | 'event' | 'anniversary' | 'today' | 'year';
    eventData?: TimelineEvent;
    groupedEvents?: TimelineEvent[]; // For multiple events on the same date
    isGrouped?: boolean;
    isConfirmed?: boolean;
    daysSinceStart: number;
    daysFromToday: number;
    mobileInContentAdIndex?: number;
}

interface VirtualTimelineRow {
    index: number;
    item: MobileTimelineItem;
}

interface EventFilters {
    showCharacters: boolean;
    showSupports: boolean;
    showStoryEvents: boolean;
    showChampionsMeetings: boolean;
    showLegendRaces: boolean;
    showPaidBanners: boolean;
    showCampaigns: boolean;
    searchQuery: string;
}

interface MobileTimelineEventView {
    characterAvatars: TimelineAvatar[];
    supportAvatars: TimelineAvatar[];
    visibleCharacterAvatars: TimelineAvatar[];
    visibleSupportAvatars: TimelineAvatar[];
    hiddenCharacterCount: number;
    hiddenSupportCount: number;
    characterAvatarsExpanded: boolean;
    supportAvatarsExpanded: boolean;
    canToggleCharacterAvatars: boolean;
    canToggleSupportAvatars: boolean;
    prediction: TimelinePredictionInsight | null;
    title: string;
    endLabel: string;
    hasMeta: boolean;
    hasMedia: boolean;
    hasPickups: boolean;
    showPlaceholder: boolean;
    showDescription: boolean;
    isLegendRace: boolean;
}

@Component({
    selector: 'app-mobile-timeline',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        MatDialogModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatInputModule,
        FormsModule,
        AdInContentComponent
    ],
    templateUrl: './mobile-timeline.component.html',
    styleUrls: ['./mobile-timeline.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileTimelineComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChildren('virtualTimelineRow') private virtualTimelineRowsRef?: QueryList<ElementRef<HTMLElement>>;

    // Configuration - use UTC date
    globalReleaseDate = new Date(Date.UTC(2025, 5, 26, 22, 0, 0)); // June 26, 2025, 22:00 UTC
    timelineItems: MobileTimelineItem[] = [];
    timelineEvents: TimelineEvent[] = [];
    timelineAnniversaries: TimelineAnniversary[] = [];
    timelineCalculation: TimelineCalculation | null = null;
    virtualTimelineRows: VirtualTimelineRow[] = [];
    virtualTopSpacerHeight = 0;
    virtualBottomSpacerHeight = 0;
    hoverAvatar: TimelineAvatar | null = null;
    hoverAvatarPosition = { left: -10000, top: -10000 };
    private readonly avatarHoverCardWidth = 178;
    private readonly avatarHoverCardHeight = 70;
    private readonly initialAvatarRenderLimit = 4;
    private readonly bannerAvatarRenderLimit = 6;
    private readonly compactBannerAvatarRenderLimit = 5;
    private readonly compactBannerAvatarMediaQuery = '(max-width: 360px)';
    private readonly paidBannerAvatarRenderLimit = 5;
    private avatarHoverHideTimer?: number;
    readonly todayElementId = 'mobile-timeline-today';
    private readonly mobileInContentFirstEventIndex = 5;
    private readonly mobileInContentCadence = 8;
    private readonly virtualOverscanPx = 1300;
    private readonly virtualInitialRows = 18;
    // Event filtering
    eventFilters: EventFilters = {
        showCharacters: true,
        showSupports: true,
        showStoryEvents: true,
        showChampionsMeetings: true,
        showLegendRaces: true,
        showPaidBanners: true,
        showCampaigns: true,
        searchQuery: ''
    };
    // UI state
    isFilterPanelExpanded = false;
    // Subscriptions
    private eventsSubscription?: Subscription;
    private virtualRowsSubscription?: Subscription;
    private todayUpdateInterval?: number;
    private virtualFrame: number | null = null;
    private measureFrame: number | null = null;
    private timelineItemHeights: number[] = [];
    private timelineHeightPrefix: number[] = [0];
    private virtualStartIndex = 0;
    private virtualEndIndex = 0;
    private initialScrollDone = false;
    private initialScrollScheduled = false;
    private viewInitialized = false;
    private destroyed = false;
    private eventViewCache = new WeakMap<TimelineEvent, {
        avatarRevision: number;
        renderRevision: number;
        calculation: TimelineCalculation | null;
        view: MobileTimelineEventView;
    }>();
    private avatarRenderLimits = new WeakMap<TimelineEvent, { character?: number; support?: number }>();
    private avatarRenderRevision = 0;
    private compactBannerAvatarRows = false;

    constructor(
        private timelineService: TimelineService,
        private timelineAvatarService: TimelineAvatarService,
        private timelinePredictionService: TimelinePredictionService,
        private dialog: MatDialog,
        private cdr: ChangeDetectorRef,
        private hostRef: ElementRef<HTMLElement>
    ) { }
    ngOnInit(): void {
        this.updateCompactBannerAvatarRows();
        this.eventsSubscription = combineLatest([
            this.timelineService.events$,
            this.timelineService.anniversaries$,
            this.timelineService.calculation$
        ]).subscribe(([events, anniversaries, calculation]) => {
            this.timelineEvents = events;
            this.timelineAnniversaries = anniversaries;
            this.timelineCalculation = calculation;
            this.eventViewCache = new WeakMap();
            this.generateTimelineItems();
            this.cdr.detectChanges();
            this.scheduleInitialScrollToToday();
        });
        // Set up periodic updates for the today marker (every 5 minutes)
        this.setupTodayMarkerUpdate();
    }
    ngAfterViewInit(): void {
        this.viewInitialized = true;
        this.virtualRowsSubscription = this.virtualTimelineRowsRef?.changes.subscribe(() => {
            this.scheduleVirtualRowMeasurement();
        });
        this.updateVirtualTimelineRange();
        this.scheduleVirtualRowMeasurement();
        this.scheduleInitialScrollToToday();
    }

    shouldShowMobileInContentAd(index: number): boolean {
        return Boolean(this.timelineItems[index]?.mobileInContentAdIndex);
    }

    getMobileInContentAdSlotIndex(index: number): number {
        return this.timelineItems[index]?.mobileInContentAdIndex ?? 1;
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.cancelAvatarHoverHide();
        this.cancelVirtualFrames();
        if (this.eventsSubscription) {
            this.eventsSubscription.unsubscribe();
        }
        this.virtualRowsSubscription?.unsubscribe();
        if (this.todayUpdateInterval) {
            clearInterval(this.todayUpdateInterval);
        }
    }
    private setupTodayMarkerUpdate(): void {
        // Update the today marker every 5 minutes
        this.todayUpdateInterval = window.setInterval(() => {
            // Only regenerate if we have events
            if (this.timelineEvents.length > 0 && !document.hidden) {
                this.generateTimelineItems();
                this.cdr.detectChanges();
            }
        }, 5 * 60 * 1000); // 5 minutes in milliseconds
    }
    private generateTimelineItems(): void {
        this.timelineItems = [];
        // Calculate end date based on last event
        let actualEndDate = new Date(this.globalReleaseDate);
        if (this.timelineEvents.length > 0) {
            const latestEventDate = this.timelineEvents.reduce((latest, event) => {
                const eventDate = event.globalReleaseDate || event.jpReleaseDate;
                return eventDate > latest ? eventDate : latest;
            }, new Date(this.globalReleaseDate));
            actualEndDate = new Date(latestEventDate);
            actualEndDate.setUTCDate(actualEndDate.getUTCDate() + 14);
        }
        // Add milestone markers
        this.timelineItems.push({
            date: new Date(this.globalReleaseDate),
            label: 'Global Launch',
            type: 'milestone',
            daysSinceStart: 0,
            daysFromToday: this.calculateDaysFromTodayUTC(new Date(this.globalReleaseDate))
        });
        // Add today marker if within range (with UTC handling)
        const today = new Date();
        if (today >= this.globalReleaseDate && today <= actualEndDate) {
            const daysSinceStart = this.calculateDaysSinceStartUTC(today);
            this.timelineItems.push({
                date: new Date(today),
                label: 'Today',
                type: 'today',
                daysSinceStart,
                daysFromToday: 0 // Today is always 0 days from today
            });
        }
        // Generate anniversary markers
        this.generateAnniversaryMarkers(actualEndDate);
        // Process events with filtering
        const filteredEvents = this.timelineEvents.filter(event => this.shouldShowEvent(event));
        // Group events by date (using UTC date strings)
        const eventsByDate = new Map<string, TimelineEvent[]>();
        filteredEvents.forEach(event => {
            const eventDate = event.globalReleaseDate || event.jpReleaseDate;
            const dateKey = this.getUTCDateString(eventDate);
            if (!eventsByDate.has(dateKey)) {
                eventsByDate.set(dateKey, []);
            }
            eventsByDate.get(dateKey)!.push(event);
        });
        // Add grouped events to timeline
        eventsByDate.forEach((events, dateKey) => {
            const eventDate = new Date(dateKey);
            const daysSinceStart = this.calculateDaysSinceStartUTC(eventDate);
            if (events.length === 1) {
                // Single event
                this.timelineItems.push({
                    date: eventDate,
                    label: events[0].title,
                    type: 'event',
                    eventData: events[0],
                    isGrouped: false,
                    daysSinceStart,
                    daysFromToday: this.calculateDaysFromTodayUTC(eventDate)
                });
            } else {
                // Multiple events on same date - create a grouped item
                this.timelineItems.push({
                    date: eventDate,
                    label: `${events.length} Events`,
                    type: 'event',
                    groupedEvents: events,
                    isGrouped: true,
                    daysSinceStart,
                    daysFromToday: this.calculateDaysFromTodayUTC(eventDate)
                });
            }
        });
        // Add year markers
        this.generateYearMarkers(actualEndDate);
        // Sort by date
        this.timelineItems.sort((a, b) => a.date.getTime() - b.date.getTime());
        this.assignMobileInContentAds();
        this.resetVirtualTimeline();
    }

    private assignMobileInContentAds(): void {
        let eventItemCount = 0;
        let adCount = 0;

        this.timelineItems.forEach(item => {
            item.mobileInContentAdIndex = undefined;

            if (item.type !== 'event') {
                return;
            }

            eventItemCount += 1;

            if (eventItemCount < this.mobileInContentFirstEventIndex) {
                return;
            }

            const eventOffset = eventItemCount - this.mobileInContentFirstEventIndex;
            if (eventOffset % this.mobileInContentCadence !== 0) {
                return;
            }

            adCount += 1;
            item.mobileInContentAdIndex = ((adCount - 1) % 4) + 1;
        });
    }

    private resetVirtualTimeline(): void {
        this.timelineItemHeights = this.timelineItems.map(item => this.estimateTimelineItemHeight(item));
        this.rebuildTimelineHeightPrefix();
        this.virtualStartIndex = -1;
        this.virtualEndIndex = -1;
        this.virtualTimelineRows = [];

        if (!this.viewInitialized) {
            this.applyVirtualRange(0, Math.min(this.timelineItems.length, this.virtualInitialRows), false);
            return;
        }

        this.updateVirtualTimelineRange(false);
        this.scheduleVirtualRowMeasurement();
    }

    private scheduleVirtualTimelineUpdate(): void {
        if (typeof window === 'undefined' || this.destroyed || this.virtualFrame !== null) {
            return;
        }

        this.virtualFrame = window.requestAnimationFrame(() => {
            this.virtualFrame = null;
            this.updateVirtualTimelineRange();
        });
    }

    private updateVirtualTimelineRange(requestDetectChanges = true): void {
        const itemCount = this.timelineItems.length;
        if (itemCount === 0) {
            this.applyVirtualRange(0, 0, requestDetectChanges);
            return;
        }

        if (typeof window === 'undefined' || !this.viewInitialized) {
            this.applyVirtualRange(0, Math.min(itemCount, this.virtualInitialRows), requestDetectChanges);
            return;
        }

        const feedTop = this.getFeedPageTop();
        const viewportTop = Math.max(0, window.scrollY - feedTop);
        const viewportBottom = viewportTop + window.innerHeight;
        const startOffset = Math.max(0, viewportTop - this.virtualOverscanPx);
        const endOffset = Math.min(this.getTotalTimelineHeight(), viewportBottom + this.virtualOverscanPx);
        const startIndex = Math.max(0, this.findTimelineIndexForOffset(startOffset) - 2);
        const endIndex = Math.min(itemCount, this.findTimelineIndexForOffset(endOffset) + 4);

        this.applyVirtualRange(startIndex, Math.max(endIndex, startIndex + 1), requestDetectChanges);
    }

    private applyVirtualRange(startIndex: number, endIndex: number, requestDetectChanges: boolean): void {
        const normalizedStart = Math.max(0, Math.min(startIndex, this.timelineItems.length));
        const normalizedEnd = Math.max(normalizedStart, Math.min(endIndex, this.timelineItems.length));
        const rangeChanged = normalizedStart !== this.virtualStartIndex || normalizedEnd !== this.virtualEndIndex;

        this.virtualStartIndex = normalizedStart;
        this.virtualEndIndex = normalizedEnd;
        this.virtualTopSpacerHeight = this.getTimelineOffset(normalizedStart);
        this.virtualBottomSpacerHeight = Math.max(0, this.getTotalTimelineHeight() - this.getTimelineOffset(normalizedEnd));

        if (rangeChanged || this.virtualTimelineRows.length !== normalizedEnd - normalizedStart) {
            this.virtualTimelineRows = this.timelineItems
                .slice(normalizedStart, normalizedEnd)
                .map((item, offset) => ({ item, index: normalizedStart + offset }));
            this.scheduleVirtualRowMeasurement();
        }

        if (requestDetectChanges && !this.destroyed) {
            this.cdr.detectChanges();
        }
    }

    private scheduleVirtualRowMeasurement(): void {
        if (typeof window === 'undefined' || this.destroyed || this.measureFrame !== null) {
            return;
        }

        this.measureFrame = window.requestAnimationFrame(() => {
            this.measureFrame = null;
            this.measureVirtualRows();
        });
    }

    private measureVirtualRows(): void {
        if (!this.virtualTimelineRowsRef) {
            return;
        }

        let changed = false;
        this.virtualTimelineRowsRef.forEach(row => {
            const element = row.nativeElement;
            const index = Number(element.dataset['timelineIndex']);
            if (!Number.isFinite(index)) {
                return;
            }

            const measuredHeight = Math.ceil(element.getBoundingClientRect().height);
            if (measuredHeight <= 0) {
                return;
            }

            const previousHeight = this.timelineItemHeights[index] ?? 0;
            if (Math.abs(previousHeight - measuredHeight) <= 2) {
                return;
            }

            this.timelineItemHeights[index] = measuredHeight;
            changed = true;
        });

        if (!changed) {
            return;
        }

        this.rebuildTimelineHeightPrefix();
        this.virtualTopSpacerHeight = this.getTimelineOffset(this.virtualStartIndex);
        this.virtualBottomSpacerHeight = Math.max(0, this.getTotalTimelineHeight() - this.getTimelineOffset(this.virtualEndIndex));
        this.scheduleVirtualTimelineUpdate();
        this.cdr.detectChanges();
    }

    private rebuildTimelineHeightPrefix(): void {
        this.timelineHeightPrefix = [0];
        for (let index = 0; index < this.timelineItemHeights.length; index++) {
            this.timelineHeightPrefix[index + 1] = this.timelineHeightPrefix[index] + this.timelineItemHeights[index];
        }
    }

    private estimateTimelineItemHeight(item: MobileTimelineItem): number {
        let height = 68;

        if (item.type === 'event') {
            const eventCount = item.isGrouped ? Math.max(1, item.groupedEvents?.length ?? 1) : 1;
            height = item.isGrouped ? 46 + (eventCount * 196) + ((eventCount - 1) * 7) : 206;

            const primaryEvent = item.eventData ?? item.groupedEvents?.[0];
            if (primaryEvent?.type === EventType.LEGEND_RACE) {
                height += item.isGrouped ? eventCount * 18 : 18;
            } else if (
                primaryEvent?.type === EventType.CHAMPIONS_MEETING ||
                primaryEvent?.type === EventType.STORY_EVENT ||
                primaryEvent?.type === EventType.CAMPAIGN
            ) {
                height += item.isGrouped ? eventCount * 24 : 24;
            }
        } else if (item.type === 'today' || item.type === 'milestone' || item.type === 'anniversary') {
            height = 72;
        } else if (item.type === 'year') {
            height = 42;
        }

        if (item.mobileInContentAdIndex) {
            height += this.estimateMobileInContentAdHeight(item.mobileInContentAdIndex);
        }

        return height;
    }

    private estimateMobileInContentAdHeight(index: number): number {
        switch (index) {
            case 1:
                return 86;
            case 2:
                return 286;
            case 3:
                return 636;
            case 4:
                return 336;
            default:
                return 120;
        }
    }

    private findTimelineIndexForOffset(offset: number): number {
        const lastIndex = Math.max(0, this.timelineItems.length - 1);
        if (offset <= 0) {
            return 0;
        }

        let low = 0;
        let high = lastIndex;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (this.getTimelineOffset(mid + 1) < offset) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low;
    }

    private getTimelineOffset(index: number): number {
        const safeIndex = Math.max(0, Math.min(index, this.timelineHeightPrefix.length - 1));
        return this.timelineHeightPrefix[safeIndex] ?? 0;
    }

    private getTotalTimelineHeight(): number {
        return this.timelineHeightPrefix[this.timelineHeightPrefix.length - 1] ?? 0;
    }

    private getFeedPageTop(): number {
        const feed = this.hostRef.nativeElement.querySelector<HTMLElement>('.tl-feed');
        const element = feed ?? this.hostRef.nativeElement;
        return element.getBoundingClientRect().top + window.scrollY;
    }

    private cancelVirtualFrames(): void {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.virtualFrame !== null) {
            window.cancelAnimationFrame(this.virtualFrame);
            this.virtualFrame = null;
        }

        if (this.measureFrame !== null) {
            window.cancelAnimationFrame(this.measureFrame);
            this.measureFrame = null;
        }
    }

    private shouldShowEvent(event: TimelineEvent): boolean {
        // Apply event type filters
        if (event.type === EventType.CHARACTER_BANNER && !this.eventFilters.showCharacters) return false;
        if (event.type === EventType.SUPPORT_CARD_BANNER && !this.eventFilters.showSupports) return false;
        if (event.type === EventType.PAID_BANNER && !this.eventFilters.showPaidBanners) return false;
        if (event.type === EventType.STORY_EVENT && !this.eventFilters.showStoryEvents) return false;
        if (event.type === EventType.CHAMPIONS_MEETING && !this.eventFilters.showChampionsMeetings) return false;
        if (event.type === EventType.LEGEND_RACE && !this.eventFilters.showLegendRaces) return false;
        if (event.type === EventType.CAMPAIGN && !this.eventFilters.showCampaigns) return false;
        // Handle other event types under story events
        if (event.type !== EventType.CHARACTER_BANNER &&
            event.type !== EventType.SUPPORT_CARD_BANNER &&
            event.type !== EventType.PAID_BANNER &&
            event.type !== EventType.STORY_EVENT &&
            event.type !== EventType.CHAMPIONS_MEETING &&
            event.type !== EventType.LEGEND_RACE &&
            event.type !== EventType.CAMPAIGN &&
            !this.eventFilters.showStoryEvents) return false;
        // Apply search filter
        if (this.eventFilters.searchQuery.trim()) {
            if (!this.timelineAvatarService.eventMatchesSearch(event, this.eventFilters.searchQuery)) {
                return false;
            }
        }
        const eventDate = event.globalReleaseDate || event.jpReleaseDate;
        return eventDate >= this.globalReleaseDate;
    }
    private generateAnniversaryMarkers(endDate: Date): void {
        this.timelineAnniversaries.forEach(anniversary => {
            const globalAnniversaryDate = anniversary.globalDate;
            if (globalAnniversaryDate > endDate || globalAnniversaryDate < this.globalReleaseDate) {
                return;
            }

            const daysSinceStart = this.calculateDaysSinceStartUTC(globalAnniversaryDate);
            this.timelineItems.push({
                date: new Date(globalAnniversaryDate),
                label: anniversary.label,
                type: 'anniversary',
                isConfirmed: anniversary.isConfirmed,
                daysSinceStart,
                daysFromToday: this.calculateDaysFromTodayUTC(globalAnniversaryDate)
            });
        });
    }
    private generateYearMarkers(endDate: Date): void {
        const currentDate = new Date(this.globalReleaseDate);
        const yearMarkerEndDate = new Date(Math.min(endDate.getTime(), 
            Date.UTC(this.globalReleaseDate.getUTCFullYear() + 10, 0, 1)));
        while (currentDate <= yearMarkerEndDate) {
            if (currentDate.getUTCMonth() === 0 && currentDate.getUTCDate() === 1 && 
                currentDate.getUTCFullYear() >= this.globalReleaseDate.getUTCFullYear()) {
                const daysSinceStart = this.calculateDaysSinceStartUTC(currentDate);
                this.timelineItems.push({
                    date: new Date(currentDate),
                    label: currentDate.getUTCFullYear().toString(),
                    type: 'year',
                    daysSinceStart,
                    daysFromToday: this.calculateDaysFromTodayUTC(currentDate)
                });
            }
            currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
            currentDate.setUTCDate(1);
        }
    }
    // Helper method to calculate days from today using UTC
    private calculateDaysFromTodayUTC(date: Date): number {
        const today = new Date();
        // Today at 22:00 UTC (event time)
        const todayEventTime = new Date(Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
            22, 0, 0, 0
        ));
        
        // Event date at 22:00 UTC
        const eventDateTime = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            22, 0, 0, 0
        ));
        
        // If today's event time hasn't passed yet, use yesterday's event time as reference
        const referenceTime = today < todayEventTime 
            ? new Date(todayEventTime.getTime() - 24 * 60 * 60 * 1000)
            : todayEventTime;
        
        return Math.floor((eventDateTime.getTime() - referenceTime.getTime()) / (1000 * 60 * 60 * 24));
    }
    // Helper method to calculate days since start using UTC
    private calculateDaysSinceStartUTC(date: Date): number {
        // Global release at 22:00 UTC
        const startUTC = new Date(Date.UTC(
            this.globalReleaseDate.getUTCFullYear(),
            this.globalReleaseDate.getUTCMonth(),
            this.globalReleaseDate.getUTCDate(),
            22, 0, 0, 0
        ));
        
        // Date at 22:00 UTC
        const dateUTC = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            22, 0, 0, 0
        ));
        
        return Math.floor((dateUTC.getTime() - startUTC.getTime()) / (1000 * 60 * 60 * 24));
    }
    // Helper method to get UTC date string for grouping
    private getUTCDateString(date: Date): string {
        // Group by the event date at 22:00 UTC
        return new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            22, 0, 0, 0
        )).toISOString();
    }
    // Filter methods
    onSearchChange(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    toggleCharacterFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    toggleSupportFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    toggleStoryEventsFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    toggleChampionsMeetingsFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    toggleLegendRacesFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    togglePaidBannersFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    toggleCampaignsFilter(): void {
        this.generateTimelineItems();
        this.cdr.detectChanges();
    }
    getFilteredEventCount(): number {
        return this.timelineEvents.filter(event => this.shouldShowEvent(event)).length;
    }
    getTotalEventCount(): number {
        return this.timelineEvents.length;
    }
    // Helper methods for filtering event counts in template
    getCharacterBannerCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.CHARACTER_BANNER).length;
    }
    getSupportCardBannerCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.SUPPORT_CARD_BANNER).length;
    }
    getStoryEventCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.STORY_EVENT).length;
    }
    getChampionsMeetingCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.CHAMPIONS_MEETING).length;
    }
    getLegendRaceCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.LEGEND_RACE).length;
    }
    getPaidBannerCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.PAID_BANNER).length;
    }
    getCampaignCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.CAMPAIGN).length;
    }
    onImageError(event: any): void {
        const image = event.target as HTMLImageElement;
        image.style.display = 'none';
        const avatarLink = image.closest<HTMLElement>('.ev-avatar-link');
        if (avatarLink) {
            avatarLink.style.display = 'none';
        }
        this.scheduleVirtualRowMeasurement();
    }
    @HostListener('window:resize')
    onWindowResize(): void {
        this.updateCompactBannerAvatarRows();
        this.timelineItemHeights = this.timelineItems.map((item, index) => (
            this.timelineItemHeights[index] || this.estimateTimelineItemHeight(item)
        ));
        this.rebuildTimelineHeightPrefix();
        this.scheduleVirtualTimelineUpdate();
        this.scheduleVirtualRowMeasurement();
    }

    @HostListener('window:scroll')
    onWindowScroll(): void {
        this.scheduleVirtualTimelineUpdate();
    }

    getCharacterAvatars(event?: TimelineEvent): TimelineAvatar[] {
        return this.timelineAvatarService.getCharacterAvatars(event);
    }

    getSupportAvatars(event?: TimelineEvent): TimelineAvatar[] {
        return this.timelineAvatarService.getSupportAvatars(event);
    }

    trackByAvatarKey(index: number, avatar: TimelineAvatar): string {
        return avatar.key;
    }
    showAvatarHover(event: Event, avatar: TimelineAvatar): void {
        const target = event.currentTarget as HTMLElement | null;
        if (!target) {
            return;
        }
        this.cancelAvatarHoverHide();

        const rect = target.getBoundingClientRect();
        const gutter = 8;
        const width = this.avatarHoverCardWidth;
        const height = this.avatarHoverCardHeight;
        let left = rect.left + rect.width / 2 - width / 2;
        let top = rect.bottom + 8;

        left = Math.max(gutter, Math.min(left, window.innerWidth - width - gutter));
        if (top + height > window.innerHeight - gutter) {
            top = Math.max(gutter, rect.top - height - 8);
        }

        this.hoverAvatar = avatar;
        this.hoverAvatarPosition = { left, top };
        this.cdr.detectChanges();
    }
    scheduleAvatarHoverHide(): void {
        this.cancelAvatarHoverHide();
        this.avatarHoverHideTimer = window.setTimeout(() => this.hideAvatarHover(), 140);
    }
    cancelAvatarHoverHide(): void {
        if (this.avatarHoverHideTimer) {
            window.clearTimeout(this.avatarHoverHideTimer);
            this.avatarHoverHideTimer = undefined;
        }
    }
    hideAvatarHover(): void {
        this.cancelAvatarHoverHide();
        if (!this.hoverAvatar) {
            return;
        }
        this.hoverAvatar = null;
        this.hoverAvatarPosition = { left: -10000, top: -10000 };
        this.cdr.detectChanges();
    }
    toggleAvatarExpansion(event: TimelineEvent | undefined, kind: 'character' | 'support', domEvent: Event): void {
        domEvent.preventDefault();
        domEvent.stopPropagation();
        this.hideAvatarHover();

        if (!event) {
            return;
        }

        const avatars = kind === 'character'
            ? this.timelineAvatarService.getCharacterAvatars(event)
            : this.timelineAvatarService.getSupportAvatars(event);
        const currentLimit = this.getAvatarRenderLimit(event, kind, avatars.length);
        const initialLimit = this.getInitialAvatarRenderLimit(event);
        if (avatars.length <= initialLimit) {
            return;
        }

        const state = this.getAvatarRenderState(event);
        state[kind] = currentLimit >= avatars.length
            ? initialLimit
            : avatars.length;
        this.avatarRenderRevision++;
        this.eventViewCache.delete(event);
        this.cdr.detectChanges();
        this.scheduleVirtualRowMeasurement();
    }
    getPredictionInsight(event?: TimelineEvent): TimelinePredictionInsight | null {
        return this.timelinePredictionService.buildInsight(event, this.timelineCalculation);
    }
    getMobileEventView(event?: TimelineEvent): MobileTimelineEventView | null {
        if (!event) {
            return null;
        }

        const avatarRevision = this.timelineAvatarService.revision;
        const cached = this.eventViewCache.get(event);
        if (cached &&
            cached.avatarRevision === avatarRevision &&
            cached.renderRevision === this.avatarRenderRevision &&
            cached.calculation === this.timelineCalculation) {
            return cached.view;
        }

        const characterAvatars = this.timelineAvatarService.getCharacterAvatars(event);
        const supportAvatars = this.timelineAvatarService.getSupportAvatars(event);
        const characterLimit = this.getAvatarRenderLimit(event, 'character', characterAvatars.length);
        const supportLimit = this.getAvatarRenderLimit(event, 'support', supportAvatars.length);
        const visibleCharacterAvatars = characterAvatars.slice(0, characterLimit);
        const visibleSupportAvatars = supportAvatars.slice(0, supportLimit);
        const initialLimit = this.getInitialAvatarRenderLimit(event);
        const characterAvatarsExpanded = characterAvatars.length > initialLimit &&
            characterLimit >= characterAvatars.length;
        const supportAvatarsExpanded = supportAvatars.length > initialLimit &&
            supportLimit >= supportAvatars.length;
        const showDescription = this.shouldShowMobileDescription(event);
        const isLegendRace = event.type === EventType.LEGEND_RACE;
        const showPlaceholder = this.shouldShowMobilePlaceholder(event, showDescription);
        const hasMedia = !!event.imagePath || isLegendRace || showPlaceholder;
        const endLabel = this.getMobileEventEndLabel(event);
        const view: MobileTimelineEventView = {
            characterAvatars,
            supportAvatars,
            visibleCharacterAvatars,
            visibleSupportAvatars,
            hiddenCharacterCount: Math.max(0, characterAvatars.length - visibleCharacterAvatars.length),
            hiddenSupportCount: Math.max(0, supportAvatars.length - visibleSupportAvatars.length),
            characterAvatarsExpanded,
            supportAvatarsExpanded,
            canToggleCharacterAvatars: characterAvatars.length > initialLimit,
            canToggleSupportAvatars: supportAvatars.length > initialLimit,
            prediction: this.timelinePredictionService.buildInsight(event, this.timelineCalculation),
            title: this.getMobileEventTitle(event),
            endLabel,
            hasMeta: !!endLabel,
            hasMedia,
            hasPickups: characterAvatars.length > 0 || supportAvatars.length > 0,
            showPlaceholder,
            showDescription,
            isLegendRace
        };

        this.eventViewCache.set(event, {
            avatarRevision,
            renderRevision: this.avatarRenderRevision,
            calculation: this.timelineCalculation,
            view
        });
        return view;
    }
    private getAvatarRenderState(event: TimelineEvent): { character?: number; support?: number } {
        let state = this.avatarRenderLimits.get(event);
        if (!state) {
            state = {};
            this.avatarRenderLimits.set(event, state);
        }
        return state;
    }
    private getAvatarRenderLimit(event: TimelineEvent, kind: 'character' | 'support', total: number): number {
        const initialLimit = this.getInitialAvatarRenderLimit(event);
        if (total <= initialLimit) {
            return total;
        }

        const configuredLimit = this.avatarRenderLimits.get(event)?.[kind];
        return Math.min(total, configuredLimit ?? initialLimit);
    }
    private getInitialAvatarRenderLimit(event: TimelineEvent): number {
        if (event.type === EventType.CHARACTER_BANNER || event.type === EventType.SUPPORT_CARD_BANNER) {
            return this.compactBannerAvatarRows
                ? this.compactBannerAvatarRenderLimit
                : this.bannerAvatarRenderLimit;
        }

        return event.type === EventType.PAID_BANNER
            ? this.paidBannerAvatarRenderLimit
            : this.initialAvatarRenderLimit;
    }
    private updateCompactBannerAvatarRows(): void {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const shouldUseCompactRows = window.matchMedia(this.compactBannerAvatarMediaQuery).matches;
        if (shouldUseCompactRows === this.compactBannerAvatarRows) {
            return;
        }

        this.compactBannerAvatarRows = shouldUseCompactRows;
        this.avatarRenderRevision++;
        this.eventViewCache = new WeakMap();
        if (!this.destroyed) {
            this.cdr.detectChanges();
        }
    }
    openPredictionDetails(event: TimelineEvent | undefined, prediction: TimelinePredictionInsight | null, clickEvent?: MouseEvent): void {
        clickEvent?.preventDefault();
        clickEvent?.stopPropagation();

        if (!event || !prediction) {
            return;
        }

        const data: TimelinePredictionDialogData = {
            event,
            insight: prediction,
            calculation: this.timelineCalculation,
            eventTypeLabel: this.getEventTypeLabel(event.type),
            displayTitle: this.getMobileEventTitle(event),
            dateLabel: this.formatPredictionEventDate(event)
        };

        this.dialog.open(TimelinePredictionDialogComponent, {
            data,
            autoFocus: false,
            maxWidth: '100vw',
            restoreFocus: false,
            panelClass: 'timeline-prediction-dialog-panel'
        });
    }
    trackByPredictionMetric(index: number, metric: { label: string }): string {
        return metric.label;
    }
    trackByPredictionAlternative(index: number, alternative: { label: string; reason: string }): string {
        return `${alternative.label}-${alternative.reason}`;
    }
    private scheduleInitialScrollToToday(): void {
        if (
            this.initialScrollDone ||
            this.initialScrollScheduled ||
            !this.viewInitialized ||
            this.timelineEvents.length === 0 ||
            !this.timelineItems.some(item => item.type === 'today')
        ) {
            return;
        }

        this.initialScrollScheduled = true;
        void this.scrollToTodayAfterInitialLayout();
    }

    private async scrollToTodayAfterInitialLayout(): Promise<void> {
        const initialScrollY = window.scrollY;

        try {
            await this.waitForInitialTimelineLayout();

            if (this.destroyed || this.initialScrollDone) {
                return;
            }

            if (Math.abs(window.scrollY - initialScrollY) > 80) {
                this.initialScrollDone = true;
                return;
            }

            if (this.scrollToToday('auto')) {
                this.initialScrollDone = true;
                await this.waitForFrames(2);
                if (!this.destroyed) {
                    this.scrollToToday('auto');
                }
            }
        } finally {
            this.initialScrollScheduled = false;
        }
    }

    private async waitForInitialTimelineLayout(): Promise<void> {
        await this.waitForFrames(2);
        await this.waitForTimelineImages();
        await this.waitForStableTimelineHeight();
    }

    private waitForTimelineImages(timeoutMs = 3000): Promise<void> {
        const feed = this.hostRef.nativeElement.querySelector<HTMLElement>('.tl-feed');
        if (!feed) {
            return Promise.resolve();
        }

        const images = Array.from(feed.querySelectorAll<HTMLImageElement>('img'))
            .filter(image => !image.complete && image.loading !== 'lazy');

        if (images.length === 0) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let finished = false;
            let timeoutId: number | undefined;
            const pendingImages = new Set(images);

            const finish = (): void => {
                if (finished) {
                    return;
                }

                finished = true;
                if (timeoutId !== undefined) {
                    window.clearTimeout(timeoutId);
                }
                images.forEach(image => {
                    image.removeEventListener('load', onSettle);
                    image.removeEventListener('error', onSettle);
                });
                resolve();
            };

            const onSettle = (event: Event): void => {
                const image = event.currentTarget as HTMLImageElement | null;
                if (image) {
                    pendingImages.delete(image);
                }
                if (pendingImages.size === 0) {
                    finish();
                }
            };

            timeoutId = window.setTimeout(finish, timeoutMs);
            images.forEach(image => {
                image.addEventListener('load', onSettle, { once: true });
                image.addEventListener('error', onSettle, { once: true });
                if (image.complete) {
                    pendingImages.delete(image);
                }
            });

            if (pendingImages.size === 0) {
                finish();
            }
        });
    }

    private async waitForStableTimelineHeight(stableFrameTarget = 3, maxFrames = 20): Promise<void> {
        const timeline = this.hostRef.nativeElement.querySelector<HTMLElement>('.tl-feed') ?? this.hostRef.nativeElement;
        let lastHeight = -1;
        let stableFrames = 0;

        for (let frame = 0; frame < maxFrames && stableFrames < stableFrameTarget && !this.destroyed; frame++) {
            await this.waitForFrames(1);
            const height = timeline.scrollHeight;
            if (lastHeight >= 0 && Math.abs(height - lastHeight) <= 1) {
                stableFrames++;
            } else {
                stableFrames = 0;
            }
            lastHeight = height;
        }
    }

    private waitForFrames(frameCount: number): Promise<void> {
        return new Promise(resolve => {
            const tick = (): void => {
                if (this.destroyed || frameCount <= 0) {
                    resolve();
                    return;
                }

                frameCount--;
                window.requestAnimationFrame(tick);
            };

            tick();
        });
    }

    scrollToToday(behavior: ScrollBehavior = 'smooth'): boolean {
        const todayIndex = this.timelineItems.findIndex(item => item.type === 'today');
        if (todayIndex >= 0 && typeof window !== 'undefined') {
            const feedTop = this.getFeedPageTop();
            const rowCenter = this.getTimelineOffset(todayIndex) + ((this.timelineItemHeights[todayIndex] ?? 72) / 2);
            const targetTop = Math.max(0, feedTop + rowCenter - (window.innerHeight / 2));
            window.scrollTo({ top: targetTop, behavior });
            this.updateVirtualTimelineRange(false);
            this.cdr.detectChanges();
            return true;
        }

        const element = this.hostRef.nativeElement.querySelector<HTMLElement>(`#${this.todayElementId}`);
        if (!element) {
            return false;
        }

        element.scrollIntoView({ behavior, block: 'center' });
        return true;
    }
    toggleFilterPanel(): void {
        this.isFilterPanelExpanded = !this.isFilterPanelExpanded;
        this.cdr.detectChanges();
    }
    trackByItemDate(index: number, item: MobileTimelineItem): string {
        return `${item.date.getTime()}-${item.type}-${item.isGrouped ? 'grouped' : 'single'}`;
    }
    trackByVirtualTimelineRow(index: number, row: VirtualTimelineRow): string {
        const item = row.item;
        return `${row.index}-${item.date.getTime()}-${item.type}-${item.isGrouped ? 'grouped' : 'single'}`;
    }
    trackByGroupedEventId(index: number, event: TimelineEvent): string {
        return event.id;
    }
    // Helper methods for event type checking
    isCharacterBanner(eventType?: EventType): boolean {
        return eventType === EventType.CHARACTER_BANNER;
    }
    isSupportCardBanner(eventType?: EventType): boolean {
        return eventType === EventType.SUPPORT_CARD_BANNER;
    }
    isStoryEvent(eventType?: EventType): boolean {
        return eventType === EventType.STORY_EVENT;
    }
    isChampionsMeeting(eventType?: EventType): boolean {
        return eventType === EventType.CHAMPIONS_MEETING;
    }
    isLegendRace(eventType?: EventType): boolean {
        return eventType === EventType.LEGEND_RACE;
    }
    isPaidBanner(eventType?: EventType): boolean {
        return eventType === EventType.PAID_BANNER;
    }
    // Helper method to get event image URL
    getEventImageUrl(event?: TimelineEvent): string | undefined {
        return event?.imagePath;
    }
    // Helper method to safely get event title
    getEventTitle(event?: TimelineEvent): string {
        return event?.title || '';
    }
    getMobileEventTitle(event?: TimelineEvent): string {
        if (!event) return '';
        if (event.type === EventType.LEGEND_RACE) {
            return this.getLegendRaceTitle(event.title);
        }

        return this.timelineAvatarService.getEventDisplayTitle(event) || this.getEventTypeLabel(event.type);
    }
    hasMobileMeta(event?: TimelineEvent): boolean {
        return !!this.getMobileEventEndLabel(event);
    }
    getMobileEventEndLabel(event?: TimelineEvent): string {
        if (!event?.estimatedEndDate) return '';

        return `Until ${event.estimatedEndDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        })}`;
    }
    hasMobileMedia(event?: TimelineEvent): boolean {
        return !!event?.imagePath ||
            event?.type === EventType.LEGEND_RACE ||
            this.shouldShowMobilePlaceholder(event);
    }
    shouldShowMobilePlaceholder(event?: TimelineEvent, showDescription = this.shouldShowMobileDescription(event)): boolean {
        if (!event || event.imagePath || event.type === EventType.LEGEND_RACE) return false;

        return !showDescription;
    }
    shouldShowMobileDescription(event?: TimelineEvent): boolean {
        if (!event?.description) return false;

        return event.type === EventType.CHAMPIONS_MEETING ||
            event.type === EventType.STORY_EVENT ||
            event.type === EventType.CAMPAIGN;
    }
    // Format date for mobile timeline items
    formatDateForItem(item: MobileTimelineItem): string {
        if (!item.date) return '';
        const dateOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        };
        const formatSingleDate = (date: Date): string => {
            return date.toLocaleDateString('en-US', dateOptions);
        };
        // Check confirmation status from event data or grouped events
        let isConfirmed = item.isConfirmed !== false;
        if (item.eventData) {
            isConfirmed = item.eventData.isConfirmed !== false;
        } else if (item.groupedEvents && item.groupedEvents.length > 0) {
            // For grouped events, show ~ if any event is unconfirmed
            isConfirmed = item.groupedEvents.every(event => event.isConfirmed !== false);
        }
        const prefix = isConfirmed ? '' : '~';
        return `${prefix}${formatSingleDate(item.date)}`;
    }
    // Format date to ensure consistent display (same as desktop timeline)
    formatDate(event: TimelineEvent): string {
        const eventDate = event.globalReleaseDate || event.jpReleaseDate;
        if (!eventDate) return '';
        const dateOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        };
        const formatSingleDate = (date: Date): string => {
            return date.toLocaleDateString('en-US', dateOptions);
        };
        // Simple date formatting with confirmation indicator
        const isConfirmed = event.isConfirmed;
        const prefix = isConfirmed ? '' : '~';
        
        return `${prefix}${formatSingleDate(eventDate)}`;
    }
    private formatPredictionEventDate(event: TimelineEvent): string {
        const eventDate = event.globalReleaseDate || event.estimatedGlobalDate || event.jpReleaseDate;
        if (!eventDate) return '';

        const dateOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        };
        const prefix = event.isConfirmed ? '' : '~';
        const start = eventDate.toLocaleDateString('en-US', dateOptions);
        if (!event.estimatedEndDate) {
            return `${prefix}${start}`;
        }

        const end = event.estimatedEndDate.toLocaleDateString('en-US', dateOptions);
        return `${prefix}${start} - ${end}`;
    }
    // Helper methods for template display
    getEventTypeIcon(type?: EventType): string {
        switch (type) {
            case EventType.CHARACTER_BANNER:    return 'person';
            case EventType.SUPPORT_CARD_BANNER: return 'style';
            case EventType.STORY_EVENT:         return 'auto_stories';
            case EventType.CHAMPIONS_MEETING:   return 'emoji_events';
            case EventType.LEGEND_RACE:         return 'sports_motorsports';
            case EventType.PAID_BANNER:         return 'payments';
            case EventType.CAMPAIGN:            return 'assignment';
            default:                            return 'event';
        }
    }

    getEventTypeLabel(type?: EventType): string {
        switch (type) {
            case EventType.CHARACTER_BANNER:    return 'Character Banner';
            case EventType.SUPPORT_CARD_BANNER: return 'Support Banner';
            case EventType.STORY_EVENT:         return 'Story Event';
            case EventType.CHAMPIONS_MEETING:   return 'Champions Meeting';
            case EventType.LEGEND_RACE:         return 'Legend Race';
            case EventType.PAID_BANNER:         return 'Paid Banner';
            case EventType.CAMPAIGN:            return 'Mission Campaign';
            default:                            return 'Event';
        }
    }

    getLegendRaceTitle(title?: string): string {
        return (title || '').replace(/ Legend Race$/i, '').trim();
    }

    getLegendCourseChips(description?: string): { icon: string; label: string }[] {
        if (!description) return [];
        const parts = description.split(' - ').map(p => p.trim());
        const icons: Record<string, string> = {
            'Turf': 'grass', 'Dirt': 'landscape',
            'Short': 'bolt', 'Mile': 'straighten', 'Medium': 'straighten', 'Long': 'route', 'Extended': 'route'
        };
        return parts.map(p => ({ icon: icons[p] || 'sports_score', label: p }));
    }

    // Open gametora URL if available
    openGametoraLink(event?: TimelineEvent): void {
        if (event?.gametoraURL) {
            window.open(event.gametoraURL, '_blank', 'noopener,noreferrer');
        }
    }

    // Check if event has gametora link
    hasGametoraLink(event?: TimelineEvent): boolean {
        return !!(event?.gametoraURL);
    }
}

