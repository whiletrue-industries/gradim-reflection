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

    const basePath = this.getBasePath();
    const canvasUrl = `${basePath}sample-reflect/?shareUrl=${encodeURIComponent(url)}`;
    console.log('[UrlWrapper] Navigating to canvas with shareUrl:', canvasUrl);
    window.location.href = canvasUrl;
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
