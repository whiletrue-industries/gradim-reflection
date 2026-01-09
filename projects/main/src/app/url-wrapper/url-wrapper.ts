import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PLATFORM_ID } from '@angular/core';
import { getRandomGradimUrl } from '../gradim-urls';

@Component({
  selector: 'app-url-wrapper',
  imports: [CommonModule],
  templateUrl: './url-wrapper.html',
  styleUrl: './url-wrapper.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlWrapper implements OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

  protected currentUrl = signal<string>('');
  protected safeContextUrl = signal<SafeResourceUrl | null>(null);
  protected canvasVisible = signal(false);
  protected safeCanvasUrl = signal<SafeResourceUrl | null>(null);
  protected isClosing = signal(false);

  constructor() {
    const randomUrl = getRandomGradimUrl();
    this.currentUrl.set(randomUrl);
    this.safeContextUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(randomUrl));

    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('message', this.handleMessage);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('message', this.handleMessage);
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.data?.type === 'closeCanvas') {
      this.closeCanvas();
    }
  };

  protected shareToCanvas(): void {
    this.isClosing.set(false);
    const url = this.currentUrl();
    if (!url) {
      return;
    }

    const urlKey = `pending-canvas-url-${crypto.randomUUID()}`;
    try {
      sessionStorage.setItem(urlKey, url);
    } catch (error) {
      console.error('Failed to store URL in sessionStorage:', error);
      return;
    }

    // Construct canvas URL relative to current location for GitHub Pages compatibility
    // Get the base path (e.g., '/gradim-reflection/' on GitHub Pages)
    const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const canvasUrl = `${basePath}sample-reflect/?loadUrl=${urlKey}`;
    this.safeCanvasUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(canvasUrl));
    this.canvasVisible.set(true);
  }

  protected closeCanvas(): void {
    if (!this.canvasVisible()) {
      return;
    }
    this.isClosing.set(true);
    setTimeout(() => {
      this.canvasVisible.set(false);
      this.safeCanvasUrl.set(null);
      this.isClosing.set(false);
    }, 240);
  }
}
