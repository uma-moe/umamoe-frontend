import { ChangeDetectorRef } from '@angular/core';
import { CaratPlannerCalculationService } from '../../services/carat-planner-calculation.service';
import { CaratPullProbabilityService } from '../../services/carat-pull-probability.service';
import { TimelineAvatarService } from '../../services/timeline-avatar.service';
import { CaratPlannerComponent } from './carat-planner.component';

describe('CaratPlannerComponent popovers', () => {
  it('dismisses open planner popovers and search results from an outside pointer press', () => {
    const host = document.createElement('div');
    const picker = document.createElement('div');
    picker.className = 'cp-picker--primary';
    const details = document.createElement('details');
    details.className = 'cp-popover';
    details.open = true;
    host.append(picker, details);

    const component = new CaratPlannerComponent(
      new CaratPlannerCalculationService(),
      new CaratPullProbabilityService(),
      {} as never,
      {} as never,
      new TimelineAvatarService(),
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
      { nativeElement: host },
    );
    component.showEventPicker = true;

    component.onDocumentPointerDown({ target: document.body } as unknown as PointerEvent);

    expect(component.showEventPicker).toBeFalse();
    expect(details.open).toBeFalse();
  });
});
