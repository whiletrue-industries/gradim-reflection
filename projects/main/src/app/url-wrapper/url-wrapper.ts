import { Component, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-url-wrapper',
  imports: [CommonModule],
  templateUrl: './url-wrapper.html',
  styleUrl: './url-wrapper.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlWrapper {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  protected url = signal<string>('');
  protected safeUrl = computed<SafeResourceUrl | null>(() => {
    const urlValue = this.url();
    return urlValue ? this.sanitizer.bypassSecurityTrustResourceUrl(urlValue) : null;
  });

  constructor() {
    // Get URL from query parameter
    this.route.queryParams.subscribe(params => {
      const url = params['url'] || 'https://gradim-wall.netlify.app/';
      this.url.set(url);
    });
  }

  protected onShare(): void {
    const currentUrl = this.url();
    if (!currentUrl) return;

    // Store the URL in sessionStorage with a unique key
    // Using crypto.randomUUID() for better uniqueness guarantees
    const urlKey = `pending-canvas-url-${crypto.randomUUID()}`;
    try {
      sessionStorage.setItem(urlKey, currentUrl);
      console.log('[URL Wrapper] Stored URL with key:', urlKey, 'URL:', currentUrl);
    } catch (error) {
      console.error('Failed to store URL in sessionStorage:', error);
      return;
    }

    // Navigate to sample-reflect with the URL key as a query parameter
    // The canvas will read the URL from sessionStorage
    console.log('[URL Wrapper] Navigating to /sample-reflect with loadUrl:', urlKey);
    this.router.navigate(['/sample-reflect'], {
      queryParams: { loadUrl: urlKey }
    });
  }
}
