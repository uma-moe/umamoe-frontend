import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SimplePageEvent {
  pageIndex: number;
  previousPageIndex?: number;
  pageSize: number;
  length: number;
}

@Component({
  selector: 'app-simple-paginator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <nav class="simple-paginator" aria-label="Pagination">
      <span class="simple-paginator__range">{{ rangeLabel }}</span>
      <label>
        <span>Rows</span>
        <select [ngModel]="pageSize" (ngModelChange)="changePageSize($event)">
          <option *ngFor="let size of pageSizeOptions" [ngValue]="size">{{ size }}</option>
        </select>
      </label>
      <button type="button" (click)="goTo(pageIndex - 1)" [disabled]="pageIndex <= 0" aria-label="Previous page">‹</button>
      <span>{{ pageIndex + 1 }} / {{ pageCount }}</span>
      <button type="button" (click)="goTo(pageIndex + 1)" [disabled]="pageIndex >= pageCount - 1" aria-label="Next page">›</button>
    </nav>
  `,
  styles: [`
    :host { display: block; }
    .simple-paginator { display: flex; align-items: center; justify-content: flex-end; gap: .75rem; min-height: 56px; padding: .5rem; color: var(--text-secondary); }
    label { display: inline-flex; align-items: center; gap: .4rem; }
    select, button { min-height: 36px; border: 1px solid var(--border-primary); border-radius: var(--radius-sm); color: var(--text-primary); background: var(--surface-2); }
    select { padding: 0 .5rem; }
    button { min-width: 36px; font-size: 1.35rem; cursor: pointer; }
    button:disabled { cursor: default; opacity: .4; }
    @media (max-width: 520px) { .simple-paginator { justify-content: center; flex-wrap: wrap; } .simple-paginator__range { width: 100%; text-align: center; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimplePaginatorComponent {
  @Input() length = 0;
  @Input() pageSize = 25;
  @Input() pageIndex = 0;
  @Input() pageSizeOptions: number[] = [25, 50, 100];
  @Output() page = new EventEmitter<SimplePageEvent>();

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.length / Math.max(1, this.pageSize)));
  }

  get rangeLabel(): string {
    if (!this.length) return '0 of 0';
    const start = this.pageIndex * this.pageSize + 1;
    const end = Math.min(this.length, start + this.pageSize - 1);
    return `${start}–${end} of ${this.length}`;
  }

  goTo(pageIndex: number): void {
    const nextPage = Math.max(0, Math.min(this.pageCount - 1, pageIndex));
    if (nextPage === this.pageIndex) return;
    this.page.emit({
      previousPageIndex: this.pageIndex,
      pageIndex: nextPage,
      pageSize: this.pageSize,
      length: this.length,
    });
  }

  changePageSize(pageSize: number): void {
    this.page.emit({
      previousPageIndex: this.pageIndex,
      pageIndex: 0,
      pageSize: Number(pageSize),
      length: this.length,
    });
  }
}
