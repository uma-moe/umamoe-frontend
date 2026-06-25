import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { TimelineService } from '../../services/timeline.service';
import { TimelineCalculation, TimelineEvent, EventType, TimelineAnniversary } from '../../models/timeline.model';
import { MobileTimelineComponent } from '../../components/mobile-timeline/mobile-timeline.component';
import { TimelineAvatar, TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelinePredictionInsight, TimelinePredictionService } from '../../services/timeline-prediction.service';
import { TimelinePredictionDialogComponent, TimelinePredictionDialogData } from './timeline-prediction-dialog.component';
import { AdInContentComponent } from '../../components/ads/ad-in-content.component';
import { combineLatest, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';
interface TimelineItem {
    date: Date;
    label: string;
    type: 'month' | 'year' | 'milestone' | 'event' | 'anniversary' | 'grouped-events' | 'today';
    position: number;
    side?: 'top' | 'bottom';
    eventData?: TimelineEvent;
    groupedEvents?: TimelineEvent[]; // For multiple events on the same date
    groupIndex?: number; // Index within a group of events on the same date
    isGrouped?: boolean; // Whether this item is part of a group
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

@Component({
    selector: 'app-timeline',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        MatDialogModule,
        MatSlideToggleModule,
        MatButtonToggleModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatInputModule,
        MatProgressSpinnerModule,
        FormsModule,
        ScrollingModule,
        MobileTimelineComponent,
        AdInContentComponent
    ],
    templateUrl: './timeline.component.html',
    styleUrls: ['./timeline.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush // Enable OnPush for better performance
})
export class TimelineComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('timelineContainer', { static: false }) timelineContainer!: ElementRef;
    // Timeline configuration
    globalReleaseDate = new Date('2025-06-26T22:00:00Z'); // Global launch date
    endDate = new Date('2027-06-26'); // 2 years instead of 4
    // Responsive design
    isMobile = false;
    mobileBreakpoint = 1150; // Width in pixels for mobile breakpoint
    isCompactMode = false; // For floating filter card
    compactModeHeightThreshold = 1200; // Height threshold for compact mode
    // Virtual rendering configuration
    readonly groupedCardOffset = 288;
    private readonly timelineCardSlotWidth = 296;
    private readonly timelineMarkerSlotWidth = 64;
    private readonly timelineAnchorGap = 280;
    private readonly timelineEndPadding = 360;
    itemSize = this.timelineCardSlotWidth; // Width per item for spacing calculation
    allTimelineItems: TimelineItem[] = []; // All items (for data)
    visibleTimelineItems: TimelineItem[] = []; // Only visible items (for rendering)
    viewportWidth = 0;
    scrollLeft = 0;
    bufferSize = 5; // Number of items to render outside viewport for smooth scrolling
    // Timeline dimensions
    totalDays = 0;
    pixelsPerDay = 150;
    totalWidth = 0;
    initialOffset = 350;
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
    // Search navigation
    searchResultIndices: number[] = [];
    currentSearchIndex: number = -1;
    // Service subscription
    private eventsSubscription?: Subscription;
    private scrollSubscription?: Subscription;
    timelineEvents: TimelineEvent[] = [];
    timelineAnniversaries: TimelineAnniversary[] = [];
    timelineCalculation: TimelineCalculation | null = null;
    hoverAvatar: TimelineAvatar | null = null;
    hoverAvatarPosition = { left: -10000, top: -10000 };
    private readonly avatarHoverCardWidth = 182;
    private readonly avatarHoverCardHeight = 72;
    private avatarHoverHideTimer?: number;
    // Drag to scroll properties
    isDragging = false;
    hasDragged = false;
    private isDragArmed = false;
    private readonly dragActivationThreshold = 12;
    private startX = 0;
    private scrollStart = 0;
    private dragAnimationFrame?: number;
    private boundMouseMove = this.onMouseMove.bind(this);
    private boundMouseUp = this.onMouseUp.bind(this);
    // Velocity scrolling properties
    private lastX = 0;
    private lastTime = 0;
    private velocityX = 0;
    private momentumAnimation?: number;
    private isDecelerating = false;
    // Dynamic scaling properties
    cardScale = 1;
    cardVerticalOffsetBottom = 60;  // For items below the timeline
    cardVerticalOffsetTop = 60;     // For items above the timeline
    cardTransformOffset = 25;
    private resizeObserver?: ResizeObserver;
    private viewInitialized = false;
    private destroyed = false;
    private initialTodayScrollDone = false;
    private initialTodayScrollScheduled = false;
    readonly timelineLoading$ = this.timelineService.loading$;
    readonly timelineError$ = this.timelineService.error$;
    constructor(
        private timelineService: TimelineService,
        private timelineAvatarService: TimelineAvatarService,
        private timelinePredictionService: TimelinePredictionService,
        private dialog: MatDialog,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef,
        private meta: Meta,
        private title: Title
    ) {
        this.title.setTitle('Timeline | uma.moe');
        this.meta.addTags([
            { name: 'description', content: 'Check the estimated release timeline for the global version. When does your favorite character release?' },
            { property: 'og:title', content: 'Timeline | uma.moe Umamusume Tools' },
            { property: 'og:description', content: 'Check the estimated release timeline for the global version. When does your favorite character release?' },
            { property: 'og:type', content: 'website' },
            { property: 'og:url', content: 'https://uma.moe/timeline' },
            { property: 'og:image', content: 'https://uma.moe/assets/logo.webp' },
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: 'Timeline | uma.moe' },
            { name: 'twitter:description', content: 'Check the estimated release timeline for the global version. When does your favorite character release?' },
            { name: 'twitter:image', content: 'https://uma.moe/assets/logo.webp' }
        ]);
    }
    @HostListener('window:resize', ['$event'])
    onResize(event: any): void {
        this.checkMobileBreakpoint();
        this.checkCompactMode();
        if (!this.isMobile) {
            this.calculateDynamicScale();
            // Recalculate viewport for desktop timeline
            this.updateVisibleItems();
        }
    }
    @HostListener('wheel', ['$event'])
    onWheel(event: WheelEvent): void {
        if (!this.timelineContainer || this.isMobile) return;
        if (this.isTimelineInteractiveTarget(event.target, '.event-avatar-strip-shell, .timeline-avatar-hover-card')) {
            return;
        }

        this.hideAvatarHover();
        // Always handle wheel events for horizontal scrolling on the timeline
        event.preventDefault();
        const container = this.timelineContainer.nativeElement;
        // Determine scroll direction and amount
        let scrollAmount = 0;
        // If it's already a horizontal wheel event (some mice/trackpads support this)
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            scrollAmount = event.deltaX;
        } else {
            // Convert vertical wheel to horizontal scroll
            scrollAmount = event.deltaY;
        }
        // Multiply by 10 for faster scrolling as requested
        scrollAmount *= 10;
        // Apply the scroll
        container.scrollLeft += scrollAmount;
    }
    @HostListener('window:keydown', ['$event'])
    onKeyDown(event: KeyboardEvent): void {
        if (!this.timelineContainer || this.isMobile) return;
        // Only handle if timeline is focused or no input is focused
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            return;
        }
        const container = this.timelineContainer.nativeElement;
        const scrollAmount = 300; // Pixels to scroll
        const pageScrollAmount = container.clientWidth * 0.8; // 80% of viewport for page up/down
        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                container.scrollLeft -= scrollAmount;
                break;
            case 'ArrowRight':
                event.preventDefault();
                container.scrollLeft += scrollAmount;
                break;
            case 'PageUp':
                event.preventDefault();
                container.scrollLeft -= pageScrollAmount;
                break;
            case 'PageDown':
                event.preventDefault();
                container.scrollLeft += pageScrollAmount;
                break;
            case 'Home':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.scrollToStart();
                }
                break;
            case 'End':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.scrollToEnd();
                }
                break;
        }
    }
    // Drag to scroll functionality
    onMouseDown(event: MouseEvent): void {
        if (!this.timelineContainer || this.isMobile) return;
        // Only handle left mouse button, ignore middle mouse button for page scrolling
        if (event.button !== 0) return;
        if (this.isTimelineInteractiveTarget(event.target)) {
            this.hasDragged = false;
            this.stopTimelineMomentum();
            return;
        }

        this.hideAvatarHover();
        this.isDragArmed = true;
        this.hasDragged = false;
        this.isDecelerating = false;
        this.stopTimelineMomentum();
        const container = this.timelineContainer.nativeElement;
        // Get the exact mouse position relative to the page
        this.startX = event.pageX;
        this.scrollStart = container.scrollLeft;
        // Initialize velocity tracking
        this.lastX = event.pageX;
        this.lastTime = performance.now();
        this.velocityX = 0;
        // Add global mouse event listeners
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }
    private onMouseMove(event: MouseEvent): void {
        if ((!this.isDragArmed && !this.isDragging) || !this.timelineContainer) return;
        const container = this.timelineContainer.nativeElement;
        const currentTime = performance.now();
        const currentX = event.pageX;
        const deltaX = currentX - this.startX;

        if (!this.isDragging) {
            if (Math.abs(deltaX) < this.dragActivationThreshold) {
                return;
            }

            this.beginTimelineDrag(container);
        }

        event.preventDefault();
        // Check if we've moved enough to consider it a drag
        if (!this.hasDragged) {
            this.hasDragged = true;
        }
        // Calculate velocity for momentum
        const timeDelta = currentTime - this.lastTime;
        if (timeDelta > 0) {
            this.velocityX = (currentX - this.lastX) / timeDelta * 16; // Convert to pixels per frame (60fps)
        }
        this.lastX = currentX;
        this.lastTime = currentTime;
        // Calculate new scroll position
        const newScrollLeft = this.scrollStart - deltaX;
        // Apply scroll immediately without requestAnimationFrame for instant feedback
        container.scrollLeft = newScrollLeft;
        // Update visible items without requestAnimationFrame for immediate response
        this.updateVisibleItemsSync();
    }
    private onMouseUp(event: MouseEvent): void {
        if (!this.isDragArmed && !this.isDragging) return;
        const wasDragging = this.isDragging;
        this.isDragArmed = false;
        this.isDragging = false;
        // Remove global mouse event listeners
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);

        if (!wasDragging) {
            this.hasDragged = false;
            return;
        }

        // Reset cursor and user selection
        if (this.timelineContainer) {
            const container = this.timelineContainer.nativeElement;
            this.endTimelineDrag(container);
        }
        document.body.style.userSelect = '';
        // Start momentum scrolling if velocity is significant
        if (Math.abs(this.velocityX) > 0.5) {
            this.startMomentum();
        }

        window.setTimeout(() => {
            this.hasDragged = false;
        }, 0);
    }
    private beginTimelineDrag(container: HTMLElement): void {
        this.isDragging = true;
        this.isDragArmed = false;
        this.blurActiveTimelineElement(container);
        container.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        container.classList.add('is-dragging');
    }
    private endTimelineDrag(container: HTMLElement): void {
        container.style.cursor = '';
        container.classList.remove('is-dragging');
    }
    private blurActiveTimelineElement(container: HTMLElement): void {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
            activeElement.blur();
        }
    }
    private isTimelineInteractiveTarget(target: EventTarget | null, extraSelector = ''): boolean {
        const targetElement = this.getTimelineEventElement(target);
        if (!targetElement) {
            return false;
        }

        const interactiveSelector = [
            'a',
            'button',
            'input',
            'textarea',
            'select',
            '[role="button"]',
            '[role="link"]',
            '.mat-mdc-button-base',
            '.mat-mdc-checkbox',
            '.event-card',
            '.event-avatar-strip-shell',
            '.timeline-avatar-hover-card',
            extraSelector
        ].filter(Boolean).join(',');

        return targetElement.closest(interactiveSelector) !== null;
    }
    private getTimelineEventElement(target: EventTarget | null): Element | null {
        if (target instanceof Element) {
            return target;
        }

        if (target instanceof Node) {
            return target.parentElement;
        }

        return null;
    }
    private stopTimelineMomentum(): void {
        this.isDecelerating = false;
        this.velocityX = 0;
        if (this.momentumAnimation) {
            cancelAnimationFrame(this.momentumAnimation);
            this.momentumAnimation = undefined;
        }
    }
    private startMomentum(): void {
        if (!this.timelineContainer || this.isDecelerating) return;
        this.isDecelerating = true;
        const container = this.timelineContainer.nativeElement;
        const friction = 0.92; // Slightly lower friction for smoother deceleration
        const minVelocity = 0.1; // Minimum velocity before stopping
        const animate = () => {
            if (!this.isDecelerating || !this.timelineContainer) return;
            // Apply velocity to scroll position
            container.scrollLeft -= this.velocityX;
            // Apply friction
            this.velocityX *= friction;
            // Update visible items
            this.updateVisibleItemsSync();
            // Continue animation if velocity is significant
            if (Math.abs(this.velocityX) > minVelocity) {
                this.momentumAnimation = requestAnimationFrame(animate);
            } else {
                // Stop momentum
                this.isDecelerating = false;
                this.velocityX = 0;
                this.momentumAnimation = undefined;
                // Final update
                this.cdr.detectChanges();
            }
        };
        animate();
    }
    ngOnInit(): void {
        // Check initial screen size
        this.checkMobileBreakpoint();
        this.checkCompactMode();
        // Subscribe to timeline data from the service
        this.eventsSubscription = combineLatest([
            this.timelineService.events$,
            this.timelineService.anniversaries$,
            this.timelineService.calculation$
        ]).subscribe(([events, anniversaries, calculation]) => {
            this.timelineEvents = events;
            this.timelineAnniversaries = anniversaries;
            this.timelineCalculation = calculation;
            if (this.isMobile) {
                this.clearDesktopTimelineItems();
                this.cdr.detectChanges();
                return;
            }
            this.generateTimelineItems();
            this.updateVisibleItemsSync(true);
            // Trigger change detection manually
            this.cdr.detectChanges();
            this.scheduleInitialScrollToToday();
        });
        if (!this.isMobile) {
            this.generateTimelineItems();
        }
    }
    ngAfterViewInit(): void {
        this.viewInitialized = true;
        this.setupScrollListener();
        this.setupResizeObserver();
        this.calculateDynamicScale();
        // Detect if we're in Chrome
        const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        // Chrome-specific scroll fix: Force reflow to ensure scrollbars are recognized
        setTimeout(() => {
            if (this.timelineContainer) {
                const container = this.timelineContainer.nativeElement;
                // Chrome-specific optimizations
                if (isChrome) {
                    // Disable smooth scrolling for drag operations
                    container.style.scrollBehavior = 'auto';
                    // Force GPU acceleration
                    container.style.transform = 'translateZ(0)';
                    container.style.willChange = 'scroll-position';
                }
                // Force Chrome to recalculate scrollable area
                const originalOverflow = container.style.overflowX;
                container.style.overflowX = 'hidden';
                container.offsetHeight; // Force reflow
                container.style.overflowX = originalOverflow || 'auto';
                // Additional Chrome fix: temporarily adjust width to trigger scrollbar recognition
                const track = container.querySelector('.timeline-track') as HTMLElement;
                if (track) {
                    const originalWidth = track.style.width;
                    track.style.width = (track.offsetWidth + 1) + 'px';
                    track.offsetWidth; // Force reflow
                    track.style.width = originalWidth;
                }
                // Initial viewport calculation
                this.updateVisibleItems();
            }
            this.scheduleInitialScrollToToday();
        }, 100);
        this.updateVisibleItemsSync(true);
        // Trigger change detection manually
        this.cdr.detectChanges();
    }
    ngOnDestroy(): void {
        this.destroyed = true;
        this.cancelAvatarHoverHide();
        if (this.eventsSubscription) {
            this.eventsSubscription.unsubscribe();
        }
        if (this.scrollSubscription) {
            this.scrollSubscription.unsubscribe();
        }
        // Clean up drag event listeners
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
        this.isDragArmed = false;
        this.isDragging = false;
        if (this.timelineContainer) {
            this.endTimelineDrag(this.timelineContainer.nativeElement);
        }
        // Clean up animations
        if (this.dragAnimationFrame) {
            cancelAnimationFrame(this.dragAnimationFrame);
        }
        if (this.momentumAnimation) {
            cancelAnimationFrame(this.momentumAnimation);
        }
        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        // Reset body styles
        document.body.style.userSelect = '';
    }
    private generateTimelineItems(): void {
        this.allTimelineItems = [];
        // First, calculate the actual end date based on the last event
        let actualEndDate = new Date(this.globalReleaseDate);
        if (this.timelineEvents.length > 0) {
            // Find the latest event date
            const latestEventDate = this.timelineEvents.reduce((latest, event) => {
                const eventDate = event.globalReleaseDate || event.jpReleaseDate;
                return eventDate > latest ? eventDate : latest;
            }, new Date(this.globalReleaseDate));
            // Add minimal padding after the last event (e.g., 2 weeks)
            actualEndDate = new Date(latestEventDate);
            actualEndDate.setDate(actualEndDate.getDate() + 14);
        } else {
            // Fallback to original end date if no events
            actualEndDate = this.endDate;
        }
        this.totalDays = Math.ceil((actualEndDate.getTime() - this.globalReleaseDate.getTime()) / (1000 * 60 * 60 * 24));
        this.updateTimelineWidth();
        const currentDate = new Date(this.globalReleaseDate);
        let position = 0;
        // Add rocket marker for global release (just a marker, no card)
        this.allTimelineItems.push({
            date: new Date(this.globalReleaseDate),
            label: 'Global Launch',
            type: 'milestone',
            position: this.initialOffset
        });
        // Generate anniversary markers
        this.generateAnniversaryMarkers(actualEndDate);
        // Generate events from service data with filtering and grouping
        const filteredEvents = this.timelineEvents.filter(event => {
            // Apply event type filters
            if (event.type === EventType.CHARACTER_BANNER && !this.eventFilters.showCharacters) return false;
            if (event.type === EventType.SUPPORT_CARD_BANNER && !this.eventFilters.showSupports) return false;
            if (event.type === EventType.PAID_BANNER && !this.eventFilters.showPaidBanners) return false;
            if (event.type === EventType.STORY_EVENT && !this.eventFilters.showStoryEvents) return false;
            if (event.type === EventType.CHAMPIONS_MEETING && !this.eventFilters.showChampionsMeetings) return false;
            if (event.type === EventType.LEGEND_RACE && !this.eventFilters.showLegendRaces) return false;
            if (event.type === EventType.CAMPAIGN && !this.eventFilters.showCampaigns) return false;
            // Handle other event types (updates, etc.) under story events
            if (event.type !== EventType.CHARACTER_BANNER &&
                event.type !== EventType.SUPPORT_CARD_BANNER &&
                event.type !== EventType.PAID_BANNER &&
                event.type !== EventType.STORY_EVENT &&
                event.type !== EventType.CHAMPIONS_MEETING &&
                event.type !== EventType.LEGEND_RACE &&
                event.type !== EventType.CAMPAIGN &&
                !this.eventFilters.showStoryEvents) return false;
            // Apply search filter - only search in tags (characters and support cards)
            if (this.eventFilters.searchQuery.trim()) {
                if (!this.timelineAvatarService.eventMatchesSearch(event, this.eventFilters.searchQuery)) {
                    return false;
                }
            }
            const eventDate = event.globalReleaseDate || event.jpReleaseDate;
            return eventDate >= this.globalReleaseDate;
        });
        // Group events by date (same day)
        const eventsByDate = new Map<string, { date: Date, events: TimelineEvent[] }>();
        filteredEvents.forEach(event => {
            const eventDate = event.globalReleaseDate || event.jpReleaseDate;
            // Use date string as key for grouping, but preserve the actual Date object
            const dateKey = `${eventDate.getUTCFullYear()}-${eventDate.getUTCMonth()}-${eventDate.getUTCDate()}`;
            if (!eventsByDate.has(dateKey)) {
                eventsByDate.set(dateKey, { date: eventDate, events: [] });
            }
            eventsByDate.get(dateKey)!.events.push(event);
        });
        // Generate timeline items for grouped events
        // Side assignment is deferred to assignSequentialPositions for optimal packing
        const sortedEventDates = Array.from(eventsByDate.entries())
            .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime());
        sortedEventDates.forEach(([dateKey, { date: eventDate, events }]) => {
            const daysSinceStart = Math.ceil((eventDate.getTime() - this.globalReleaseDate.getTime()) / (1000 * 60 * 60 * 24));
            const basePosition = daysSinceStart * this.pixelsPerDay;
            if (events.length === 1) {
                // Single event - display normally (side assigned later)
                this.allTimelineItems.push({
                    date: eventDate,
                    label: events[0].title,
                    type: 'event',
                    position: basePosition + this.initialOffset,
                    side: undefined,
                    eventData: events[0],
                    isGrouped: false
                });
            } else {
                // Multiple events on same date - display side by side (side assigned later)
                events.forEach((event, groupIndex) => {
                    this.allTimelineItems.push({
                        date: eventDate,
                        label: event.title,
                        type: 'event',
                        position: basePosition + this.initialOffset,
                        side: undefined,
                        eventData: event,
                        isGrouped: true,
                        groupIndex: groupIndex,
                        groupedEvents: events
                    });
                });
            }
        });
        // Generate year markers up to the actual end date, but don't extend timeline unnecessarily
        const yearMarkerEndDate = new Date(Math.min(actualEndDate.getTime(), new Date(this.globalReleaseDate.getFullYear() + 10, 0, 1).getTime()));
        while (currentDate <= yearMarkerEndDate) {
            const daysSinceStart = Math.ceil((currentDate.getTime() - this.globalReleaseDate.getTime()) / (1000 * 60 * 60 * 24));
            position = daysSinceStart * this.pixelsPerDay;
            // Add year markers only for January 1st and only if it's not too far in the future
            if (currentDate.getMonth() === 0 && currentDate.getDate() === 1 && currentDate.getFullYear() >= this.globalReleaseDate.getFullYear()) {
                this.allTimelineItems.push({
                    date: new Date(currentDate),
                    label: currentDate.getFullYear().toString(),
                    type: 'year',
                    position: position + this.initialOffset,
                });
            }
            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
            currentDate.setDate(1);
        }
        // Add today marker if it's within our timeline range
        const today = new Date();
        if (today >= this.globalReleaseDate && today <= actualEndDate) {
            // Get the start of today in UTC
            const todayStartUTC = new Date(Date.UTC(
                today.getUTCFullYear(),
                today.getUTCMonth(),
                today.getUTCDate(),
                0, 0, 0, 0
            ));
            // Calculate days since global release to the start of today (UTC)
            // Use Math.floor for correct day count
            const daysSinceStart = Math.floor((todayStartUTC.getTime() - this.globalReleaseDate.getTime()) / (1000 * 60 * 60 * 24));
            // Calculate how far through the current day we are in UTC (0.0 to 1.0)
            // Directly use UTC hours and minutes from the current time
            const todayProgress = (today.getUTCHours() * 60 + today.getUTCMinutes()) / (24 * 60);
            // Position today marker: base position + progress through the day
            const todayPosition = (daysSinceStart + todayProgress) * this.pixelsPerDay;
            this.allTimelineItems.push({
                date: today, // Just use the original Date object
                label: 'Today',
                type: 'today',
                position: todayPosition + this.initialOffset
            });
        }
        // Reassign positions for seamless sequential layout
        this.assignSequentialPositions();
        // Now interpolate overlay markers (today, anniversary) into correct relative positions
        this.interpolateOverlayMarkers();
        // After generating all items, update visible items
        this.updateVisibleItems();
    }
    private updateTimelineWidth(): void {
        this.totalWidth = this.totalDays * this.pixelsPerDay;
    }
    /**
     * Reassigns positions so cards chain seamlessly.
     * Side assignment is done dynamically: each date group goes on
     * whichever side (top/bottom) has more room, producing the tightest
     * possible packing.
     */
    private assignSequentialPositions(): void {
        // Sort all items by date for sequential placement
        this.allTimelineItems.sort((a, b) => a.date.getTime() - b.date.getTime());
        const CARD_SLOT_WIDTH = this.timelineCardSlotWidth;
        const GROUPED_CARD_EXTRA = this.groupedCardOffset;
        const MARKER_SLOT_WIDTH = this.timelineMarkerSlotWidth;
        const ANCHOR_GAP = this.timelineAnchorGap;
        // Overlay markers (today, anniversary) should not participate in layout;
        // they get interpolated afterward.
        const OVERLAY_TYPES = new Set(['today', 'anniversary']);
        // Track end positions per side and a shared last-anchor position
        let topEndPosition = this.initialOffset;
        let bottomEndPosition = this.initialOffset;
        let lastAnchor = this.initialOffset - ANCHOR_GAP;
        let i = 0;
        while (i < this.allTimelineItems.length) {
            const currentItem = this.allTimelineItems[i];
            // Skip overlay markers – they'll be interpolated later
            if (OVERLAY_TYPES.has(currentItem.type)) {
                i++;
                continue;
            }
            const dateKey = `${currentItem.date.getUTCFullYear()}-${currentItem.date.getUTCMonth()}-${currentItem.date.getUTCDate()}`;
            // Collect all non-overlay items sharing the same date
            const sameDateItems: TimelineItem[] = [];
            while (i < this.allTimelineItems.length) {
                const item = this.allTimelineItems[i];
                if (OVERLAY_TYPES.has(item.type)) { i++; continue; }
                const itemKey = `${item.date.getUTCFullYear()}-${item.date.getUTCMonth()}-${item.date.getUTCDate()}`;
                if (itemKey !== dateKey) break;
                sameDateItems.push(item);
                i++;
            }
            if (sameDateItems.length === 0) continue;
            // Determine slot width based on content
            const eventItems = sameDateItems.filter(item => item.type === 'event');
            const maxGroupIndex = eventItems.reduce((max, e) => Math.max(max, e.groupIndex || 0), 0);
            let slotWidth: number;
            if (eventItems.length > 0) {
                slotWidth = CARD_SLOT_WIDTH + maxGroupIndex * GROUPED_CARD_EXTRA;
            } else {
                slotWidth = MARKER_SLOT_WIDTH;
            }
            const minFromAnchor = lastAnchor + ANCHOR_GAP;
            // Dynamically pick side for event groups: whichever lane lets us
            // place the card earliest (i.e. has the smallest end position).
            let side: 'top' | 'bottom' | undefined = sameDateItems[0].side;
            if (eventItems.length > 0 && !side) {
                const topCandidate = Math.max(topEndPosition, minFromAnchor);
                const bottomCandidate = Math.max(bottomEndPosition, minFromAnchor);
                side = topCandidate <= bottomCandidate ? 'top' : 'bottom';
                // Assign the chosen side to all items in this group
                for (const item of sameDateItems) {
                    item.side = side;
                }
            }
            // Calculate position
            let position: number;
            if (side === 'top') {
                position = Math.max(topEndPosition, minFromAnchor);
            } else if (side === 'bottom') {
                position = Math.max(bottomEndPosition, minFromAnchor);
            } else {
                position = Math.max(topEndPosition, bottomEndPosition, minFromAnchor);
            }
            // Assign position to all items on this date
            for (const item of sameDateItems) {
                item.position = position;
            }
            // Update tracking
            lastAnchor = position;
            if (side === 'top') {
                topEndPosition = position + slotWidth;
            } else if (side === 'bottom') {
                bottomEndPosition = position + slotWidth;
            } else {
                topEndPosition = position + slotWidth;
                bottomEndPosition = position + slotWidth;
            }
        }
        // Update total width based on sequential layout
        this.totalWidth = Math.max(topEndPosition, bottomEndPosition) + this.timelineEndPadding;
    }
    /**
     * After sequential positions are assigned, interpolate overlay markers
     * (today, anniversary) between their neighboring positioned items
     * based on actual dates so they sit at the correct relative position.
     */
    private interpolateOverlayMarkers(): void {
        const OVERLAY_TYPES = new Set(['today', 'anniversary']);
        // Collect positioned (non-overlay) items sorted by date for lookup
        const positionedItems = this.allTimelineItems
            .filter(item => !OVERLAY_TYPES.has(item.type))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        if (positionedItems.length === 0) return;
        for (const item of this.allTimelineItems) {
            if (!OVERLAY_TYPES.has(item.type)) continue;
            const itemTime = item.date.getTime();
            // Binary-ish search for neighbors
            let prevItem: TimelineItem | null = null;
            let nextItem: TimelineItem | null = null;
            for (let j = 0; j < positionedItems.length; j++) {
                if (positionedItems[j].date.getTime() <= itemTime) {
                    prevItem = positionedItems[j];
                } else {
                    nextItem = positionedItems[j];
                    break;
                }
            }
            if (prevItem && nextItem) {
                const timeDelta = nextItem.date.getTime() - prevItem.date.getTime();
                if (timeDelta > 0) {
                    const progress = (itemTime - prevItem.date.getTime()) / timeDelta;
                    item.position = prevItem.position + progress * (nextItem.position - prevItem.position);
                } else {
                    item.position = prevItem.position;
                }
            } else if (prevItem) {
                item.position = prevItem.position + 100;
            } else if (nextItem) {
                item.position = Math.max(this.initialOffset, nextItem.position - 100);
            }
        }
    }
    scrollToToday(behavior: ScrollBehavior = 'auto'): boolean {
        const todayItem = this.allTimelineItems.find(item => item.type === 'today');
        if (!todayItem || !this.timelineContainer) {
            return false;
        }
        const container = this.timelineContainer.nativeElement;
        const targetScrollLeft = Math.max(0, todayItem.position - (container.clientWidth / 2));
        if (typeof container.scrollTo === 'function') {
            container.scrollTo({ left: targetScrollLeft, behavior });
        } else {
            container.scrollLeft = targetScrollLeft;
        }
        this.updateVisibleItemsSync(true);
        return true;
    }
    scrollToStart(): void {
        if (this.timelineContainer) {
            this.timelineContainer.nativeElement.scrollLeft = 0;
        }
    }
    scrollToEnd(): void {
        if (this.timelineContainer) {
            this.timelineContainer.nativeElement.scrollLeft = this.totalWidth;
        }
    }
    private scheduleInitialScrollToToday(): void {
        if (
            this.initialTodayScrollDone ||
            this.initialTodayScrollScheduled ||
            !this.viewInitialized ||
            this.isMobile ||
            this.timelineEvents.length === 0 ||
            !this.timelineContainer ||
            !this.allTimelineItems.some(item => item.type === 'today')
        ) {
            return;
        }

        this.initialTodayScrollScheduled = true;
        void this.scrollToTodayAfterInitialLayout();
    }
    private async scrollToTodayAfterInitialLayout(): Promise<void> {
        try {
            await this.waitForFrames(2);
            if (this.destroyed || this.initialTodayScrollDone) {
                return;
            }

            if (this.scrollToToday('auto')) {
                this.initialTodayScrollDone = true;
                await this.waitForFrames(2);
                if (!this.destroyed) {
                    this.scrollToToday('auto');
                    this.cdr.detectChanges();
                }
            }
        } finally {
            this.initialTodayScrollScheduled = false;
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
    onScroll(event: Event): void {
        this.hideAvatarHover();
        // Handle scroll events if needed - keep minimal to avoid performance issues
    }
    getDateFromPosition(position: number): Date {
        if (this.allTimelineItems.length === 0) {
            return new Date(this.globalReleaseDate);
        }
        // Find the nearest item by position
        let closest = this.allTimelineItems[0];
        let closestDist = Math.abs(position - closest.position);
        for (const item of this.allTimelineItems) {
            const dist = Math.abs(position - item.position);
            if (dist < closestDist) {
                closest = item;
                closestDist = dist;
            }
        }
        return closest.date;
    }
    getCurrentScrollDate(): string {
        if (!this.timelineContainer) return '';
        const scrollPosition = this.timelineContainer.nativeElement.scrollLeft;
        const centerPosition = scrollPosition + (this.timelineContainer.nativeElement.clientWidth / 2);
        const date = this.getDateFromPosition(centerPosition);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    onImageError(event: any): void {
        const image = event.target as HTMLImageElement;
        image.style.display = 'none';
        const avatarLink = image.closest<HTMLElement>('.event-avatar-link, .ev-avatar-link');
        if (avatarLink) {
            avatarLink.style.display = 'none';
        }
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
    onAvatarStripWheel(event: WheelEvent): void {
        const strip = event.currentTarget as HTMLElement | null;
        if (!strip || strip.scrollWidth <= strip.clientWidth) {
            return;
        }

        this.hideAvatarHover();
        event.preventDefault();
        event.stopPropagation();

        const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? strip.clientWidth : 1;
        strip.scrollLeft += rawDelta * multiplier * 1.8;
    }
    scrollAvatarStripForward(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.releasePointerFocus(event);
        this.hideAvatarHover();

        const button = event.currentTarget as HTMLElement | null;
        const shell = button?.closest<HTMLElement>('.event-avatar-strip-shell');
        const strip = shell?.querySelector<HTMLElement>('.event-avatar-strip');
        if (!strip) {
            return;
        }

        const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
        const scrollAmount = Math.max(strip.clientWidth * 0.85, 84);
        strip.scrollLeft = Math.min(maxScrollLeft, strip.scrollLeft + scrollAmount);
    }
    getPredictionInsight(event?: TimelineEvent): TimelinePredictionInsight | null {
        return this.timelinePredictionService.buildInsight(event, this.timelineCalculation);
    }
    getTimelineEventTitle(event?: TimelineEvent): string {
        return this.timelineAvatarService.getEventDisplayTitle(event);
    }
    openPredictionDetails(event: TimelineEvent | undefined, item: TimelineItem | undefined, prediction: TimelinePredictionInsight | null, clickEvent?: MouseEvent): void {
        clickEvent?.preventDefault();
        clickEvent?.stopPropagation();
        this.releasePointerFocus(clickEvent);

        if (!event || !prediction) {
            return;
        }

        const data: TimelinePredictionDialogData = {
            event,
            insight: prediction,
            calculation: this.timelineCalculation,
            eventTypeLabel: this.eventTypeToLabel(event.type),
            displayTitle: this.getTimelineEventTitle(event),
            dateLabel: item ? this.formatDate(item) : this.formatPredictionEventDate(event)
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
    // TrackBy function to optimize *ngFor performance
    trackTimelineItem(index: number, item: TimelineItem): any {
        // Use a combination of position and date for unique tracking
        // This prevents unnecessary DOM updates when scrolling
        return `${item.position}-${item.date.getTime()}-${item.type}`;
    }
    // Filter methods
    onSearchChange(): void {
        // Only regenerate if search actually changed
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    private updateSearchResults(): void {
        this.searchResultIndices = [];
        this.currentSearchIndex = -1;
        if (!this.eventFilters.searchQuery.trim()) {
            return;
        }
        // Find all timeline items that match the search
        this.searchResultIndices = this.allTimelineItems
            .map((item: TimelineItem, index: number) => ({ item, index }))
            .filter(({ item }: { item: TimelineItem }) => {
                if (item.type !== 'event' || !item.eventData) return false;
                return this.timelineAvatarService.eventMatchesSearch(item.eventData, this.eventFilters.searchQuery);
            })
            .map(({ index }: { index: number }) => index);
    }
    jumpToNextResult(): void {
        if (this.searchResultIndices.length === 0) return;
        this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResultIndices.length;
        this.scrollToSearchResult();
    }
    jumpToPreviousResult(): void {
        if (this.searchResultIndices.length === 0) return;
        this.currentSearchIndex = this.currentSearchIndex <= 0
            ? this.searchResultIndices.length - 1
            : this.currentSearchIndex - 1;
        this.scrollToSearchResult();
    }
    private scrollToSearchResult(): void {
        if (this.currentSearchIndex === -1 || !this.timelineContainer) return;
        const resultIndex = this.searchResultIndices[this.currentSearchIndex];
        const targetItem = this.allTimelineItems[resultIndex];
        if (targetItem) {
            const scrollPosition = targetItem.position - (this.timelineContainer.nativeElement.clientWidth / 2);
            // Use immediate scroll instead of smooth scroll for faster navigation
            this.timelineContainer.nativeElement.scrollLeft = Math.max(0, scrollPosition);
            // Force immediate update of visible items
            this.updateVisibleItemsSync(true);
            this.cdr.detectChanges();
        }
    }
    getCurrentSearchPosition(): string {
        if (this.searchResultIndices.length === 0) return '';
        return `${this.currentSearchIndex + 1} of ${this.searchResultIndices.length}`;
    }
    hasSearchResults(): boolean {
        return this.searchResultIndices.length > 0;
    }
    toggleCharacterFilter(): void {
        this.eventFilters.showCharacters = !this.eventFilters.showCharacters;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    toggleSupportFilter(): void {
        this.eventFilters.showSupports = !this.eventFilters.showSupports;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    toggleStoryEventsFilter(): void {
        this.eventFilters.showStoryEvents = !this.eventFilters.showStoryEvents;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    toggleChampionsMeetingsFilter(): void {
        this.eventFilters.showChampionsMeetings = !this.eventFilters.showChampionsMeetings;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    toggleLegendRacesFilter(): void {
        this.eventFilters.showLegendRaces = !this.eventFilters.showLegendRaces;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    togglePaidBannersFilter(): void {
        this.eventFilters.showPaidBanners = !this.eventFilters.showPaidBanners;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    toggleCampaignsFilter(): void {
        this.eventFilters.showCampaigns = !this.eventFilters.showCampaigns;
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    getCampaignCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.CAMPAIGN).length;
    }
    getFilteredEventCount(): number {
        return this.timelineEvents.filter(event => {
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
            // Apply search filter - only search in tags (characters and support cards)
            if (this.eventFilters.searchQuery.trim()) {
                if (!this.timelineAvatarService.eventMatchesSearch(event, this.eventFilters.searchQuery)) {
                    return false;
                }
            }
            return true;
        }).length;
    }
    getTotalEventCount(): number {
        return this.timelineEvents.length;
    }
    private generateAnniversaryMarkers(endDate: Date): void {
        this.timelineAnniversaries.forEach(anniversary => {
            const globalAnniversaryDate = anniversary.globalDate;
            if (globalAnniversaryDate > endDate) return;

            // Calculate position using consistent UTC precision
            const daysSinceStart = Math.round((globalAnniversaryDate.getTime() - this.globalReleaseDate.getTime()) / (1000 * 60 * 60 * 24));
            const position = daysSinceStart * this.pixelsPerDay;
            this.allTimelineItems.push({
                date: new Date(globalAnniversaryDate),
                label: anniversary.label,
                type: 'anniversary',
                position: position + this.initialOffset
            });
        });
    }
    // Chrome scroll fix utility method
    forceScrollbarUpdate(): void {
        if (this.timelineContainer) {
            const container = this.timelineContainer.nativeElement;
            // Force Chrome to recalculate scrollbars
            const currentScroll = container.scrollLeft;
            container.style.display = 'none';
            container.offsetHeight; // Force reflow
            container.style.display = '';
            container.scrollLeft = currentScroll;
        }
    }
    // Virtual scrolling implementation
    private updateVisibleItems(): void {
        if (!this.timelineContainer) {
            // Initial load: show items that would be visible at scroll position 0
            // Since items start at initialOffset, we want to show items from that position
            const initialViewportEnd = this.initialOffset + 1200; // Assume ~1200px viewport width initially
            this.visibleTimelineItems = this.allTimelineItems.filter(item =>
                item.position <= initialViewportEnd
            ).slice(0, 100); // Increased from 50 to 100 for initial load
            return;
        }
        const containerElement = this.timelineContainer.nativeElement;
        let newScrollLeft = containerElement.scrollLeft;
        const newViewportWidth = containerElement.clientWidth;
        // Normalize scroll position to prevent negative values from causing issues
        newScrollLeft = Math.max(0, newScrollLeft);
        // Only recalculate if scroll position or viewport size changed significantly
        if (Math.abs(newScrollLeft - this.scrollLeft) < 10 &&
            Math.abs(newViewportWidth - this.viewportWidth) < 10 &&
            this.visibleTimelineItems.length > 0) { // Don't skip if no items are visible
            return; // Skip update if change is minimal
        }
        this.viewportWidth = newViewportWidth;
        this.scrollLeft = newScrollLeft;
        // Use much larger buffer to prevent items from disappearing
        const generousBufferSize = this.bufferSize * 4; // Increased from 2 to 4
        const bufferWidth = generousBufferSize * this.itemSize;
        // Calculate viewport bounds very generously
        let viewportStart: number;
        let viewportEnd: number;
        if (this.scrollLeft <= this.initialOffset) {
            // When at or near the beginning, always show items from position 0
            viewportStart = -bufferWidth;
            viewportEnd = this.scrollLeft + this.viewportWidth + bufferWidth;
        } else {
            // Normal scrolling - use generous buffers
            viewportStart = Math.max(-bufferWidth, this.scrollLeft - bufferWidth);
            viewportEnd = this.scrollLeft + this.viewportWidth + bufferWidth;
        }
        // Use more efficient filtering for frequent updates
        const newVisibleItems: TimelineItem[] = [];
        for (let i = 0; i < this.allTimelineItems.length; i++) {
            const item = this.allTimelineItems[i];
            const itemStart = item.position;
            const itemWidth = item.isGrouped ?
                ((item.groupIndex || 0) * this.groupedCardOffset + this.timelineCardSlotWidth) :
                this.timelineCardSlotWidth;
            const itemEnd = itemStart + itemWidth;
            if (itemEnd >= viewportStart && itemStart <= viewportEnd) {
                newVisibleItems.push(item);
            }
            // Remove early exit optimization to ensure we don't miss items
            // Better to check all items than risk missing some
        }
        // Multiple fallback strategies if no items are visible
        if (newVisibleItems.length === 0 && this.allTimelineItems.length > 0) {
            console.warn('No items visible in updateVisibleItems, applying fallbacks');
            // Strategy 1: Mega buffer around scroll position
            const megaBufferStart = this.scrollLeft - (this.viewportWidth * 2);
            const megaBufferEnd = this.scrollLeft + (this.viewportWidth * 3);
            for (let i = 0; i < this.allTimelineItems.length; i++) {
                const item = this.allTimelineItems[i];
                if (item.position >= megaBufferStart && item.position <= megaBufferEnd) {
                    newVisibleItems.push(item);
                }
            }
            // Strategy 2: Show first items if still empty
            if (newVisibleItems.length === 0) {
                newVisibleItems.push(...this.allTimelineItems.slice(0, 100));
            }
        }
        this.visibleTimelineItems = newVisibleItems;
        if (!environment.production) {
        }
    }
    // Synchronous version for immediate scroll updates (no Angular zone)
    private updateVisibleItemsSync(isInitial?: boolean): void {
        if (!this.timelineContainer) {
            return;
        }
        const containerElement = this.timelineContainer.nativeElement;
        let newScrollLeft = containerElement.scrollLeft;
        const newViewportWidth = containerElement.clientWidth;
        // Normalize scroll position to prevent negative values from causing issues
        newScrollLeft = Math.max(0, newScrollLeft);
        // Only recalculate if scroll position changed significantly
        if (Math.abs(newScrollLeft - this.scrollLeft) < 5 && isInitial == undefined) {
            return; // Skip update if change is very minimal during fast scrolling
        }
        this.viewportWidth = newViewportWidth;
        this.scrollLeft = newScrollLeft;
        // Use much larger buffer to prevent items from disappearing
        // Better to render too much than have things pop in and out
        const generousBufferSize = this.bufferSize * 1; // Increased from 2 to 6
        const bufferWidth = generousBufferSize * this.itemSize;
        // Calculate viewport bounds very generously
        // Always include items from the beginning when scrollLeft is small
        let viewportStart: number;
        let viewportEnd: number;
        if (this.scrollLeft <= this.initialOffset) {
            // When at or near the beginning, always show items from position 0
            viewportStart = -bufferWidth;
            viewportEnd = this.scrollLeft + this.viewportWidth + bufferWidth;
        } else {
            // Normal scrolling - use generous buffers
            viewportStart = Math.max(-bufferWidth, this.scrollLeft - bufferWidth);
            viewportEnd = this.scrollLeft + this.viewportWidth + bufferWidth;
        }
        // Fast filtering for immediate updates
        const newVisibleItems: TimelineItem[] = [];
        if (!environment.production) {
        }
        for (let i = 0; i < this.allTimelineItems.length; i++) {
            const item = this.allTimelineItems[i];
            const itemStart = item.position;
            // Calculate item end position more accurately
            const itemWidth = item.isGrouped ?
                ((item.groupIndex || 0) * this.groupedCardOffset + this.timelineCardSlotWidth) :
                this.timelineCardSlotWidth;
            const itemEnd = itemStart + itemWidth;
            // Very generous visibility check - include items that might be partially visible
            const isVisible = itemEnd >= viewportStart && itemStart <= viewportEnd;
            if (isVisible) {
                newVisibleItems.push(item);
            }
        }
        // Always ensure we have visible items - multiple fallback strategies
        if (newVisibleItems.length === 0 && this.allTimelineItems.length > 0) {
            console.warn('No items visible, applying fallback strategies');
            // Strategy 1: Show items around current scroll position with huge buffer
            const megaBufferStart = this.scrollLeft - (this.viewportWidth * 2);
            const megaBufferEnd = this.scrollLeft + (this.viewportWidth * 3);
            for (let i = 0; i < this.allTimelineItems.length; i++) {
                const item = this.allTimelineItems[i];
                if (item.position >= megaBufferStart && item.position <= megaBufferEnd) {
                    newVisibleItems.push(item);
                }
            }
            // Strategy 2: If still nothing, show first N items (beginning of timeline)
            if (newVisibleItems.length === 0) {
                console.warn('Mega buffer failed, showing first 50 items');
                newVisibleItems.push(...this.allTimelineItems.slice(0, 50));
            }
            // Strategy 3: If STILL nothing, show items around initialOffset
            if (newVisibleItems.length === 0) {
                console.warn('All strategies failed, showing items around initialOffset');
                for (let i = 0; i < this.allTimelineItems.length; i++) {
                    const item = this.allTimelineItems[i];
                    if (item.position >= (this.initialOffset - 1000) && item.position <= (this.initialOffset + 2000)) {
                        newVisibleItems.push(item);
                    }
                }
            }
        }
        this.visibleTimelineItems = newVisibleItems;
        // Remove the arbitrary limit - let it render more items if needed
        // The user prefers too many items over items disappearing
        if (!environment.production) {
        }
    }
    private setupScrollListener(): void {
        if (this.timelineContainer) {
            this.scrollSubscription = new Subscription();
            // Use immediate + throttled scroll updates for smooth rendering during scroll
            this.ngZone.runOutsideAngular(() => {
                let scrollTimeout: number;
                let lastUpdateTime = 0;
                const throttleDelay = 8; // ~120fps for immediate updates during scroll
                const scrollHandler = () => {
                    const now = performance.now();
                    // Immediate update if enough time has passed (throttled to ~120fps)
                    if (now - lastUpdateTime >= throttleDelay) {
                        lastUpdateTime = now;
                        // Update visible items outside Angular zone for better performance
                        this.updateVisibleItemsSync();
                        // Trigger change detection manually
                        this.cdr.detectChanges();
                    }
                    // Also schedule a cleanup update after scrolling stops
                    clearTimeout(scrollTimeout);
                    scrollTimeout = window.setTimeout(() => {
                        this.ngZone.run(() => {
                            this.updateVisibleItems();
                            this.cdr.detectChanges();
                        });
                    }, 50); // Cleanup after 50ms of no scrolling
                };
                this.timelineContainer.nativeElement.addEventListener('scroll', scrollHandler, { passive: true });
                if (this.scrollSubscription) {
                    this.scrollSubscription.add(() => {
                        this.timelineContainer.nativeElement.removeEventListener('scroll', scrollHandler);
                        clearTimeout(scrollTimeout);
                    });
                }
            });
        }
    }
    private checkMobileBreakpoint(): void {
        const wasIsMobile = this.isMobile;
        this.isMobile = window.innerWidth < this.mobileBreakpoint;
        if (wasIsMobile !== this.isMobile) {
            if (this.isMobile) {
                this.clearDesktopTimelineItems();
            } else {
                this.generateTimelineItems();
                this.updateVisibleItemsSync(true);
                this.scheduleInitialScrollToToday();
            }
            this.cdr.detectChanges();
        }
    }
    private checkCompactMode(): void {
        const wasCompactMode = this.isCompactMode;
        this.isCompactMode = window.innerHeight < this.compactModeHeightThreshold;
        if (wasCompactMode !== this.isCompactMode) {
            this.cdr.detectChanges();
        }
    }
    private clearDesktopTimelineItems(): void {
        this.allTimelineItems = [];
        this.visibleTimelineItems = [];
        this.totalWidth = 0;
    }
    eventTypeToLabel(type: EventType | undefined): string {
        switch (type) {
            case EventType.CHARACTER_BANNER:
                return 'Character Banner';
            case EventType.SUPPORT_CARD_BANNER:
                return 'Support Card Banner';
            case EventType.PAID_BANNER:
                return 'Paid Banner';
            case EventType.STORY_EVENT:
                return 'Story Event';
            case EventType.CHAMPIONS_MEETING:
                return 'Champions Meeting';
            case EventType.LEGEND_RACE:
                return 'Legend Race';
            case EventType.CAMPAIGN:
                return 'Mission Campaign';
            default:
                return 'Unknown Event';
        }
    }
    // Debug method for timeline item clicks
    onTimelineItemClick(item: TimelineItem): void {
        if (!environment.production) {
        }
    }
    onLinkClick(event: MouseEvent): void {
        if (this.hasDragged) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        this.releasePointerFocus(event);
    }
    private releasePointerFocus(event?: MouseEvent): void {
        if (!event || event.detail === 0) {
            return;
        }

        const target = event.currentTarget;
        if (target instanceof HTMLElement) {
            window.setTimeout(() => target.blur(), 0);
        }
    }
    // Format date to ensure consistent display in user's local timezone
    formatDate(item: TimelineItem): string {
        if (!item.date) return '';
        // Define reusable date formatting options (displays in user's local timezone)
        const dateOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        // Compact format for date ranges (no year if same year)
        const compactDateOptions: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric'
        };
        const formatSingleDate = (date: Date): string => {
            return date.toLocaleDateString('en-US', dateOptions);
        };
        const formatDateRange = (startDate: Date, endDate: Date, isUnconfirmed = false): string => {
            const prefix = isUnconfirmed ? '~' : '';
            // If same year, use compact format for start date
            if (startDate.getFullYear() === endDate.getFullYear()) {
                const startStr = startDate.toLocaleDateString('en-US', compactDateOptions);
                const endStr = endDate.toLocaleDateString('en-US', dateOptions);
                return `${prefix}${startStr} – ${endStr}`; // Using en dash (–) instead of "to"
            }
            // Different years, show full dates
            return `${prefix}${formatSingleDate(startDate)} – ${formatSingleDate(endDate)}`;
        };
        // Single date items
        const singleDateTypes = ['milestone', 'today', 'year', 'anniversary'] as const;
        if (singleDateTypes.includes(item.type as any)) {
            return formatSingleDate(item.date);
        }
        // Event items with potential date ranges
        if (item.eventData) {
            const isUnconfirmed = !item.eventData.isConfirmed;
            if (item.eventData.estimatedEndDate) {
                return formatDateRange(item.date, item.eventData.estimatedEndDate, isUnconfirmed);
            }
            // Single date event
            const prefix = isUnconfirmed ? '~' : '';
            return `${prefix}${formatSingleDate(item.date)}`;
        }
        // Fallback
        return formatSingleDate(item.date);
    }
    // Alternative: Add a helper method for relative date display
    getRelativeDate(date: Date): string {
        const now = new Date();
        const diffTime = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        if (diffDays === -1) return 'Yesterday';
        if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
        if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
        return '';
    }
    // Alternative: Method to format duration between dates
    formatDuration(startDate: Date, endDate: Date): string {
        const diffTime = endDate.getTime() - startDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return '';
        if (diffDays === 1) return '(1 day)';
        if (diffDays <= 7) return `(${diffDays} days)`;
        if (diffDays <= 14) return `(${Math.round(diffDays / 7)} week${diffDays > 7 ? 's' : ''})`;
        if (diffDays <= 30) return `(${Math.round(diffDays / 7)} weeks)`;
        return `(${Math.round(diffDays / 30)} month${diffDays > 30 ? 's' : ''})`;
    }
    private formatPredictionEventDate(event: TimelineEvent): string {
        const date = event.globalReleaseDate || event.estimatedGlobalDate || event.jpReleaseDate;
        if (!date) {
            return '';
        }

        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        const prefix = event.isConfirmed ? '' : '~';
        const start = date.toLocaleDateString('en-US', options);
        if (!event.estimatedEndDate) {
            return `${prefix}${start}`;
        }

        const end = event.estimatedEndDate.toLocaleDateString('en-US', options);
        return `${prefix}${start} - ${end}`;
    }
    // Dynamic scaling based on viewport height
    private setupResizeObserver(): void {
        if (!this.timelineContainer || typeof ResizeObserver === 'undefined') {
            return;
        }
        this.resizeObserver = new ResizeObserver(() => {
            this.ngZone.run(() => {
                this.calculateDynamicScale();
                this.cdr.detectChanges();
            });
        });
        this.resizeObserver.observe(this.timelineContainer.nativeElement);
    }
    private calculateDynamicScale(): void {
        if (!this.timelineContainer || this.isMobile) {
            this.cardScale = 1;
            this.cardVerticalOffsetBottom = 60;
            this.cardVerticalOffsetTop = 60;
            return;
        }
        const viewportHeight = window.innerHeight;
        const minHeight = 400;
        const maxHeight = 900;
        const minScale = 0.35;
        const maxScale = 1.0;
        const normalizedHeight = Math.max(0, Math.min(1, (viewportHeight - minHeight) / (maxHeight - minHeight)));
        this.cardScale = minScale + (normalizedHeight * (maxScale - minScale));
        // Use the same offset calculation for both top and bottom to ensure symmetry
        const baseOffset = 60;
        this.cardVerticalOffsetBottom = baseOffset;
        this.cardVerticalOffsetTop = baseOffset;
        this.cardTransformOffset = 25 * this.cardScale;
        if (!environment.production) {
        }
    }
    getTransformOffset(side?: 'top' | 'bottom'): number {
        // Use consistent fixed offsets for both sides
        if (side === 'top') {
            return -10;
        } else {
            return 10;
        }
    }
}
