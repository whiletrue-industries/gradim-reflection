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
  protected savedComposition = signal<string | null>(null);

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
      // If canvas sent back a composition state, save it
      if (event.data.compositionHash) {
        try {
          // Store just the hash part (e.g., #data-...)
          this.savedComposition.set(event.data.compositionHash);
          sessionStorage.setItem('canvasComposition', event.data.compositionHash);
        } catch (error) {
          console.error('Failed to store composition state:', error);
        }
      }
      this.closeCanvas();
    } else if (event.data?.type === 'shareImage') {
      // Handle share image from canvas - do this immediately while we're in a user gesture context
      console.log('[UrlWrapper] Received shareImage message, handling immediately');
      this.handleShareImageImmediately(event.data.blobUrl, event.data.filename);
    }
  };

  private handleShareImageImmediately(blobUrl: string, filename: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    console.log('[UrlWrapper] handleShareImageImmediately called');
    console.log('[UrlWrapper] navigator.share available:', !!navigator.share);
    
    // Try navigator.share first
    if (navigator.share) {
      console.log('[UrlWrapper] Attempting navigator.share with blob URL');
      
      fetch(blobUrl)
        .then(res => res.blob())
        .then(blob => {
          console.log('[UrlWrapper] Blob fetched, sharing');
          const file = new File([blob], filename, { type: 'image/png' });
          return navigator.share({
            files: [file],
            title: 'My Composition',
          });
        })
        .then(() => {
          console.log('[UrlWrapper] Share completed');
          URL.revokeObjectURL(blobUrl);
        })
        .catch(err => {
          console.error('[UrlWrapper] Share error:', err?.message);
          URL.revokeObjectURL(blobUrl);
        });
    } else {
      console.log('[UrlWrapper] navigator.share not available on this platform');
      console.log('[UrlWrapper] On iOS Safari, try long-pressing the image in the canvas and selecting "Save Image"');
      URL.revokeObjectURL(blobUrl);
    }
  }

  protected shareToCanvas(): void {
    console.log('[UrlWrapper] shareToCanvas clicked');
    this.isClosing.set(false);
    const url = this.currentUrl();
    if (!url) {
      console.warn('[UrlWrapper] No URL to share');
      return;
    }

    const urlKey = this.buildUrlKey();
    console.log('[UrlWrapper] Generated URL key:', urlKey);
    
    try {
      sessionStorage.setItem(urlKey, url);
      console.log('[UrlWrapper] Stored URL in sessionStorage');
    } catch (error) {
      console.error('[UrlWrapper] Failed to store URL in sessionStorage:', error);
      return;
    }

    // Construct canvas URL relative to current location for GitHub Pages compatibility
    // Get the base path (e.g., '/gradim-reflection/' on GitHub Pages)
    const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const canvasUrl = `${basePath}sample-reflect/?loadUrl=${urlKey}`;
    console.log('[UrlWrapper] Opening canvas with URL:', canvasUrl);
    
    this.safeCanvasUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(canvasUrl));
    this.canvasVisible.set(true);
    console.log('[UrlWrapper] Canvas opened, canvasVisible:', this.canvasVisible());
  }

  private buildUrlKey(): string {
    const browserCrypto = globalThis.crypto;
    if (browserCrypto?.randomUUID) {
      return `pending-canvas-url-${browserCrypto.randomUUID()}`;
    }

    if (browserCrypto?.getRandomValues) {
      const buffer = new Uint8Array(16);
      browserCrypto.getRandomValues(buffer);
      const randomHex = Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
      return `pending-canvas-url-${randomHex}`;
    }

    const fallback = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return `pending-canvas-url-${fallback}`;
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

  protected viewSavedComposition(): void {
    const composition = this.savedComposition();
    if (!composition) {
      return;
    }

    this.isClosing.set(false);
    const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const canvasUrl = `${basePath}sample-reflect/${composition}`;
    this.safeCanvasUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(canvasUrl));
    this.canvasVisible.set(true);
  }
}
