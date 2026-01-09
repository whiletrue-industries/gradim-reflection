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

    // Send message to parent window to open canvas
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'openCanvas',
        url: currentUrl
      }, '*');
    }
  }
}
