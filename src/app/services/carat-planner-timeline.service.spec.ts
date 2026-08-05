import { fakeAsync, tick } from '@angular/core/testing';
import { CaratPlannerTimelineService } from './carat-planner-timeline.service';

describe('CaratPlannerTimelineService', () => {
  it('defers planner persistence so a timeline button can paint optimistically', fakeAsync(() => {
    const setEventActive = jasmine.createSpy('setEventActive');
    const persistence = {
      activePlan: { id: 'plan-1' },
      setEventActive,
    };
    const service = new CaratPlannerTimelineService(persistence as never, {} as never);
    const event = {
      id: 'banner-1',
      title: 'Banner',
      type: 'support_banner',
      globalReleaseDate: '2030-01-01',
    };

    service.setEventActive(event, true);
    expect(setEventActive).not.toHaveBeenCalled();

    tick(16);
    expect(setEventActive).toHaveBeenCalledOnceWith(event, true);
  }));

  it('coalesces rapid toggles to the latest requested state', fakeAsync(() => {
    const setEventActive = jasmine.createSpy('setEventActive');
    const persistence = { activePlan: { id: 'plan-1' }, setEventActive };
    const service = new CaratPlannerTimelineService(persistence as never, {} as never);
    const event = { id: 'banner-1', title: 'Banner' };

    service.setEventActive(event, true);
    service.setEventActive(event, false);
    tick(16);

    expect(setEventActive).toHaveBeenCalledOnceWith(event, false);
  }));
});
