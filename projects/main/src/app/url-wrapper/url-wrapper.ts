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
    window.location.href = target.toString();
  }

  private getInitialWallUrl(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return getRandomGradimUrl();
    }
    return this.getWallUrlFromLocation() ?? getRandomGradimUrl();
  }

  private getWallUrlFromLocation(): string | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('wallUrl');
      return fromQuery || null;
    } catch {
      return null;
    }
  }
}
