import { Component, signal, inject, PLATFORM_ID, afterNextRender } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.less'
})
export class App {
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  
  protected contextUrl = signal<string>('');
  protected safeContextUrl = signal<SafeResourceUrl | null>(null);
  protected canvasVisible = signal(false);
  protected safeCanvasUrl = signal<SafeResourceUrl | null>(null);
  
  constructor() {
    // Get URL from query parameter for context iframe
    this.route.queryParams.subscribe(params => {
      const url = params['url'] || 'https://gradim-wall.netlify.app/';
      this.contextUrl.set(url);
      
      // Create URL for the URL wrapper with the target URL as a parameter
      const wrapperUrl = `/url-wrapper?url=${encodeURIComponent(url)}`;
      this.safeContextUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(wrapperUrl));
    });
    
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.setupMessageListener();
      });
    }
  }
  
  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      // Security: verify origin if needed
      if (event.data.type === 'openCanvas') {
        const url = event.data.url || this.contextUrl();
        this.openCanvas(url);
      } else if (event.data.type === 'closeCanvas') {
        this.closeCanvas();
      }
    });
  }
  
  private openCanvas(url: string): void {
    // Store URL in sessionStorage for canvas to pick up
    const urlKey = `pending-canvas-url-${crypto.randomUUID()}`;
    try {
      sessionStorage.setItem(urlKey, url);
    } catch (error) {
      console.error('Failed to store URL in sessionStorage:', error);
      return;
    }
    
    // Set canvas URL with the load parameter
    const canvasUrl = `/sample-reflect?loadUrl=${urlKey}`;
    this.safeCanvasUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(canvasUrl));
    
    // Show canvas iframe
    this.canvasVisible.set(true);
  }
  
  protected closeCanvas(): void {
    this.canvasVisible.set(false);
    // Reset canvas URL after animation
    setTimeout(() => {
      this.safeCanvasUrl.set(null);
    }, 300);
  }
}
