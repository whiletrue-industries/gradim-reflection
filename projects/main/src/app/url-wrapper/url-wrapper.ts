import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
export class UrlWrapper {
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

  protected currentUrl = signal<string>('');
  protected safeContextUrl = signal<SafeResourceUrl | null>(null);

  constructor() {
    const initialUrl = this.getInitialWallUrl();
    this.currentUrl.set(initialUrl);
    this.safeContextUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(initialUrl));
  }

  protected shareToCanvas(): void {
    console.log('[UrlWrapper] shareToCanvas clicked');
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

    try {
      sessionStorage.setItem('wall-url', url);
    } catch (error) {
      console.warn('[UrlWrapper] Could not store wall-url', error);
    }

    const basePath = this.getBasePath();
    const canvasUrl = `${basePath}sample-reflect/?loadUrl=${urlKey}`;
    console.log('[UrlWrapper] Navigating to canvas:', canvasUrl);
    window.location.href = canvasUrl;
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

  private getBasePath(): string {
    const path = window.location.pathname;
    const lastSlash = path.lastIndexOf('/') + 1;
    return path.substring(0, lastSlash);
  }

  private getInitialWallUrl(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return getRandomGradimUrl();
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('wallUrl');
      if (fromQuery) {
        return fromQuery;
      }
    } catch {}

    return getRandomGradimUrl();
  }
}
