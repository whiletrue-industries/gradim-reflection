import { Component, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Layout } from 'common';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';

interface CanvasItem {
  id: string;
  type: 'iframe';
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number; // relative item scale
}

@Component({
  selector: 'app-monadic-mockup',
  imports: [Layout, DecimalPipe],
  templateUrl: './monadic-mockup.html',
  styleUrl: './monadic-mockup.less',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonadicMockup {
  private readonly sanitizer = inject(DomSanitizer);

  // View state
  protected readonly isExpanded = signal(false);
  protected readonly baseUrl = 'https://lab.jona.im/monadic-embedded/#240222';

  // Zoom/pan state
  private readonly minScale = 0.1;
  private readonly maxScale = 4;
  protected readonly scale = signal(this.minScale); // start at minimal scale
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  // Content transform based on global zoom/pan
  protected readonly contentTransform = computed(() => {
    return `translate(${this.panX()}px, ${this.panY()}px) scale(${this.scale()})`;
  });

  // Single item: the monadic iframe
  protected readonly monadicItem: CanvasItem = {
    id: 'monadic-iframe',
    type: 'iframe',
    x: 400,
    y: 300,
    width: 1200,
    height: 800,
    scale: 1 // item’s own scale; combined with global scale
  };

  protected itemTransform(item: CanvasItem): string {
    return `translate(${item.x}px, ${item.y}px) scale(${item.scale})`;
  }

  // Iframe URL
  protected readonly iframeSrc = computed(() => {
    const url = this.currentUrl();
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly currentUrl = computed(() =>
    this.isExpanded() ? `${this.baseUrl}/expanded` : this.baseUrl
  );

  protected toggleView(): void {
    this.isExpanded.update(value => !value);
  }

  // Interaction handlers
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    const oldScale = this.scale();
    // Zoom towards cursor position; basic exponential scaling
    const zoomFactor = 1 + (-event.deltaY * 0.001);
    let newScale = oldScale * zoomFactor;
    newScale = Math.min(this.maxScale, Math.max(this.minScale, newScale));

    // Keep world point under cursor stable: adjust pan
    const worldX = (cursorX - this.panX()) / oldScale;
    const worldY = (cursorY - this.panY()) / oldScale;
    const newPanX = cursorX - worldX * newScale;
    const newPanY = cursorY - worldY * newScale;

    this.scale.set(newScale);
    this.panX.set(newPanX);
    this.panY.set(newPanY);
  }

  protected onPointerDown(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX();
    this.panStartY = this.panY();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    this.panX.set(this.panStartX + dx);
    this.panY.set(this.panStartY + dy);
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }
}
