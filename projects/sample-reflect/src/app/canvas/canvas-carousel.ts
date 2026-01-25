import { Component, input, output, computed, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CANVAS_APPS } from './canvas-apps';

@Component({
  selector: 'app-canvas-carousel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="carousel-container" (touchstart)="onTouchStart($event)" (touchmove)="onTouchMove($event)" (touchend)="onTouchEnd($event)">
      <div class="carousel-track" [ngStyle]="{ transform: 'translateX(' + carouselOffset() + 'px)' }">
        @for (app of apps; let i = $index; track app.id) {
          <button
            class="carousel-button"
            [class.active]="selectedAppIndex() === i"
            (click)="selectApp(i)"
            [attr.aria-label]="app.label"
          >
            <span class="circle">{{ i + 1 }}</span>
          </button>
        }
      </div>
      @if (apps[selectedAppIndex()]) {
        <div class="app-label">{{ apps[selectedAppIndex()].label }}</div>
      }
    </div>
  `,
  styleUrl: './canvas-carousel.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasCarousel {
  apps = CANVAS_APPS;
  selectedAppIndex = input<number>(0);
  appChanged = output<number>();

  private touchStartX = 0;
  private touchCurrentX = 0;
  protected carouselOffset = signal(0);
  private viewportWidth = 0;

  protected computedOffset = computed(() => {
    const index = this.selectedAppIndex();
    const buttonWidth = 84; // button + gap
    // Center the active button: move track left so button is at viewport center
    // Offset = -(button_position) where button_position = index * buttonWidth
    // Then shift right by half viewport width to center
    const viewportCenter = this.viewportWidth / 2;
    const buttonPosition = index * buttonWidth + buttonWidth / 2; // center of the button
    return viewportCenter - buttonPosition;
  });

  constructor() {
    // Get viewport width for centering calculation
    if (typeof window !== 'undefined') {
      this.viewportWidth = window.innerWidth;
      window.addEventListener('resize', () => {
        this.viewportWidth = window.innerWidth;
      });
    }
    
    // Update carousel position when app changes
    this.carouselOffset.set(this.computedOffset());
    effect(() => {
      this.carouselOffset.set(this.computedOffset());
    });
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchCurrentX = this.touchStartX;
  }

  onTouchMove(event: TouchEvent): void {
    this.touchCurrentX = event.touches[0].clientX;
    const diff = this.touchCurrentX - this.touchStartX;
    // Apply diff to the computed offset so swiping feels natural
    this.carouselOffset.set(this.computedOffset() + diff);
  }

  onTouchEnd(event: TouchEvent): void {
    const diff = this.touchCurrentX - this.touchStartX;
    const threshold = 30;
    const currentIndex = this.selectedAppIndex();

    if (diff > threshold && currentIndex > 0) {
      this.selectApp(currentIndex - 1);
    } else if (diff < -threshold && currentIndex < this.apps.length - 1) {
      this.selectApp(currentIndex + 1);
    } else {
      // Snap back to computed offset
      this.carouselOffset.set(this.computedOffset());
    }
  }

  selectApp(index: number): void {
    if (index >= 0 && index < this.apps.length) {
      this.appChanged.emit(index);
    }
  }
}
