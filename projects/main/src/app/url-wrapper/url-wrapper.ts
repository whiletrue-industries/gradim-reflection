import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PLATFORM_ID } from '@angular/core';
import { fetchRandomGradimUrlFromApi } from '../gradim-urls';

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
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  protected currentUrl = signal<string>('');
  protected safeContextUrl = signal<SafeResourceUrl | null>(null);

  constructor() {
    const wallUrlFromLocation = this.getWallUrlFromLocation();
    if (wallUrlFromLocation) {
      this.setUrl(wallUrlFromLocation);
    }

    if (this.isBrowser && !wallUrlFromLocation) {
      this.loadRandomUrlFromApi();
    }
  }

  protected shareToCanvas(): void {
    const wallUrl = this.getWallUrlFromLocation() ?? this.currentUrl();
    if (!wallUrl) return;

    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    let target: URL;
    if (isLocalHost) {
      // On localhost, use same port with /sample-reflect/ proxy route
      target = new URL('/sample-reflect/', window.location.href);
    } else {
      // In production, route to sample-reflect/ relative path
      target = new URL('sample-reflect/', window.location.href);
    }
    target.searchParams.set('shareUrl', wallUrl);
    
    // Also update the wallUrl query param so it persists in the hash when navigating back
    if (!this.getWallUrlFromLocation()) {
      window.history.replaceState(null, '', `?wallUrl=${encodeURIComponent(wallUrl)}`);
    }
    
    window.location.href = target.toString();
  }

  private getWallUrlFromLocation(): string | null {
    if (!this.isBrowser) return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('wallUrl');
      return fromQuery || null;
    } catch {
      return null;
    }
  }

  private setUrl(url: string): void {
    if (!url) return;
    this.currentUrl.set(url);
    this.safeContextUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  private async loadRandomUrlFromApi(): Promise<void> {
    const apiUrl = await fetchRandomGradimUrlFromApi();
    if (!apiUrl) return;
    this.setUrl(apiUrl);
  }
}
