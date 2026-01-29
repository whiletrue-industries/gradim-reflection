import { Component, input, output, computed, signal, effect, ChangeDetectionStrategy, isPlatformBrowser, PLATFORM_ID, inject, afterNextRender } from '@angular/core';
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
            <span class="circle">
              @switch (i) {
                @case (0) {
                  <i data-feather="image" aria-hidden="true"></i>
                }
                @case (1) {
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 22 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7.2207 8.12109C8.26595 8.12109 9.11328 7.27376 9.11328 6.22852C9.11328 5.18327 8.26595 4.33594 7.2207 4.33594C6.17546 4.33594 5.32812 5.18327 5.32812 6.22852C5.32812 7.27376 6.17546 8.12109 7.2207 8.12109Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9.33211 10.2841L7.32145 8.27344L2.32812 13.2676" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                }
                @case (2) {
                  <i data-feather="git-merge" aria-hidden="true"></i>
                }
                @case (3) {
                  <i data-feather="map" aria-hidden="true"></i>
                }
                @case (4) {
                  <i data-feather="pen-tool" aria-hidden="true"></i>
                }
                @case (5) {
                  <i data-feather="triangle" aria-hidden="true"></i>
                }
                @case (6) {
                  <i data-feather="scissors" aria-hidden="true"></i>
                }
                @case (7) {
                  <i data-feather="target" aria-hidden="true"></i>
                }
              }
            </span>
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
  private platformId = inject(PLATFORM_ID);
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

    // Load and replace feather icons on render
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.replaceFeatherIcons();
      });
    }
  }

  private replaceFeatherIcons(): void {
    try {
      const w = window as any;
      if (w.feather && typeof w.feather.replace === 'function') {
        setTimeout(() => { try { w.feather.replace(); } catch (e) {} }, 0);
        return;
      }
      // Load feather from CDN once and run replace on load
      const scriptId = 'feather-icons-cdn';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js';
        script.async = true;
        script.onload = () => {
          try { (window as any).feather.replace(); } catch (e) {}
        };
        document.head.appendChild(script);
      } else {
        // script exists but feather not ready yet
        setTimeout(() => { try { (window as any).feather.replace(); } catch (e) {} }, 200);
      }
    } catch (e) {
      // ignore failures
    }
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
