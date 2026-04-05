import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { fetchMultipleArchiveImageUrls } from '../../archive-utils';

interface ArchiveThumbnail {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  loaded: boolean;
}

@Component({
  selector: 'app-archive-drawer',
  imports: [],
  templateUrl: './archive-drawer.html',
  styleUrl: './archive-drawer.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveDrawer {
  private readonly platformId = inject(PLATFORM_ID);

  /** Emits the direct image URL when a thumbnail is clicked. */
  readonly thumbnailSelected = output<string>();

  protected readonly isOpen = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly thumbnails = signal<ArchiveThumbnail[]>([]);

  // Drag state (private write, exposed as readonly)
  private readonly _isDragging = signal(false);
  protected readonly isDragging = this._isDragging.asReadonly();
  private readonly _dragOffsetPx = signal(0);

  private readonly THUMBNAIL_COUNT = 10;
  /** Target pixel area for thumbnail normalisation (~224 × 224 px equivalent). */
  private readonly TARGET_PIXEL_AREA = 50_000;
  /** Max rotation in either direction (degrees). */
  private readonly MAX_ROTATION_DEG = 16;
  /** Visible height of the handle tab (px). */
  private readonly HANDLE_HEIGHT_PX = 48;

  // Drag bookkeeping
  private pointerDownY = 0;
  private startOffsetPx = 0;
  private movedSignificantly = false;

  // ------------------------------------------------------------------
  // Computed styles
  // ------------------------------------------------------------------

  protected readonly drawerTransform = computed((): string => {
    if (this._isDragging()) {
      return `translateY(${this._dragOffsetPx()}px)`;
    }
    return this.isOpen()
      ? 'translateY(0)'
      : `translateY(calc(-75vh + ${this.HANDLE_HEIGHT_PX}px))`;
  });

  protected readonly drawerTransition = computed((): string =>
    this._isDragging() ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  );

  // ------------------------------------------------------------------
  // Handle pointer events
  // ------------------------------------------------------------------

  protected onHandlePointerDown(event: PointerEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.pointerDownY = event.clientY;
    this.movedSignificantly = false;
    this.startOffsetPx = this.isOpen() ? 0 : this.closedOffsetPx();
    this._dragOffsetPx.set(this.startOffsetPx);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch (_err) {
      // setPointerCapture may fail with synthetic or cancelled pointer events
    }
    event.preventDefault();
  }

  protected onHandlePointerMove(event: PointerEvent): void {
    if (!isPlatformBrowser(this.platformId) || event.buttons === 0) return;
    const dy = event.clientY - this.pointerDownY;
    if (Math.abs(dy) > 8) {
      this.movedSignificantly = true;
      this._isDragging.set(true);
    }
    if (this._isDragging()) {
      const raw = this.startOffsetPx + dy;
      const clamped = Math.max(this.closedOffsetPx(), Math.min(0, raw));
      this._dragOffsetPx.set(clamped);
    }
  }

  protected onHandlePointerUp(): void {
    const wasDragging = this._isDragging();
    this._isDragging.set(false);

    if (!wasDragging || !this.movedSignificantly) {
      // Treat as a click — toggle the drawer
      this.toggle();
    } else {
      // Snap: open if past the midpoint, close otherwise
      const mid = this.closedOffsetPx() / 2; // negative midpoint
      const shouldOpen = this._dragOffsetPx() > mid;
      if (shouldOpen !== this.isOpen()) {
        this.isOpen.set(shouldOpen);
        if (shouldOpen) {
          this.fetchAndDisplay();
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Toggle (keyboard / programmatic)
  // ------------------------------------------------------------------

  protected toggle(): void {
    const opening = !this.isOpen();
    this.isOpen.set(opening);
    if (opening) {
      this.fetchAndDisplay();
    }
  }

  // ------------------------------------------------------------------
  // Thumbnail loading
  // ------------------------------------------------------------------

  private async fetchAndDisplay(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isLoading.set(true);
    this.thumbnails.set([]);

    try {
      const urls = await fetchMultipleArchiveImageUrls(this.THUMBNAIL_COUNT);
      const contentW = window.innerWidth;
      const contentH = window.innerHeight * 0.75 - this.HANDLE_HEIGHT_PX;
      const defaultSize = Math.round(Math.sqrt(this.TARGET_PIXEL_AREA));
      const padX = 40;
      const padY = 40;

      const thumbs: ArchiveThumbnail[] = urls.map((url, i) => ({
        id: `arch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        url,
        x: padX + Math.random() * Math.max(0, contentW - defaultSize - padX * 2),
        y: padY + Math.random() * Math.max(0, contentH - defaultSize - padY * 2),
        width: defaultSize,
        height: defaultSize,
        rotation: (Math.random() - 0.5) * this.MAX_ROTATION_DEG * 2,
        loaded: false,
      }));
      this.thumbnails.set(thumbs);
    } finally {
      this.isLoading.set(false);
    }
  }

  // ------------------------------------------------------------------
  // Thumbnail event handlers
  // ------------------------------------------------------------------

  protected onThumbnailLoad(event: Event, thumbId: string): void {
    const img = event.target as HTMLImageElement;
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth > 0 && naturalHeight > 0) {
      const scale = Math.sqrt(this.TARGET_PIXEL_AREA / (naturalWidth * naturalHeight));
      const w = Math.round(naturalWidth * scale);
      const h = Math.round(naturalHeight * scale);
      this.thumbnails.update(ts =>
        ts.map(t => (t.id === thumbId ? { ...t, width: w, height: h, loaded: true } : t)),
      );
    }
  }

  protected onThumbnailError(thumbId: string): void {
    this.thumbnails.update(ts => ts.filter(t => t.id !== thumbId));
  }

  protected onThumbnailClick(thumb: ArchiveThumbnail): void {
    this.thumbnailSelected.emit(thumb.url);
    this.isOpen.set(false);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  protected getThumbnailTransform(thumb: ArchiveThumbnail): string {
    return `rotate(${thumb.rotation}deg)`;
  }

  private closedOffsetPx(): number {
    if (!isPlatformBrowser(this.platformId)) return 0;
    return -(window.innerHeight * 0.75 - this.HANDLE_HEIGHT_PX);
  }
}
