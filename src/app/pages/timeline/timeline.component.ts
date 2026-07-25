import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone, ChangeDetectionStrategy, ChangeDetectorRef, HostBinding, HostListener } from '@angular/core';
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
import { TourAnchorMatMenuDirective } from 'ngx-ui-tour-md-menu';
import { TimelineService } from '../../services/timeline.service';
import { TimelineCalculation, TimelineEvent, EventType, TimelineAnniversary } from '../../models/timeline.model';
import { MobileTimelineComponent } from '../../components/mobile-timeline/mobile-timeline.component';
import { TimelineAvatar, TimelineAvatarService } from '../../services/timeline-avatar.service';
import { TimelinePredictionInsight, TimelinePredictionService } from '../../services/timeline-prediction.service';
import { TimelinePredictionDialogComponent, TimelinePredictionDialogData } from './timeline-prediction-dialog.component';
import { AdInContentComponent } from '../../components/ads/ad-in-content.component';
import { auditTime, combineLatest, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TimelineEventCardComponent } from '../../components/timeline-event-card/timeline-event-card.component';
import { TimelineEventDetailsComponent, TimelineEventDetailsData } from '../../components/timeline-event-details/timeline-event-details.component';
import { CaratPlannerComponent } from '../../components/carat-planner/carat-planner.component';
import { CaratPlannerResourceService } from '../../services/carat-planner-resource.service';
import { CaratPlannerPersistenceService } from '../../services/carat-planner-persistence.service';
import { CaratPlannerTimelineService } from '../../services/carat-planner-timeline.service';
import { compareTimelineEventsForDisplay } from '../../utils/timeline-event-order';
import { buildTimelineRewardSummaries, TimelineRewardSummary } from '../../utils/planner-reward-summary';
import { isCaratPlannerAvailable } from '../../utils/carat-planner-availability';
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
    showLeagueOfHeroes: boolean;
    showMastersChallenge: boolean;
    showTrainerSkillsTest: boolean;
    showFactorResearch: boolean;
    showStrongestTeam: boolean;
    showRacingCarnival: boolean;
    showScenarioReleases: boolean;
    searchQuery: string;
}

interface TimelineDateLane {
    key: string;
    date: Date;
    dateLabel: string;
    position: number;
    gapDaysBefore: number;
    events: TimelineEvent[];
    visibleEvents: TimelineEvent[];
    hiddenEventCount: number;
    expanded: boolean;
    markers: TimelineLaneMarker[];
}

interface TimelineLaneMarker {
    label: string;
    type: 'launch' | 'anniversary';
    imagePath?: string;
}

interface TimelineMonthSpan {
    key: string;
    label: string;
    position: number;
    width: number;
}

type DesktopTimelineDirection = 'horizontal' | 'vertical';
type TimelineSpacingMode = 'compact' | 'calendar';

interface TimelineMonthGroup {
    key: string;
    label: string;
    lanes: TimelineDateLane[];
    eventCount: number;
}

