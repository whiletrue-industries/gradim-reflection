import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  viewChild,
  signal,
  effect,
  computed,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'lib-canvas',
  imports: [],
  templateUrl: './canvas.html',
  styleUrl: './canvas.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(wheel)': 'onWheel($event)',
  },
})
export class Canvas {
  private platformId = inject(PLATFORM_ID);
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private animationFrameId: number | null = null;

  // Zoom state
  protected readonly zoom = signal(1.0);
  protected readonly zoomPercentage = computed(() => Math.round(this.zoom() * 100));

  // Grid configuration
  private readonly baseGridSize = 20; // Base grid size in pixels at 100% zoom
  private readonly dotRadius = 1;
  private readonly dotColor = '#CCCCCC';
  private readonly fadeRange = 0.3; // Range for fade effect (0.3 = 30% of scale transition)

  constructor() {
    // Only run in browser
    if (isPlatformBrowser(this.platformId)) {
      // Re-render when zoom changes
      effect(() => {
        this.zoom(); // Track zoom signal
        this.render();
      });

      // Handle window resize
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => this.handleResize());
      }
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setupCanvas();
      this.render();
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private setupCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    const container = canvas.parentElement;

    if (!container) return;

    // Set canvas size to match container
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }

  private handleResize(): void {
    this.setupCanvas();
    this.render();
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();

    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;

    const newZoom = Math.max(0.1, Math.min(10, this.zoom() * zoomFactor));
    this.zoom.set(newZoom);
  }

  protected resetZoom(): void {
    this.zoom.set(1.0);
  }

  private render(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.drawGrid();
      this.animationFrameId = null;
    });
  }

  private drawGrid(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentZoom = this.zoom();

    // Calculate the appropriate grid scales to show
    // We show multiple scales with fade in/out effect
    const scales = [0.1, 0.5, 1, 2, 5, 10];

    for (const scale of scales) {
      const gridSize = this.baseGridSize * scale * currentZoom;

      // Skip if grid is too small or too large
      if (gridSize < 5 || gridSize > 200) continue;

      // Calculate opacity based on grid size (fade in/out effect)
      let opacity = 1;

      // Fade out when too small
      if (gridSize < 15) {
        opacity = (gridSize - 5) / 10; // Fade from 5 to 15
      }
      // Fade out when too large
      else if (gridSize > 100) {
        opacity = (200 - gridSize) / 100; // Fade from 100 to 200
      }

      // Ensure opacity is in valid range
      opacity = Math.max(0, Math.min(1, opacity));

      if (opacity > 0) {
        this.drawDotsAtScale(ctx, canvas.width, canvas.height, gridSize, opacity);
      }
    }
  }

  private drawDotsAtScale(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    gridSize: number,
    opacity: number
  ): void {
    // Calculate starting positions to center the grid
    const startX = (width % gridSize) / 2;
    const startY = (height % gridSize) / 2;

    // Parse the dot color and add opacity
    const rgb = this.hexToRgb(this.dotColor);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;

    // Draw dots
    for (let x = startX; x < width; x += gridSize) {
      for (let y = startY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, this.dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }
}
