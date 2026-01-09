import { Component, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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

    // Navigate to sample-reflect with the URL in the hash
    // Hash format: #canvas/x,y,zoom#encodedURL/x,y,scale,rotation/flags
    // The canvas component uses # as a delimiter between segments
    const encodedUrl = encodeURIComponent(currentUrl);
    // Calculate position to center the iframe in viewport (assuming 1920x1080 viewport)
    const centerX = 960 - 300; // viewport center - half of iframe width
    const centerY = 540 - 200; // viewport center - half of iframe height
    const scale = 3; // 600px width = 200 * 3 scale
    const hash = `canvas/0,0,1#${encodedUrl}/${centerX},${centerY},${scale},0/type:iframe,ratio:0.667,mode:image`;
    
    // Clear sessionStorage to prevent old hash from being restored
    try {
      sessionStorage.removeItem('canvasLastHash');
    } catch {}
    
    // Navigate using full URL to preserve hash
    window.location.href = `${window.location.origin}/sample-reflect#${hash}`;
  }
}