interface TourTargetRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function timelineLaneDateLabel(date: Date): string {
    const weekday = date.toLocaleDateString(undefined, {
        weekday: 'short',
        timeZone: 'UTC'
    }).replace(/[.,]+$/u, '');
    const calendarDate = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).replace(/,/gu, '');

    return `${weekday}\u2003${calendarDate}`;
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
        TourAnchorMatMenuDirective,
        MobileTimelineComponent,
        AdInContentComponent,
        RouterLink,
        TimelineEventCardComponent,
        CaratPlannerComponent
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
    readonly timelineLaneWidth = 280;
    private readonly timelineLaneStep = 296;
    private readonly timelineLaneStartPadding = 28;
    private readonly timelineLaneEndPadding = 48;
    private readonly emptyMonthSpacing = 116;
    private readonly calendarGapPixelsPerDay = 14;
    private readonly timelineLaneEventLimit = 3;
    private readonly timelineCardSlotWidth = 296;
    private readonly timelineMarkerSlotWidth = 64;
    private readonly timelineAnchorGap = 280;
    private readonly timelineEndPadding = 360;
    itemSize = this.timelineCardSlotWidth; // Width per item for spacing calculation
    allTimelineItems: TimelineItem[] = []; // All items (for data)
    visibleTimelineItems: TimelineItem[] = []; // Only visible items (for rendering)
    allTimelineLanes: TimelineDateLane[] = [];
    visibleTimelineLanes: TimelineDateLane[] = [];
    timelineMonthSpans: TimelineMonthSpan[] = [];
    timelineMonthGroups: TimelineMonthGroup[] = [];
    timelineTrackMinHeight = 560;
    desktopTimelineDirection: DesktopTimelineDirection = 'horizontal';
    verticalTimelineInitialized = false;
    timelineSpacingMode: TimelineSpacingMode = 'compact';
    timelineLayoutAnimating = false;
    todayLanePosition = 0;
    showTodayMarker = false;
    filterPanelOpen = false;
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
        showLeagueOfHeroes: true,
        showMastersChallenge: true,
        showTrainerSkillsTest: true,
        showFactorResearch: true,
        showStrongestTeam: true,
        showRacingCarnival: true,
        showScenarioReleases: true,
        searchQuery: ''
    };
    // Search navigation
    searchResultIndices: number[] = [];
    currentSearchIndex: number = -1;
    filteredEventCount = 0;
    // Service subscription
    private eventsSubscription?: Subscription;
    private scrollSubscription?: Subscription;
    private tabSubscription?: Subscription;
    private plannerSubscription?: Subscription;
    activeTab: 'timeline' | 'carat-planner' = 'timeline';
    readonly caratPlannerAvailable = isCaratPlannerAvailable();

    @HostBinding('class.planner-tab-active')
    get plannerTabActive(): boolean {
        return this.caratPlannerAvailable && this.activeTab === 'carat-planner';
    }
    requestedPlannerEventId: string | null = null;
    plannedEventIds = new Set<string>();
    plannerEventCount = 0;
    plannerRewardSummaries = new Map<string, TimelineRewardSummary>();
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
    private wheelAnimationFrame?: number;
    private pendingWheelDelta = 0;
    private searchRefreshTimer?: number;
    // Dynamic scaling properties
    cardScale = 1;
    cardVerticalOffsetBottom = 60;  // For items below the timeline
    cardVerticalOffsetTop = 60;     // For items above the timeline
    cardTransformOffset = 25;
    private resizeObserver?: ResizeObserver;
    private timelineTourTargetFrame?: number;
    private viewInitialized = false;
    private destroyed = false;
    private initialTodayScrollDone = false;
    private initialTodayScrollScheduled = false;
    private savedDesktopScrollLeft = 0;
    private savedDesktopScrollTop = 0;
    private timelineLayoutAnimationTimer?: number;
    private readonly timelinePreferencesKey = 'umamoe.timeline.desktop-preferences.v1';
    timelineTourEventCardTarget: TourTargetRect = { left: 0, top: 0, width: 320, height: 220 };
    timelineTourTodayTarget: TourTargetRect = { left: 0, top: 0, width: 420, height: 56 };
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
        private title: Title,
        private route: ActivatedRoute,
        private router: Router,
        private plannerResources: CaratPlannerResourceService,
        private plannerPersistence: CaratPlannerPersistenceService,
        private plannerTimeline: CaratPlannerTimelineService
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
            this.cardScale = 1;
            // Recalculate viewport for desktop timeline
            this.updateVisibleItems();
            this.scheduleTimelineTourTargetUpdate();
        }
    }

    @HostListener('window:umamoe:prepare-timeline-tour')
    prepareTimelineTour(): void {
        this.setFallbackTimelineTourTargets();
        if (!this.isMobile) {
            this.scrollToToday('auto');
            this.cdr.detectChanges();
        }
        this.scheduleTimelineTourTargetUpdate();
    }

    @HostListener('wheel', ['$event'])
    onWheel(event: WheelEvent): void {
        if (!this.timelineContainer || this.isMobile || this.desktopTimelineDirection === 'vertical') return;
        const container = this.timelineContainer.nativeElement as HTMLElement;
        const target = this.getTimelineEventElement(event.target);
        if (!target || !container.contains(target) || event.ctrlKey) return;
        if (target.closest('.event-avatar-strip-shell, .timeline-avatar-hover-card')) {
            return;
        }

        this.hideAvatarHover();
        const horizontalDelta = Math.abs(event.deltaX);
        const verticalDelta = Math.abs(event.deltaY);
        const eventLane = target.closest('.timeline-date-lane');
        const canScrollVertically = container.scrollHeight > container.clientHeight + 1;
        if (eventLane && !event.shiftKey && verticalDelta > horizontalDelta && canScrollVertically) {
            const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
            const canMoveVertically = event.deltaY < 0 ? container.scrollTop > 0 : container.scrollTop < maxScrollTop;
            if (canMoveVertically) {
                event.preventDefault();
                container.scrollTop += event.deltaY;
                return;
            }
        }

        const scrollAmount = horizontalDelta > verticalDelta ? event.deltaX : event.deltaY;
        if (!scrollAmount) return;

        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        const canMove = scrollAmount < 0 ? container.scrollLeft > 0 : container.scrollLeft < maxScrollLeft;
        if (!canMove) return;

        event.preventDefault();
        this.pendingWheelDelta += scrollAmount;
        if (this.wheelAnimationFrame !== undefined) return;

        this.wheelAnimationFrame = requestAnimationFrame(() => {
            container.scrollLeft += this.pendingWheelDelta;
            this.pendingWheelDelta = 0;
            this.wheelAnimationFrame = undefined;
        });
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
        const isVertical = this.desktopTimelineDirection === 'vertical';
        const scrollAmount = 300;
        const pageScrollAmount = (isVertical ? container.clientHeight : container.clientWidth) * 0.8;
        switch (event.key) {
            case 'ArrowLeft':
                if (isVertical) break;
                event.preventDefault();
                container.scrollLeft -= scrollAmount;
                break;
            case 'ArrowRight':
                if (isVertical) break;
                event.preventDefault();
                container.scrollLeft += scrollAmount;
                break;
            case 'ArrowUp':
                if (!isVertical) break;
                event.preventDefault();
                container.scrollTop -= scrollAmount;
                break;
            case 'ArrowDown':
                if (!isVertical) break;
                event.preventDefault();
                container.scrollTop += scrollAmount;
                break;
            case 'PageUp':
                event.preventDefault();
                if (isVertical) container.scrollTop -= pageScrollAmount;
                else container.scrollLeft -= pageScrollAmount;
                break;
            case 'PageDown':
                event.preventDefault();
                if (isVertical) container.scrollTop += pageScrollAmount;
                else container.scrollLeft += pageScrollAmount;
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
        if (!this.timelineContainer || this.isMobile || this.desktopTimelineDirection === 'vertical') return;
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
            '.timeline-event-card',
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
        if (!this.timelineContainer || this.isDecelerating || this.desktopTimelineDirection === 'vertical') return;
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
        this.restoreTimelinePreferences();
        this.plannerSubscription = this.plannerPersistence.collection$.subscribe(collection => {
            const plan = collection.plans.find(item => item.id === collection.activePlanId) ?? collection.plans[0];
            const disabledEventIds = new Set(plan?.disabledEventIds ?? []);
            this.plannedEventIds = new Set([
                ...(plan?.targets.filter(target => !disabledEventIds.has(target.eventId)).map(target => target.eventId) ?? []),
                ...(plan?.enabledRewardEventIds ?? [])
            ].filter(eventId => !disabledEventIds.has(eventId)));
            this.plannerEventCount = plan?.targets.filter(target => !disabledEventIds.has(target.eventId)).length ?? 0;
            this.cdr.markForCheck();
        });
        this.loadTimelineRewardSummaries();
        this.tabSubscription = this.route.queryParamMap.subscribe(params => {
            const nextTab = this.caratPlannerAvailable && params.get('tab') === 'carat-planner'
                ? 'carat-planner'
                : 'timeline';
            const changed = nextTab !== this.activeTab;
            if (changed && nextTab === 'carat-planner') {
                this.deactivateDesktopTimelineSurface();
            }
            this.activeTab = nextTab;
            this.requestedPlannerEventId = this.caratPlannerAvailable ? params.get('banner') : null;
            if (changed && nextTab === 'timeline' && !this.isMobile) {
                window.setTimeout(() => {
                    if (this.destroyed || this.activeTab !== 'timeline' || this.isMobile) return;
                    this.cdr.detectChanges();
                    this.initializeDesktopTimelineSurface();
                });
            }
            this.cdr.markForCheck();
        });
        // Check initial screen size
        this.checkMobileBreakpoint();
        this.checkCompactMode();
        // Subscribe to timeline data from the service
        this.eventsSubscription = combineLatest([
            this.timelineService.events$,
            this.timelineService.anniversaries$,
            this.timelineService.calculation$
        ]).pipe(auditTime(0)).subscribe(([events, anniversaries, calculation]) => {
            this.timelineEvents = events;
            this.filteredEventCount = events.length;
            this.timelineAnniversaries = anniversaries;
            this.timelineCalculation = calculation;
            if (this.activeTab !== 'timeline' || this.isMobile) {
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
        this.setFallbackTimelineTourTargets();
    }
    ngAfterViewInit(): void {
        this.viewInitialized = true;
        this.initializeDesktopTimelineSurface();
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
        this.scheduleTimelineTourTargetUpdate();
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
        this.tabSubscription?.unsubscribe();
        this.plannerSubscription?.unsubscribe();
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
        if (this.wheelAnimationFrame !== undefined) {
            cancelAnimationFrame(this.wheelAnimationFrame);
            this.wheelAnimationFrame = undefined;
        }
        if (this.searchRefreshTimer !== undefined) {
            window.clearTimeout(this.searchRefreshTimer);
            this.searchRefreshTimer = undefined;
        }
        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.timelineTourTargetFrame !== undefined) {
            cancelAnimationFrame(this.timelineTourTargetFrame);
            this.timelineTourTargetFrame = undefined;
        }
        if (this.timelineLayoutAnimationTimer !== undefined) {
            window.clearTimeout(this.timelineLayoutAnimationTimer);
            this.timelineLayoutAnimationTimer = undefined;
        }
        // Reset body styles
        document.body.style.userSelect = '';
    }

    private setFallbackTimelineTourTargets(): void {
        if (typeof window === 'undefined') {
            return;
        }

        const cardWidth = Math.min(320, Math.max(260, window.innerWidth - 48));
        const cardHeight = Math.min(260, Math.max(150, window.innerHeight * 0.32));
        const todayWidth = Math.min(420, Math.max(180, window.innerWidth - 48));
        const todayHeight = 56;

        this.timelineTourEventCardTarget = {
            left: Math.max(24, (window.innerWidth - cardWidth) / 2),
            top: Math.max(96, (window.innerHeight - cardHeight) / 2),
            width: cardWidth,
            height: cardHeight
        };
        this.timelineTourTodayTarget = {
            left: Math.max(24, (window.innerWidth - todayWidth) / 2),
            top: Math.max(120, (window.innerHeight * 0.58) - (todayHeight / 2)),
            width: todayWidth,
            height: todayHeight
        };
    }

    private scheduleTimelineTourTargetUpdate(): void {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.timelineTourTargetFrame !== undefined) {
            window.cancelAnimationFrame(this.timelineTourTargetFrame);
        }

        this.timelineTourTargetFrame = window.requestAnimationFrame(() => {
            this.timelineTourTargetFrame = undefined;
            if (this.destroyed) {
                return;
            }

            this.updateTimelineTourTargetsFromDom();
            this.cdr.detectChanges();
        });
    }

    private updateTimelineTourTargetsFromDom(): void {
        this.setFallbackTimelineTourTargets();

        if (this.isMobile || typeof document === 'undefined' || typeof window === 'undefined') {
            return;
        }

        const card = this.findBestVisibleTimelineElement('.desktop-timeline .timeline-event-card');
        if (card) {
            this.timelineTourEventCardTarget = this.rectToTourTarget(card.getBoundingClientRect());
        }

        const todayMarker = this.findBestVisibleTimelineElement('.desktop-timeline .timeline-today-marker');
        if (todayMarker) {
            this.timelineTourTodayTarget = this.rectToTourTarget(todayMarker.getBoundingClientRect(), 18, 52, 160);
        }
    }

    private findBestVisibleTimelineElement(selector: string): HTMLElement | null {
        if (typeof document === 'undefined' || typeof window === 'undefined') {
            return null;
        }

        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        let bestElement: HTMLElement | null = null;
        let bestScore = Number.POSITIVE_INFINITY;

        document.querySelectorAll<HTMLElement>(selector).forEach(element => {
            const rect = element.getBoundingClientRect();
            if (
                rect.width <= 0 ||
                rect.height <= 0 ||
                rect.right <= 0 ||
                rect.left >= window.innerWidth ||
                rect.bottom <= 0 ||
                rect.top >= window.innerHeight
            ) {
                return;
            }

            const elementCenterX = rect.left + rect.width / 2;
            const elementCenterY = rect.top + rect.height / 2;
            const score = Math.abs(elementCenterX - viewportCenterX) + Math.abs(elementCenterY - viewportCenterY) * 0.7;
            if (score < bestScore) {
                bestScore = score;
                bestElement = element;
            }
        });

        return bestElement;
    }

    private rectToTourTarget(rect: DOMRect, padding = 0, minHeight = 0, minWidth = 0): TourTargetRect {
        const width = Math.max(minWidth, rect.width + padding * 2);
        const height = Math.max(minHeight, rect.height + padding * 2);
        return {
            left: rect.left + rect.width / 2 - width / 2,
            top: rect.top + rect.height / 2 - height / 2,
            width,
            height
        };
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
        // Generate events from service data with filtering and grouping
        const filteredEvents = this.timelineEvents.filter(event => this.eventPassesFilters(event));
        this.filteredEventCount = filteredEvents.length;
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
        eventsByDate.forEach(group => group.events.sort(compareTimelineEventsForDisplay));
        this.buildTimelineLanes(eventsByDate, actualEndDate);
        // The desktop template renders fixed date lanes. Stop before the retired
        // duration-based card layout duplicates every event and re-packs it.
        this.updateTimelineLaneMetrics();
        return;
        this.totalDays = Math.ceil((actualEndDate.getTime() - this.globalReleaseDate.getTime()) / (1000 * 60 * 60 * 24));
        this.updateTimelineWidth();
        const currentDate = new Date(this.globalReleaseDate);
        let position = 0;
        this.allTimelineItems.push({
            date: new Date(this.globalReleaseDate),
            label: 'Global Launch',
            type: 'milestone',
            position: this.initialOffset
        });
        this.generateAnniversaryMarkers(actualEndDate);
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
        this.updateTimelineLaneMetrics();
        // After generating all items, update visible items
        this.updateVisibleItems();
    }

    private buildTimelineLanes(
        eventsByDate: Map<string, { date: Date; events: TimelineEvent[] }>,
        actualEndDate: Date
    ): void {
        const laneMap = new Map<string, { date: Date; events: TimelineEvent[]; markers: TimelineLaneMarker[] }>();

        eventsByDate.forEach(({ date, events }, key) => {
            laneMap.set(key, { date: new Date(date), events, markers: [] });
        });

        if (!this.eventFilters.searchQuery.trim()) {
            const launchKey = this.utcDateKey(this.globalReleaseDate);
            const launchLane = laneMap.get(launchKey) ?? {
                date: new Date(this.globalReleaseDate),
                events: [],
                markers: []
            };
            launchLane.markers.push({ label: 'Global launch', type: 'launch' });
            laneMap.set(launchKey, launchLane);

            this.timelineAnniversaries.forEach(anniversary => {
                if (anniversary.globalDate > actualEndDate) return;
                const key = this.utcDateKey(anniversary.globalDate);
                const lane = laneMap.get(key) ?? {
                    date: new Date(anniversary.globalDate),
                    events: [],
                    markers: []
                };
                lane.markers.push({
                    label: anniversary.label,
                    type: 'anniversary',
                    imagePath: anniversary.imagePath
                });
                laneMap.set(key, lane);
            });
        }

        const previousExpansion = new Map(this.allTimelineLanes.map(lane => [lane.key, lane.expanded]));
        const sorted = Array.from(laneMap.entries())
            .filter(([, lane]) => lane.date >= this.globalReleaseDate)
            .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime());

        let emptyMonthOffset = 0;
        let previousPosition = this.timelineLaneStartPadding;
        this.allTimelineLanes = sorted.map(([key, lane], index) => {
            const expanded = previousExpansion.get(key) === true;
            const previousDate = index > 0 ? sorted[index - 1][1].date : null;
            const gapDaysBefore = previousDate
                ? Math.max(0, Math.round((lane.date.getTime() - previousDate.getTime()) / 86_400_000))
                : 0;
            let position = this.timelineLaneStartPadding;
            if (previousDate) {
                if (this.timelineSpacingMode === 'calendar') {
                    position = previousPosition
                        + this.timelineLaneStep
                        + Math.max(0, gapDaysBefore - 1) * this.calendarGapPixelsPerDay;
                } else {
                    const elapsedMonths = (lane.date.getUTCFullYear() - previousDate.getUTCFullYear()) * 12
                        + lane.date.getUTCMonth() - previousDate.getUTCMonth();
                    emptyMonthOffset += Math.max(0, elapsedMonths - 1) * this.emptyMonthSpacing;
                    position = this.timelineLaneStartPadding + index * this.timelineLaneStep + emptyMonthOffset;
                }
            }
            previousPosition = position;
            return {
                key,
                date: lane.date,
                dateLabel: timelineLaneDateLabel(lane.date),
                position,
                gapDaysBefore,
                events: lane.events,
                visibleEvents: expanded ? lane.events : lane.events.slice(0, this.timelineLaneEventLimit),
                hiddenEventCount: expanded ? 0 : Math.max(0, lane.events.length - this.timelineLaneEventLimit),
                expanded,
                markers: lane.markers
            };
        });
        this.timelineMonthSpans = this.buildTimelineMonthSpans(this.allTimelineLanes);
        this.timelineMonthGroups = this.buildTimelineMonthGroups(this.allTimelineLanes);
        this.updateTimelineTrackHeight();
    }

    private buildTimelineMonthSpans(lanes: TimelineDateLane[]): TimelineMonthSpan[] {
        if (!lanes.length) return [];
        const firstLane = lanes[0];
        const lastLane = lanes[lanes.length - 1];
        const lastTrackPosition = lastLane.position + this.timelineLaneWidth + this.timelineLaneEndPadding;
        const spans: TimelineMonthSpan[] = [];
        let monthStart = new Date(Date.UTC(firstLane.date.getUTCFullYear(), firstLane.date.getUTCMonth(), 1));
        const finalMonthStart = new Date(Date.UTC(lastLane.date.getUTCFullYear(), lastLane.date.getUTCMonth(), 1));

        while (monthStart <= finalMonthStart) {
            const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
            const position = spans.length === 0
                ? 0
                : this.positionForDate(monthStart) + this.timelineLaneWidth / 2;
            const end = nextMonthStart <= lastLane.date
                ? this.positionForDate(nextMonthStart) + this.timelineLaneWidth / 2
                : lastTrackPosition;
            spans.push({
                key: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
                label: monthStart.toLocaleDateString(undefined, {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC'
                }),
                position,
                width: Math.max(1, end - position)
            });
            monthStart = nextMonthStart;
        }

        return spans;
    }

    private buildTimelineMonthGroups(lanes: TimelineDateLane[]): TimelineMonthGroup[] {
        const groups: TimelineMonthGroup[] = [];
        lanes.forEach(lane => {
            const key = `${lane.date.getUTCFullYear()}-${String(lane.date.getUTCMonth() + 1).padStart(2, '0')}`;
            let group = groups[groups.length - 1];
            if (!group || group.key !== key) {
                group = {
                    key,
                    label: lane.date.toLocaleDateString(undefined, {
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC'
                    }),
                    lanes: [],
                    eventCount: 0
                };
                groups.push(group);
            }
            group.lanes.push(lane);
            group.eventCount += lane.events.length;
        });
        return groups;
    }

    private updateTimelineTrackHeight(): void {
        const requiredHeight = this.allTimelineLanes.reduce((maximum, lane) => {
            const markerHeight = lane.markers.reduce((height, marker) => height + (marker.imagePath ? 108 : 42), 0);
            const cardsHeight = lane.visibleEvents.length
                ? lane.visibleEvents.length * 220 + Math.max(0, lane.visibleEvents.length - 1) * 9
                : 0;
            const overflowHeight = lane.events.length > this.timelineLaneEventLimit ? 38 : 0;
            return Math.max(maximum, 31 + 60 + markerHeight + cardsHeight + overflowHeight + 24);
        }, 0);
        this.timelineTrackMinHeight = Math.max(360, requiredHeight);
    }

    private updateTimelineLaneMetrics(): void {
        const finalLane = this.allTimelineLanes[this.allTimelineLanes.length - 1];
        this.totalWidth = finalLane
            ? finalLane.position + this.timelineLaneWidth + this.timelineLaneEndPadding
            : this.timelineLaneWidth + this.timelineLaneEndPadding;
        this.todayLanePosition = this.positionForDate(new Date());
        this.showTodayMarker = this.allTimelineLanes.length > 0
            && new Date() >= this.allTimelineLanes[0].date
            && new Date() <= this.allTimelineLanes[this.allTimelineLanes.length - 1].date;
    }

    private positionForDate(date: Date): number {
        if (!this.allTimelineLanes.length) return 0;
        if (date <= this.allTimelineLanes[0].date) return this.allTimelineLanes[0].position;
        const last = this.allTimelineLanes[this.allTimelineLanes.length - 1];
        if (date >= last.date) return last.position;

        for (let index = 1; index < this.allTimelineLanes.length; index++) {
            const next = this.allTimelineLanes[index];
            if (next.date < date) continue;
            const previous = this.allTimelineLanes[index - 1];
            const duration = next.date.getTime() - previous.date.getTime();
            const progress = duration > 0 ? (date.getTime() - previous.date.getTime()) / duration : 0;
            return previous.position + progress * (next.position - previous.position);
        }

        return last.position;
    }

    private utcDateKey(date: Date): string {
        return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
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
        if (!this.allTimelineLanes.length || !this.timelineContainer) {
            return false;
        }
        const container = this.timelineContainer.nativeElement as HTMLElement;
        if (this.desktopTimelineDirection === 'vertical') {
            const targetLane = this.closestLaneToDate(new Date());
            return targetLane ? this.scrollToVerticalLane(targetLane, behavior) : false;
        }
        const targetScrollLeft = Math.max(0, this.todayLanePosition - (container.clientWidth / 2) + (this.timelineLaneWidth / 2));
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
            if (this.desktopTimelineDirection === 'vertical') this.timelineContainer.nativeElement.scrollTop = 0;
            else this.timelineContainer.nativeElement.scrollLeft = 0;
        }
    }
    scrollToEnd(): void {
        if (this.timelineContainer) {
            if (this.desktopTimelineDirection === 'vertical') {
                this.timelineContainer.nativeElement.scrollTop = this.timelineContainer.nativeElement.scrollHeight;
            } else {
                this.timelineContainer.nativeElement.scrollLeft = this.totalWidth;
            }
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
            !this.showTodayMarker
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
        return date.toLocaleDateString(undefined, {
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
        if (this.searchRefreshTimer !== undefined) {
            window.clearTimeout(this.searchRefreshTimer);
        }
        this.searchRefreshTimer = window.setTimeout(() => {
            this.searchRefreshTimer = undefined;
            this.refreshTimelineFilters();
        }, 90);
    }
    private updateSearchResults(): void {
        this.searchResultIndices = [];
        this.currentSearchIndex = -1;
        if (!this.eventFilters.searchQuery.trim()) {
            return;
        }
        // Every generated lane already contains at least one event that passed
        // the active search, so avoid searching the full avatar metadata twice.
        this.searchResultIndices = this.allTimelineLanes.map((_lane, index) => index);
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
        const targetLane = this.allTimelineLanes[resultIndex];
        if (targetLane) {
            if (this.desktopTimelineDirection === 'vertical') {
                this.scrollToVerticalLane(targetLane, 'smooth');
            } else {
                const scrollPosition = targetLane.position - (this.timelineContainer.nativeElement.clientWidth / 2) + (this.timelineLaneWidth / 2);
                this.timelineContainer.nativeElement.scrollLeft = Math.max(0, scrollPosition);
                this.updateVisibleItemsSync(true);
            }
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
        this.refreshTimelineFilters();
    }
    toggleSupportFilter(): void {
        this.eventFilters.showSupports = !this.eventFilters.showSupports;
        this.refreshTimelineFilters();
    }
    toggleStoryEventsFilter(): void {
        this.eventFilters.showStoryEvents = !this.eventFilters.showStoryEvents;
        this.refreshTimelineFilters();
    }
    toggleChampionsMeetingsFilter(): void {
        this.eventFilters.showChampionsMeetings = !this.eventFilters.showChampionsMeetings;
        this.refreshTimelineFilters();
    }
    toggleLegendRacesFilter(): void {
        this.eventFilters.showLegendRaces = !this.eventFilters.showLegendRaces;
        this.refreshTimelineFilters();
    }
    togglePaidBannersFilter(): void {
        this.eventFilters.showPaidBanners = !this.eventFilters.showPaidBanners;
        this.refreshTimelineFilters();
    }
    toggleCampaignsFilter(): void {
        this.eventFilters.showCampaigns = !this.eventFilters.showCampaigns;
        this.refreshTimelineFilters();
    }
    toggleLeagueOfHeroesFilter(): void {
        this.eventFilters.showLeagueOfHeroes = !this.eventFilters.showLeagueOfHeroes;
        this.refreshTimelineFilters();
    }
    toggleMastersChallengeFilter(): void {
        this.eventFilters.showMastersChallenge = !this.eventFilters.showMastersChallenge;
        this.refreshTimelineFilters();
    }
    toggleTrainerSkillsTestFilter(): void {
        this.eventFilters.showTrainerSkillsTest = !this.eventFilters.showTrainerSkillsTest;
        this.refreshTimelineFilters();
    }
    toggleFactorResearchFilter(): void {
        this.eventFilters.showFactorResearch = !this.eventFilters.showFactorResearch;
        this.refreshTimelineFilters();
    }
    toggleStrongestTeamFilter(): void {
        this.eventFilters.showStrongestTeam = !this.eventFilters.showStrongestTeam;
        this.refreshTimelineFilters();
    }
    toggleRacingCarnivalFilter(): void {
        this.eventFilters.showRacingCarnival = !this.eventFilters.showRacingCarnival;
        this.refreshTimelineFilters();
    }
    toggleScenarioReleasesFilter(): void {
        this.eventFilters.showScenarioReleases = !this.eventFilters.showScenarioReleases;
        this.refreshTimelineFilters();
    }
    private refreshTimelineFilters(): void {
        this.generateTimelineItems();
        this.updateSearchResults();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();
    }
    private eventPassesFilters(event: TimelineEvent): boolean {
        switch (event.type) {
            case EventType.CHARACTER_BANNER: if (!this.eventFilters.showCharacters) return false; break;
            case EventType.SUPPORT_CARD_BANNER: if (!this.eventFilters.showSupports) return false; break;
            case EventType.PAID_BANNER: if (!this.eventFilters.showPaidBanners) return false; break;
            case EventType.STORY_EVENT: if (!this.eventFilters.showStoryEvents) return false; break;
            case EventType.CHAMPIONS_MEETING: if (!this.eventFilters.showChampionsMeetings) return false; break;
            case EventType.LEGEND_RACE: if (!this.eventFilters.showLegendRaces) return false; break;
            case EventType.CAMPAIGN: if (!this.eventFilters.showCampaigns) return false; break;
            case EventType.LEAGUE_OF_HEROES: if (!this.eventFilters.showLeagueOfHeroes) return false; break;
            case EventType.MASTERS_CHALLENGE: if (!this.eventFilters.showMastersChallenge) return false; break;
            case EventType.TRAINER_SKILLS_TEST: if (!this.eventFilters.showTrainerSkillsTest) return false; break;
            case EventType.FACTOR_RESEARCH: if (!this.eventFilters.showFactorResearch) return false; break;
            case EventType.STRONGEST_TEAM: if (!this.eventFilters.showStrongestTeam) return false; break;
            case EventType.RACING_CARNIVAL: if (!this.eventFilters.showRacingCarnival) return false; break;
            case EventType.SCENARIO_RELEASE: if (!this.eventFilters.showScenarioReleases) return false; break;
            default: if (!this.eventFilters.showStoryEvents) return false;
        }

        const query = this.eventFilters.searchQuery.trim();
        if (query && !this.timelineAvatarService.eventMatchesSearch(event, query)) {
            return false;
        }

        const eventDate = event.globalReleaseDate || event.jpReleaseDate;
        return eventDate >= this.globalReleaseDate;
    }
    getCampaignCount(): number {
        return this.timelineEvents.filter(e => e.type === EventType.CAMPAIGN).length;
    }
    getFilteredEventCount(): number {
        return this.filteredEventCount;
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
        this.updateVisibleLanes();
        return;
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
        this.scheduleTimelineTourTargetUpdate();
        if (!environment.production) {
        }
    }
    // Synchronous version for immediate scroll updates (no Angular zone)
    private updateVisibleItemsSync(isInitial?: boolean): void {
        this.updateVisibleLanes(isInitial === true);
        return;
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
        this.scheduleTimelineTourTargetUpdate();
        // Remove the arbitrary limit - let it render more items if needed
        // The user prefers too many items over items disappearing
        if (!environment.production) {
        }
    }
    private setupScrollListener(): void {
        if (this.timelineContainer) {
            this.scrollSubscription?.unsubscribe();
            this.scrollSubscription = new Subscription();
            const container = this.timelineContainer.nativeElement as HTMLElement;
            // Use immediate + throttled scroll updates for smooth rendering during scroll
            this.ngZone.runOutsideAngular(() => {
                let scrollTimeout: number;
                let lastUpdateTime = 0;
                const throttleDelay = 16; // One virtual-range update per rendered frame.
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
                container.addEventListener('scroll', scrollHandler, { passive: true });
                if (this.scrollSubscription) {
                    this.scrollSubscription.add(() => {
                        container.removeEventListener('scroll', scrollHandler);
                        clearTimeout(scrollTimeout);
                    });
                }
            });
        }
    }
    private checkMobileBreakpoint(): void {
        const wasIsMobile = this.isMobile;
        this.isMobile = window.matchMedia(`(max-width: ${this.mobileBreakpoint - 1}px)`).matches;
        if (wasIsMobile !== this.isMobile) {
            if (this.isMobile) {
                this.deactivateDesktopTimelineSurface();
                this.clearDesktopTimelineItems();
            }
            this.cdr.detectChanges();
            if (!this.isMobile && this.activeTab === 'timeline') {
                window.setTimeout(() => this.initializeDesktopTimelineSurface());
            }
        }
    }
    private checkCompactMode(): void {
        this.isCompactMode = false;
    }
    private clearDesktopTimelineItems(): void {
        this.allTimelineItems = [];
        this.visibleTimelineItems = [];
        this.allTimelineLanes = [];
        this.visibleTimelineLanes = [];
        this.timelineMonthSpans = [];
        this.timelineMonthGroups = [];
        this.timelineTrackMinHeight = 560;
        this.totalWidth = 0;
    }

    private initializeDesktopTimelineSurface(): void {
        if (!this.viewInitialized || this.destroyed || this.activeTab !== 'timeline' || this.isMobile || !this.timelineContainer) {
            return;
        }

        this.scrollSubscription?.unsubscribe();
        this.scrollSubscription = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.generateTimelineItems();
        if (this.desktopTimelineDirection === 'vertical') {
            this.timelineContainer.nativeElement.scrollTop = this.savedDesktopScrollTop;
        } else {
            this.timelineContainer.nativeElement.scrollLeft = this.savedDesktopScrollLeft;
        }
        this.setupScrollListener();
        this.setupResizeObserver();
        this.calculateDynamicScale();
        this.updateVisibleItemsSync(true);
        this.scheduleInitialScrollToToday();
        this.scheduleTimelineTourTargetUpdate();
        this.cdr.detectChanges();
    }

    private deactivateDesktopTimelineSurface(): void {
        if (this.timelineContainer) {
            if (this.desktopTimelineDirection === 'vertical') {
                this.savedDesktopScrollTop = this.timelineContainer.nativeElement.scrollTop;
            } else {
                this.savedDesktopScrollLeft = this.timelineContainer.nativeElement.scrollLeft;
            }
        }
        this.stopTimelineMomentum();
        this.scrollSubscription?.unsubscribe();
        this.scrollSubscription = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }

    private updateVisibleLanes(force = false): void {
        if (this.desktopTimelineDirection === 'vertical') {
            this.visibleTimelineLanes = [];
            this.scheduleTimelineTourTargetUpdate();
            return;
        }
        if (!this.timelineContainer) {
            this.visibleTimelineLanes = this.allTimelineLanes.slice(0, 8);
            return;
        }

        const container = this.timelineContainer.nativeElement as HTMLElement;
        const nextScrollLeft = Math.max(0, container.scrollLeft);
        const nextViewportWidth = container.clientWidth;
        if (!force
            && Math.abs(nextScrollLeft - this.scrollLeft) < 8
            && Math.abs(nextViewportWidth - this.viewportWidth) < 8
            && this.visibleTimelineLanes.length) {
            return;
        }

        this.scrollLeft = nextScrollLeft;
        this.viewportWidth = nextViewportWidth;
        const buffer = this.timelineLaneStep * 3;
        const start = nextScrollLeft - buffer;
        const end = nextScrollLeft + nextViewportWidth + buffer;
        this.visibleTimelineLanes = this.allTimelineLanes.filter(lane =>
            lane.position + this.timelineLaneWidth >= start && lane.position <= end
        );
        this.scheduleTimelineTourTargetUpdate();
    }

    trackTimelineLane(_index: number, lane: TimelineDateLane): string {
        return lane.key;
    }

    trackTimelineMonth(_index: number, month: TimelineMonthGroup): string {
        return month.key;
    }

    trackTimelineEvent(_index: number, event: TimelineEvent): string {
        return event.id;
    }

    toggleLaneExpansion(lane: TimelineDateLane): void {
        lane.expanded = !lane.expanded;
        lane.visibleEvents = lane.expanded ? lane.events : lane.events.slice(0, this.timelineLaneEventLimit);
        lane.hiddenEventCount = lane.expanded ? 0 : Math.max(0, lane.events.length - this.timelineLaneEventLimit);
        this.updateTimelineTrackHeight();
        this.cdr.detectChanges();
    }

    setDesktopTimelineDirection(direction: DesktopTimelineDirection): void {
        if (direction === this.desktopTimelineDirection || !this.timelineContainer) return;
        const container = this.timelineContainer.nativeElement as HTMLElement;
        if (this.desktopTimelineDirection === 'horizontal') {
            this.savedDesktopScrollLeft = container.scrollLeft;
        } else {
            this.savedDesktopScrollTop = container.scrollTop;
        }
        this.stopTimelineMomentum();
        this.desktopTimelineDirection = direction;
        if (direction === 'vertical') this.verticalTimelineInitialized = true;
        this.filterPanelOpen = false;
        this.persistTimelinePreferences();
        if (direction === 'horizontal') this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();

        window.requestAnimationFrame(() => {
            if (!this.timelineContainer || this.desktopTimelineDirection !== direction) return;
            const nextContainer = this.timelineContainer.nativeElement as HTMLElement;
            if (direction === 'vertical') {
                nextContainer.scrollLeft = 0;
                nextContainer.scrollTop = this.savedDesktopScrollTop;
                if (!this.savedDesktopScrollTop) this.scrollToToday('auto');
            } else {
                nextContainer.scrollTop = 0;
                nextContainer.scrollLeft = this.savedDesktopScrollLeft;
                this.updateVisibleItemsSync(true);
                if (!this.savedDesktopScrollLeft) this.scrollToToday('auto');
            }
            this.scheduleTimelineTourTargetUpdate();
            this.cdr.detectChanges();
        });
    }

    toggleTimelineSpacing(): void {
        if (this.desktopTimelineDirection !== 'horizontal') return;
        const anchorDate = this.horizontalViewportAnchorDate();
        this.timelineSpacingMode = this.timelineSpacingMode === 'compact' ? 'calendar' : 'compact';
        this.persistTimelinePreferences();
        this.timelineLayoutAnimating = true;
        if (this.timelineLayoutAnimationTimer !== undefined) {
            window.clearTimeout(this.timelineLayoutAnimationTimer);
        }
        this.generateTimelineItems();
        this.updateVisibleItemsSync(true);
        this.cdr.detectChanges();

        window.requestAnimationFrame(() => {
            if (!this.timelineContainer || this.desktopTimelineDirection !== 'horizontal') return;
            const container = this.timelineContainer.nativeElement as HTMLElement;
            const target = Math.max(0, this.positionForDate(anchorDate) - container.clientWidth / 2 + this.timelineLaneWidth / 2);
            container.scrollTo({ left: target, behavior: 'smooth' });
            this.updateVisibleItemsSync(true);
        });
        this.timelineLayoutAnimationTimer = window.setTimeout(() => {
            this.timelineLayoutAnimating = false;
            this.timelineLayoutAnimationTimer = undefined;
            this.cdr.markForCheck();
        }, 360);
    }

    isLaneToday(lane: TimelineDateLane): boolean {
        return this.utcDateKey(lane.date) === this.utcDateKey(new Date());
    }

    private horizontalViewportAnchorDate(): Date {
        if (!this.timelineContainer || !this.allTimelineLanes.length) return new Date();
        const container = this.timelineContainer.nativeElement as HTMLElement;
        const center = container.scrollLeft + container.clientWidth / 2;
        return this.allTimelineLanes.reduce((closest, lane) => {
            const closestDistance = Math.abs(closest.position + this.timelineLaneWidth / 2 - center);
            const laneDistance = Math.abs(lane.position + this.timelineLaneWidth / 2 - center);
            return laneDistance < closestDistance ? lane : closest;
        }).date;
    }

    private closestLaneToDate(date: Date): TimelineDateLane | null {
        if (!this.allTimelineLanes.length) return null;
        return this.allTimelineLanes.reduce((closest, lane) =>
            Math.abs(lane.date.getTime() - date.getTime()) < Math.abs(closest.date.getTime() - date.getTime())
                ? lane
                : closest
        );
    }

    private scrollToVerticalLane(lane: TimelineDateLane, behavior: ScrollBehavior): boolean {
        if (!this.timelineContainer) return false;
        const container = this.timelineContainer.nativeElement as HTMLElement;
        const target = container.querySelector(`[data-lane-key="${lane.key}"]`) as HTMLElement | null;
        if (!target) return false;
        const top = target.offsetTop - (container.clientHeight / 2) + (target.clientHeight / 2);
        container.scrollTo({ top: Math.max(0, top), behavior });
        return true;
    }

    private restoreTimelinePreferences(): void {
        if (typeof window === 'undefined') return;
        try {
            const preferences = JSON.parse(window.localStorage.getItem(this.timelinePreferencesKey) ?? '{}') as {
                direction?: DesktopTimelineDirection;
                spacing?: TimelineSpacingMode;
            };
            if (preferences.direction === 'horizontal' || preferences.direction === 'vertical') {
                this.desktopTimelineDirection = preferences.direction;
                this.verticalTimelineInitialized = preferences.direction === 'vertical';
            }
            if (preferences.spacing === 'compact' || preferences.spacing === 'calendar') {
                this.timelineSpacingMode = preferences.spacing;
            }
        } catch {
            // Ignore stale or blocked local preferences.
        }
    }

    private persistTimelinePreferences(): void {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(this.timelinePreferencesKey, JSON.stringify({
                direction: this.desktopTimelineDirection,
                spacing: this.timelineSpacingMode
            }));
        } catch {
            // The timeline remains fully usable when storage is unavailable.
        }
    }

    toggleFilterPanel(): void {
        this.filterPanelOpen = !this.filterPanelOpen;
        this.cdr.detectChanges();
    }

    prefetchPlannerManifest(): void {
        if (!this.caratPlannerAvailable) return;
        this.plannerResources.prefetchManifest();
    }

    private loadTimelineRewardSummaries(): void {
        void this.plannerResources.loadRewards().then(rewards => {
            if (this.destroyed) return;
            this.plannerRewardSummaries = buildTimelineRewardSummaries(rewards);
            this.cdr.markForCheck();
        }).catch(() => {
            // Reward summaries are progressive enhancement; the public timeline remains usable without them.
        });
    }

    get activeFilterCount(): number {
        return [
            this.eventFilters.showCharacters,
            this.eventFilters.showSupports,
            this.eventFilters.showStoryEvents,
            this.eventFilters.showChampionsMeetings,
            this.eventFilters.showLegendRaces,
            this.eventFilters.showPaidBanners,
            this.eventFilters.showCampaigns,
            this.eventFilters.showLeagueOfHeroes,
            this.eventFilters.showMastersChallenge,
            this.eventFilters.showTrainerSkillsTest,
            this.eventFilters.showFactorResearch,
            this.eventFilters.showStrongestTeam,
            this.eventFilters.showRacingCarnival,
            this.eventFilters.showScenarioReleases
        ].filter(enabled => !enabled).length;
    }

    openEventDetails(event: TimelineEvent): void {
        if (this.hasDragged) return;
        const data: TimelineEventDetailsData = {
            event,
            calculation: this.timelineCalculation,
            rewardSummary: this.plannerRewardSummaries.get(event.id) ?? null,
            plannerEnabled: this.caratPlannerAvailable,
        };
        this.dialog.open(TimelineEventDetailsComponent, {
            data,
            width: '560px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '82vh',
            autoFocus: 'dialog',
            restoreFocus: true,
            panelClass: ['timeline-event-details-panel', 'timeline-event-details-dialog']
        });
    }

    addEventToPlanner(event: TimelineEvent): void {
        if (!this.caratPlannerAvailable) return;
        this.plannerTimeline.setEventActive(event, true);
    }

    removeEventFromPlanner(event: TimelineEvent): void {
        if (!this.caratPlannerAvailable) return;
        this.plannerTimeline.setEventActive(event, false);
    }

    isEventPlanned(event: TimelineEvent): boolean {
        return this.caratPlannerAvailable && this.plannedEventIds.has(event.id);
    }

    isPlannerEligible(event: TimelineEvent): boolean {
        if (!this.caratPlannerAvailable) return false;
        const isPullTarget = [EventType.CHARACTER_BANNER, EventType.SUPPORT_CARD_BANNER].includes(event.type)
            && Boolean(event.plannerDataAvailable || event.gachaId || event.gachaIds?.length);
        return isPullTarget || event.plannerRewardAvailable === true;
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
            case EventType.LEAGUE_OF_HEROES:
                return 'League of Heroes';
            case EventType.MASTERS_CHALLENGE:
                return 'Masters Challenge';
            case EventType.TRAINER_SKILLS_TEST:
                return 'Trainer Skills Test';
            case EventType.FACTOR_RESEARCH:
                return 'Factor Research';
            case EventType.STRONGEST_TEAM:
                return 'Aim! The Strongest Team';
            case EventType.RACING_CARNIVAL:
                return 'Racing Carnival';
            case EventType.SCENARIO_RELEASE:
                return 'Training Scenario';
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
    eventTypeToIcon(type: EventType | undefined): string {
        switch (type) {
            case EventType.CHARACTER_BANNER: return 'person';
            case EventType.SUPPORT_CARD_BANNER: return 'style';
            case EventType.PAID_BANNER: return 'payments';
            case EventType.STORY_EVENT: return 'auto_stories';
            case EventType.CHAMPIONS_MEETING: return 'emoji_events';
            case EventType.LEGEND_RACE: return 'sports_motorsports';
            case EventType.LEAGUE_OF_HEROES: return 'groups';
            case EventType.MASTERS_CHALLENGE: return 'military_tech';
            case EventType.TRAINER_SKILLS_TEST: return 'school';
            case EventType.FACTOR_RESEARCH: return 'science';
            case EventType.STRONGEST_TEAM: return 'group_work';
            case EventType.RACING_CARNIVAL: return 'sports_score';
            case EventType.SCENARIO_RELEASE: return 'landscape';
            case EventType.CAMPAIGN:
            default: return 'campaign';
        }
    }
    gachaTypeLabel(event: TimelineEvent | undefined): string {
        if (!event?.gachaType) return '';
        const labels: Record<string, string> = {
            standard_pool: 'Standard Pool',
            makeup_debut: 'Makeup Debut',
            standard_pickup: 'Standard Pickup',
            guaranteed: 'Guaranteed',
            group_select: 'Group Select',
            twinkle_collection: 'Twinkle Collection',
            pick_2: 'Pick 2',
            select_pickup_rerun: 'Pick 2',
            special_guaranteed: 'Special Guaranteed',
            select_step_up: 'Select Step-Up',
            stamp_sheet: 'Stamp Sheet',
            select_pickup_stamp_sheet: 'Stamp Sheet'
        };
        const numericLabels: Record<number, string> = {
            1: 'Standard Pool', 2: 'Makeup Debut', 3: 'Standard Pickup',
            5: 'Guaranteed', 10: 'Group Select', 11: 'Twinkle Collection',
            12: 'Pick 2', 13: 'Special Guaranteed', 14: 'Select Step-Up',
            15: 'Stamp Sheet'
        };
        return labels[event.gachaTypeName || ''] || numericLabels[event.gachaType] || `Gacha Type ${event.gachaType}`;
    }

    isRerunBanner(event: TimelineEvent | undefined): boolean {
        return event?.tags?.includes('rerun-banner') === true;
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
            return date.toLocaleDateString(undefined, dateOptions);
        };
        const formatDateRange = (startDate: Date, endDate: Date, isUnconfirmed = false): string => {
            const prefix = isUnconfirmed ? '~' : '';
            // If same year, use compact format for start date
            if (startDate.getFullYear() === endDate.getFullYear()) {
                const startStr = startDate.toLocaleDateString(undefined, compactDateOptions);
                const endStr = endDate.toLocaleDateString(undefined, dateOptions);
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
        const start = date.toLocaleDateString(undefined, options);
        if (!event.estimatedEndDate) {
            return `${prefix}${start}`;
        }

        const end = event.estimatedEndDate.toLocaleDateString(undefined, options);
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
        this.cardScale = 1;
        this.cardVerticalOffsetBottom = 0;
        this.cardVerticalOffsetTop = 0;
        this.cardTransformOffset = 0;
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
