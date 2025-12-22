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
  AfterViewInit,
  OnDestroy,
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
export class Canvas implements AfterViewInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private animationFrameId: number | null = null;
  private resizeHandler: (() => void) | null = null;

  // Zoom configuration
  private readonly MIN_ZOOM = 0.1;
  private readonly MAX_ZOOM = 10;
  protected readonly zoom = signal(1.0);
  protected readonly zoomPercentage = computed(() => Math.round(this.zoom() * 100));

  // Grid configuration
  private readonly baseGridSize = 20; // Base grid size in pixels at 100% zoom
  private readonly dotRadius = 1;
  private readonly dotColor = '#CCCCCC';
  private readonly dotColorRgb = this.hexToRgb(this.dotColor); // Cached RGB values
  private readonly gridScales = [0.1, 0.5, 1, 2, 5, 10]; // Multiple scales for smooth transitions

  // Grid size limits and fade thresholds
  private readonly MIN_GRID_SIZE = 5;
  private readonly MAX_GRID_SIZE = 200;
  private readonly FADE_IN_THRESHOLD = 15; // Start fading in at this size
  private readonly FADE_OUT_THRESHOLD = 100; // Start fading out at this size

  constructor() {
    // Only run in browser
    if (isPlatformBrowser(this.platformId)) {
      // Re-render when zoom changes
      effect(() => {
        this.zoom(); // Track zoom signal
        this.render();
      });

      // Handle window resize
      this.resizeHandler = () => this.handleResize();
      window.addEventListener('resize', this.resizeHandler);
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
    
    // Remove resize listener
    if (isPlatformBrowser(this.platformId) && this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }

  private setupCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    const container = canvas.parentElement;

    if (!container) return;

    // Set canvas size to match container, accounting for device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Scale context to account for device pixel ratio
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }

  private handleResize(): void {
    this.setupCanvas();
    this.render();
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();

    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;

    const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom() * zoomFactor));
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

    // Get container dimensions (for logical pixels)
    const container = canvas.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const currentZoom = this.zoom();

    // Iterate through grid scales for smooth multi-scale rendering
    for (const scale of this.gridScales) {
      const gridSize = this.baseGridSize * scale * currentZoom;

      // Skip if grid is too small or too large
      if (gridSize < this.MIN_GRID_SIZE || gridSize > this.MAX_GRID_SIZE) continue;

      // Calculate opacity based on grid size (fade in/out effect)
      let opacity = 1;

      // Fade in when grid is small
      if (gridSize < this.FADE_IN_THRESHOLD) {
        const fadeRange = this.FADE_IN_THRESHOLD - this.MIN_GRID_SIZE;
        opacity = (gridSize - this.MIN_GRID_SIZE) / fadeRange;
      }
      // Fade out when grid is large
      else if (gridSize > this.FADE_OUT_THRESHOLD) {
        const fadeRange = this.MAX_GRID_SIZE - this.FADE_OUT_THRESHOLD;
        opacity = (this.MAX_GRID_SIZE - gridSize) / fadeRange;
      }

      // Ensure opacity is in valid range
      opacity = Math.max(0, Math.min(1, opacity));

      if (opacity > 0) {
        this.drawDotsAtScale(ctx, width, height, gridSize, opacity);
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

    // Use cached RGB values with opacity
    const { r, g, b } = this.dotColorRgb;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;

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
    // Validate input
    if (!hex || typeof hex !== 'string') {
      return { r: 0, g: 0, b: 0 };
    }

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
