import { Component, signal, computed, ChangeDetectionStrategy, inject, PLATFORM_ID, effect, afterNextRender, Injector, runInInjectionContext } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CanvasCarousel } from './canvas-carousel';
import { CANVAS_APPS } from './canvas-apps';

interface CanvasObject {
  id: string;
  type: 'image' | 'iframe';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content: string; // URL for image or iframe
  sourceRef: string; // canonical ref used in hash (URL or token)
  originalAspectRatio: number; // h/w ratio of original content
  safeUrl?: SafeResourceUrl; // Sanitized URL for iframes
  ogImage?: string | null; // og:image URL for iframe objects
  displayMode?: 'iframe' | 'image'; // Current display mode for iframe objects with og:image
  isEmptyFrame?: boolean; // Flag for empty polaroid frames
  isFrameObject?: boolean; // Any object tied to the frame app (placeholder or uploaded image)
}

interface TransformHandle {
  type: 'move' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'scale-se' | 'scale-w' | 'scale-e' | 'scale-n' | 'scale-s' | 'rotate';
  cursor: string;
}

@Component({
  selector: 'app-canvas',
  imports: [CommonModule, CanvasCarousel],
  templateUrl: './canvas.html',
  styleUrl: './canvas.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Canvas {
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);
  private injector = inject(Injector);

  private readonly baseSize = 200;
  private readonly dataTokenPrefix = 'data-token-';
  private readonly dataFilePrefix = 'file-data-';
  private readonly minZoom = 0.1;
  private readonly maxZoom = 5;
  private hashUpdateHandle: number | null = null;
  private readonly hashThrottleMs = 300; // Increased from 80ms for more robust handling
  private lastSerializedHash = '';
  private suppressHash = false; // suppress hash writes during interactions
  private hashDirty = false;    // track pending changes while suppressed
  private skipNextHashWrite = false; // allow a deliberate empty-hash clear without rewriting it
  private readyForHashWrites = false; // wait until initial restore completes
  private initialFitDone = false; // ensure we only auto-fit once on load
  private restoredFromHash = false; // track if initial state came from URL hash
  private wheelFlushHandle: number | null = null; // debounce wheel flush
  private ephemeralTokens = new Map<string, string>(); // in-memory fallback for tokens
  
  // Default dimensions for new URL objects
  private readonly defaultIframeWidth = 600;
  private readonly defaultIframeHeight = 400;
  private readonly defaultViewportWidth = 1920;
  private readonly defaultViewportHeight = 1080;
  
  // 1x1 transparent PNG to keep image objects alive when content can't resolve yet
  private readonly transparentPixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/hsrLxkAAAAASUVORK5CYII=';
  
  // Touch interaction state
  private touchStartDistance = 0;
  private touchStartZoom = 1;
  private isTouchPinching = false;
  private activeTouches = 0;
  
  // Mobile detection
  protected isMobile = signal(false);
  protected instructionsText = computed(() => {
    if (this.isMobile()) {
      return 'Tap to select • Pinch to zoom • Two fingers to pan';
    }
    return 'Drag & drop images • Paste URLs (Ctrl/Cmd+V) • Scroll to zoom';
  });
  
  protected objects = signal<CanvasObject[]>([]);
  protected selectedObjectId = signal<string | null>(null);
  protected selectedObject = computed(() => {
    const id = this.selectedObjectId();
    return id ? this.objects().find(obj => obj.id === id) : null;
  });
  
  protected viewportX = signal(0);
  protected viewportY = signal(0);
  protected zoom = signal(1);
  // Share menu (mobile)
  protected shareMenuOpen = signal(false);
  // Add menu (mobile)
  protected addMenuOpen = signal(false);
  // URL input modal
  protected showUrlModal = signal(false);
  protected urlInputValue = signal('');
  
  // URL wrapper navigation
  protected cameFromUrlWrapper = signal(false);
  protected urlWrapperUrl = signal<string | null>(null);
  
  // Canvas apps (gallery mode)
  protected selectedAppIndex = signal(0);
  protected apps = CANVAS_APPS;
  
  // Check if current app has custom/uploaded data
  protected hasCustomData = computed(() => {
    return this.objects().some(obj => 
      obj.type === 'image' && obj.sourceRef?.startsWith('data:')
    );
  });
  
  // Shuffle state
  protected isShuffling = signal(false);
  
  // Iframe interaction state
  protected hoveredIframeId = signal<string | null>(null);
  protected interactiveIframeId = signal<string | null>(null);
  private hoverTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private iframeScrollUpdateMap = new WeakMap<HTMLIFrameElement, () => void>();
  
  // Grid constants
  private readonly baseGridSize = 20; // Base grid size at 100% zoom
  private readonly gridScaleLevels = [0.25, 0.5, 1, 2, 4, 8, 16]; // Available grid scales
  private readonly minVisibleGridSize = 8; // Min px before fading out
  private readonly maxVisibleGridSize = 50; // Max px before fading out
  
  // Grid state
  protected gridScale = signal(1); // Current grid scale multiplier
  
  // Computed properties for grid and zoom display
  protected gridSize = computed(() => this.baseGridSize * this.gridScale());
  protected apparentGridSize = computed(() => this.gridSize() * this.zoom());
  protected gridOpacity = computed(() => {
    const apparent = this.apparentGridSize();
    if (apparent < this.minVisibleGridSize) {
      return Math.max(0, apparent / this.minVisibleGridSize);
    } else if (apparent > this.maxVisibleGridSize) {
      return Math.max(0, 1 - (apparent - this.maxVisibleGridSize) / (this.maxVisibleGridSize * 0.5));
    }
    return 1;
  });
  protected zoomPercentage = computed(() => Math.round(this.zoom() * 100));
  
  private isDragging = false;
  private isTransforming = false;
  private isPanningCanvas = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private transformStartX = 0;
  private transformStartY = 0;
  private transformHandle: string | null = null;
  private originalObject: CanvasObject | null = null;
  private panStartViewportX = 0;
  private panStartViewportY = 0;
  private rotateStartAngle = 0;
  private rotateStartRotation = 0;
  private viewAnimationFrame: number | null = null;
  private pendingInitialFitTimeout: number | null = null;
  private pendingFitAfterImageLoad = false;
  // UI chrome safe areas (px) to improve visual centering
  private readonly safeInsetTop = 20;
  private readonly safeInsetBottom = 100;
  private readonly safeInsetLeft = 20;
  private readonly safeInsetRight = 20;

  private getVisibleViewportMetrics() {
    const width = Math.max(0, window.innerWidth - this.safeInsetLeft - this.safeInsetRight);
    const height = Math.max(0, window.innerHeight - this.safeInsetTop - this.safeInsetBottom);
    const centerX = this.safeInsetLeft + width / 2;
    const centerY = this.safeInsetTop + height / 2;
    return { width, height, centerX, centerY };
  }
  
  protected readonly transformHandles: TransformHandle[] = [
    { type: 'scale-nw', cursor: 'nw-resize' },
    { type: 'scale-ne', cursor: 'ne-resize' },
    { type: 'scale-sw', cursor: 'sw-resize' },
    { type: 'scale-se', cursor: 'se-resize' },
    { type: 'scale-w', cursor: 'w-resize' },
    { type: 'scale-e', cursor: 'e-resize' },
    { type: 'scale-n', cursor: 'n-resize' },
    { type: 'scale-s', cursor: 's-resize' },
    { type: 'rotate', cursor: 'grab' },
  ];

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.setupEventListeners();
      
      window.addEventListener('hashchange', this.onHashChange);
      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      
      // Detect mobile device after render
      afterNextRender(() => {
        this.isMobile.set(this.detectMobile());
      });
      
      // Set up effects first, before restoring state
      effect(() => {
        // Track canvas view and objects; schedule hash sync when they change.
        this.viewportX();
        this.viewportY();
        this.zoom();
        this.objects();
        if (this.readyForHashWrites) {
          this.scheduleHashUpdate();
        } else {
          this.hashDirty = true; // mark that a write is pending once ready
        }
      });
      effect(() => {
        // Update grid scale when zoom changes
        const currentZoom = this.zoom();
        this.updateGridScale(currentZoom);
      });
      
      // Always start fresh - do not restore from sessionStorage
      // But DO restore from the URL hash if present
      let hashToRestore = '';
      
      try {
        // Clear stored state to prevent persistence between refreshes
        sessionStorage.removeItem('canvasLastHash');
        
        // Check if there's a hash in the URL to restore
        if (window.location.hash) {
          hashToRestore = window.location.hash;
        }
      } catch (e) {
        // Silently handle errors
      }
      
      // Suppress hash writes during initial state restoration
      this.restoredFromHash = !!hashToRestore;
      this.suppressHash = true;
      if (hashToRestore) {
        this.applyHashState(hashToRestore);
      }
      this.suppressHash = false;

      // Enable hash writes after initial restore and flush any pending change
      this.readyForHashWrites = true;
      if (this.hashDirty) {
        this.scheduleHashUpdate();
      }
      
      // Clean up orphaned localStorage entries after initial load
      afterNextRender(() => {
        this.cleanupOrphanedStorage();
        
        // Check for shareUrl query parameter (from URL wrapper)
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const shareUrl = urlParams.get('shareUrl');
          if (shareUrl) {
            // Mark that we came from URL wrapper
            this.cameFromUrlWrapper.set(true);
            this.urlWrapperUrl.set(shareUrl);
            
            // Store in localStorage for return navigation
            try {
              localStorage.setItem('wall-url', shareUrl);
            } catch (e) {
              console.warn('[Canvas] Could not store wall-url', e);
            }
            
            // Add the URL as an object on the canvas unless already present via hash
            const alreadyExists = this.objects().some(o => o.sourceRef === shareUrl);
            if (!alreadyExists) {
              this.addUrlObject(shareUrl);
            }
            // Defer fitting until og:image is ready; fallback if it never arrives
            if (this.pendingInitialFitTimeout !== null) {
              window.clearTimeout(this.pendingInitialFitTimeout);
            }
            this.pendingInitialFitTimeout = window.setTimeout(() => {
              // Fallback fit if og:image wasn't fetched
              if (this.pendingInitialFitTimeout !== null) {
                this.animateFitToContent();
                this.pendingInitialFitTimeout = null;
              }
            }, 1500);
            // Clean up the query parameter from the URL
            urlParams.delete('shareUrl');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
            window.history.replaceState(null, '', newUrl);
          }
        } catch (e) {
          // Silently handle errors in URL loading
        }
      });
    }
  }

  protected onAppChange(appIndex: number): void {
    this.selectedAppIndex.set(appIndex);
    const app = this.apps[appIndex];
    if (!app) return;

    // If leaving app 2, remove any temporary empty frames
    if (app.id !== 'frame') {
      this.objects.update(objs => objs.filter(o => !o.isFrameObject));
    }

    // Handle different app behaviors
    switch (app.id) {
      case 'centered': {
        // App 1: Center the loaded image
        this.animateFitToContent(true);
        break;
      }
      case 'frame': {
        // App 2: Place an empty frame next to the image
        const objects = this.objects();
        // Create a single empty frame when entering the app if none exists yet
        // and there is at least one loaded object to pair with.
        if (objects.length > 0 && !objects.some(o => o.isEmptyFrame)) {
          this.createEmptyFrame();
        }
        // Fit all content after frame is set, with animation
        // Use runInInjectionContext to call afterNextRender outside constructor
        runInInjectionContext(this.injector, () => {
          afterNextRender(() => this.animateFitToContent(true));
        });
        break;
      }
      // Additional apps can be added here
    }
  }

  private createEmptyFrame(): void {
    // Create a new empty frame object next to existing objects
    const base = this.objects().find(o => !o.isFrameObject);
    if (!base) return;

    // Match base object's size (similar space and proportions)
    const frameWidth = base.width;
    const frameHeight = base.height;

    // Allow overlap but not more than ~30% in each axis
    const offsetX = Math.round(frameWidth * 0.7);
    const offsetY = Math.round(frameHeight * 0.3);
    const newX = base.x + offsetX;
    const newY = base.y + offsetY;

    const newFrame: CanvasObject = {
      id: this.generateId(),
      type: 'image', // Use 'image' type instead of 'iframe' for custom rendering
      x: newX,
      y: newY,
      width: frameWidth,
      height: frameHeight,
      rotation: 0,
      content: 'frame-placeholder', // Placeholder marker
      sourceRef: 'frame-empty',
      originalAspectRatio: frameHeight / frameWidth,
      displayMode: 'image',
      isEmptyFrame: true, // Mark as empty polaroid frame
      isFrameObject: true, // App-2-only object
    };

    this.addObject(newFrame);
    this.selectedObjectId.set(newFrame.id);
  }

  private addUrlObject(url: string): void {
    // Add URL as an iframe object centered on the canvas
    const centerX = this.defaultViewportWidth / 2 - this.defaultIframeWidth / 2;
    const centerY = this.defaultViewportHeight / 2 - this.defaultIframeHeight / 2;
    // Guard against division by zero
    const aspectRatio = this.defaultIframeWidth > 0
      ? this.defaultIframeHeight / this.defaultIframeWidth
      : 1;

    // Use current zoom or default to 1 if invalid
    const currentZoom = this.zoom() || 1;

    const newObject: CanvasObject = {
      id: this.generateId(),
      type: 'iframe',
      x: centerX / currentZoom,
      y: centerY / currentZoom,
      width: this.defaultIframeWidth,
      height: this.defaultIframeHeight,
      rotation: 0,
      content: url,
      sourceRef: url,
      originalAspectRatio: aspectRatio,
      safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
      displayMode: 'image', // Default to image view (og:image preview)
    };

    this.addObject(newObject);

    // Mark that we should fit once the og:image loads (consistent with refresh behavior)
    // This avoids a race where fitOnceAfterLoad() fires before DOM is ready
    this.pendingFitAfterImageLoad = true;

    // Fetch og:image metadata in the background
    this.fetchOgImage(url, newObject.id);
  }

  protected onEmptyFrameUpload(event: Event, objectId: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        // Determine uploaded image proportions, size to equivalent area of first layer
        const img = new Image();
        img.onload = () => {
          const naturalW = img.naturalWidth || img.width;
          const naturalH = img.naturalHeight || img.height;
          const ratio = naturalH > 0 && naturalW > 0 ? naturalH / naturalW : 1;
          const base = this.objects().find(o => !o.isFrameObject);
          const area = base ? base.width * base.height : this.defaultIframeWidth * this.defaultIframeHeight;
          const newW = Math.round(Math.sqrt(area / (ratio || 1)));
          const newH = Math.round(Math.sqrt(area * (ratio || 1)));

          this.objects.update(objects =>
            objects.map(obj =>
              obj.id === objectId
                ? {
                    ...obj,
                    content: dataUrl,
                    sourceRef: file.name,
                    displayMode: 'image' as const,
                    isEmptyFrame: false,
                    isFrameObject: true,
                    width: newW,
                    height: newH,
                    originalAspectRatio: ratio || 1,
                    safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl),
                  }
                : obj
            )
          );

          // After sizing, animate a simple fit (no appear animation)
          runInInjectionContext(this.injector, () => {
            afterNextRender(() => this.animateFitToContent(true));
          });
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  }

  private fitOnceAfterLoad(): void {
    if (this.initialFitDone) return;
    this.initialFitDone = true;
    afterNextRender(() => this.animateFitToContent());
  }

  private animateFitToContent(skipAppear = false): void {
    const targets = this.computeFitToViewTargets();
    
    if (!skipAppear) {
      // One-time appear animation: pre-position off-screen-left
      const bounds = this.calculateCompositionBounds();
      if (bounds) {
        const { centerY: vcy } = this.getVisibleViewportMetrics();
        const contentCenterY = bounds.y + bounds.height / 2;
        this.zoom.set(targets.zoom * 0.5);
        this.viewportX.set(-bounds.width * targets.zoom);
        this.viewportY.set(vcy - contentCenterY * targets.zoom * 0.5);
      }
    }
    
    this.animateToView(targets.zoom, targets.viewportX, targets.viewportY, 450);
  }

  private animateToView(targetZoom: number, targetViewportX: number, targetViewportY: number, durationMs = 450): void {
    const startZoom = this.zoom();
    const startX = this.viewportX();
    const startY = this.viewportY();
    const startTime = performance.now();

    if (this.viewAnimationFrame !== null) {
      cancelAnimationFrame(this.viewAnimationFrame);
      this.viewAnimationFrame = null;
    }

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);

      this.zoom.set(startZoom + (targetZoom - startZoom) * eased);
      this.viewportX.set(startX + (targetViewportX - startX) * eased);
      this.viewportY.set(startY + (targetViewportY - startY) * eased);

      if (progress < 1) {
        this.viewAnimationFrame = requestAnimationFrame(step);
      } else {
        this.viewAnimationFrame = null;
      }
    };

    this.viewAnimationFrame = requestAnimationFrame(step);
  }

  protected returnToUrlWrapper(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const wallUrl = this.urlWrapperUrl() || localStorage.getItem('wall-url');
    const basePath = this.computeBasePath();

    if (wallUrl) {
      window.location.href = `${basePath}?wallUrl=${encodeURIComponent(wallUrl)}`;
    } else {
      window.location.href = basePath;
    }
  }

  protected shareVia(method: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const currentUrl = window.location.href;
    const hasCustom = this.hasCustomData();

    switch (method) {
      case 'copy':
        if (!hasCustom) {
          this.copyToClipboard(currentUrl);
        }
        break;
      case 'whatsapp':
        if (hasCustom) {
          this.shareImage();
        } else {
          this.shareToWhatsApp(currentUrl);
        }
        break;
      case 'instagram':
        if (hasCustom) {
          this.shareImage();
        } else {
          this.shareToInstagram(currentUrl);
        }
        break;
      case 'upload':
        this.shareImage();
        break;
      case 'download':
        this.downloadImage();
        break;
    }
  }

  private copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('Link copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textarea);
    });
  }

  private shareToWhatsApp(url: string): void {
    const text = encodeURIComponent('Check out this composition: ' + url);
    const whatsappUrl = `https://wa.me/?text=${text}`;
    window.open(whatsappUrl, '_blank');
  }

  private shareToInstagram(url: string): void {
    // Instagram doesn't have a direct URL share (for security), so we copy link
    this.copyToClipboard(url);
    // Open Instagram in new tab
    window.open('https://instagram.com', '_blank');
  }

  private shareToWeb(url: string): void {
    // Use native Web Share API if available
    if (navigator.share) {
      navigator.share({
        title: 'Canvas Composition',
        text: 'Check out this composition',
        url: url,
      }).catch(err => console.error('Share failed:', err));
    } else {
      // Fallback: copy to clipboard
      this.copyToClipboard(url);
    }
  }

  private shareViaDownload(): void {
    // Call the existing downloadImage method
    this.downloadImage();
  }

  protected async shuffleImage(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.isShuffling()) return;

    this.isShuffling.set(true);
    try {
      // Remove all existing iframe (URL) objects from canvas
      const objectsToRemove = this.objects().filter(obj => obj.type === 'iframe');
      objectsToRemove.forEach(obj => {
        this.cleanupObjectStorage(obj);
      });
      
      // Update objects to remove all iframes
      this.objects.update(objects => objects.filter(obj => obj.type !== 'iframe'));
      this.selectedObjectId.set(null);

      // Fetch and add new random URL
      const randomUrl = await this.fetchRandomGradimUrl();
      if (randomUrl) {
        this.addUrlObject(randomUrl);
        this.urlWrapperUrl.set(randomUrl);
        try {
          localStorage.setItem('wall-url', randomUrl);
        } catch (e) {
          console.warn('[Canvas] Could not store wall-url', e);
        }
      }
    } catch (error) {
      console.error('[Canvas] Error shuffling image:', error);
    } finally {
      this.isShuffling.set(false);
    }
  }

  private async fetchRandomGradimUrl(): Promise<string | null> {
    const WALL_BASE_URL = 'https://gradim-wall.netlify.app';
    const RANDOM_API_LEAN_URL = 'https://gradim.fh-potsdam.de/omeka-s/api/items?per_page=1&sort_by=random&fields[]=dcterms:identifier';
    const RANDOM_API_URL = 'https://gradim.fh-potsdam.de/omeka-s/api/items?per_page=1&sort_by=random';

    try {
      const identifier = await this.fetchIdentifierFromUrl(RANDOM_API_LEAN_URL) ?? 
                        await this.fetchIdentifierFromUrl(RANDOM_API_URL);
      if (!identifier) return null;
      return `${WALL_BASE_URL}/${identifier}`;
    } catch {
      return null;
    }
  }

  private async fetchIdentifierFromUrl(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;

      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length === 0) return null;

      const identifier = payload[0]?.['dcterms:identifier']?.[0]?.['@value'];
      return typeof identifier === 'string' ? identifier : null;
    } catch {
      return null;
    }
  }

  private computeBasePath(): string {
    const path = window.location.pathname;
    const idx = path.indexOf('/sample-reflect');
    if (idx >= 0) {
      return path.substring(0, idx + 1);
    }
    return '/';
  }

  private onHashChange = (): void => {
    if (!isPlatformBrowser(this.platformId)) return;
    const currentHash = window.location.hash || '';

    // If the user manually cleared the hash, clear state and skip the next write
    if (!currentHash || currentHash === '#') {
      try {
        sessionStorage.removeItem('canvasLastHash');
      } catch {}
      this.lastSerializedHash = '';
      this.suppressHash = true;
      this.objects.set([]);
      this.selectedObjectId.set(null);
      this.viewportX.set(0);
      this.viewportY.set(0);
      this.zoom.set(1);
      this.suppressHash = false;
      this.hashDirty = false;
      this.skipNextHashWrite = true;
      return;
    }

    // CRITICAL: Only apply external hash changes, not our own writes
    // Check both lastSerializedHash (what we scheduled to write) and actual current signals
    const currentSerialized = this.serializeStateToHash();
    const currentPrefixed = currentSerialized ? `#${currentSerialized}` : '';
    
    // If current hash matches what we just serialized, this is our own write - ignore it
    if (currentHash === currentPrefixed || currentHash === this.lastSerializedHash) {
      return;
    }
    
    // SAFETY: Never apply a shorter hash if we have a longer one and current state has objects
    // This prevents data loss during rapid zoom when hash writes race
    if (this.objects().length > 0 && currentHash.length < this.lastSerializedHash.length) {
      // Keep our current state and update lastSerializedHash to prevent repeated attempts
      this.lastSerializedHash = currentPrefixed;
      return;
    }
    
    this.applyHashState(currentHash);
    this.lastSerializedHash = currentHash;
  };

  private setupEventListeners(): void {
    // Paste event for URLs
    window.addEventListener('paste', (e) => this.onPaste(e));
    
    // Prevent default drag behavior
    window.addEventListener('dragover', (e) => e.preventDefault());
    
    // Wheel event for zooming
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    
    // Touch events for mobile
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    
    // Update mobile detection on resize
    window.addEventListener('resize', () => {
      this.isMobile.set(this.detectMobile());
    });
  }
  
  private detectMobile(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    
    // Primary check: screen width (most reliable for responsive design)
    const isSmallScreen = window.innerWidth <= 768;
    
    // Check for touch support
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check user agent for mobile devices
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    // Consider it mobile if screen is small (primary condition for responsive design)
    // OR if it's a mobile device with touch support
    return isSmallScreen || (hasTouchScreen && isMobileUA);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const target = event.currentTarget as HTMLElement;
          const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0 };
          const x = event.clientX - rect.left - this.viewportX();
          const y = event.clientY - rect.top - this.viewportY();
          const content = reader.result as string;
          const sourceRef = this.deriveSourceRef(content, file.name);
          
          // Create a temporary image to get aspect ratio
          const img = new Image();
          img.onload = () => {
            const aspectRatio = img.naturalHeight / img.naturalWidth || 1;
            this.addObject({
              id: this.generateId(),
              type: 'image',
              x: x / this.zoom(),
              y: y / this.zoom(),
              width: this.baseSize,
              height: this.baseSize * aspectRatio,
              rotation: 0,
              content,
              sourceRef,
              originalAspectRatio: aspectRatio,
            });
          };
          img.onerror = () => {
            // Fallback to square if image fails to load
            this.addObject({
              id: this.generateId(),
              type: 'image',
              x: x / this.zoom(),
              y: y / this.zoom(),
              width: this.baseSize,
              height: this.baseSize,
              rotation: 0,
              content,
              sourceRef,
              originalAspectRatio: 1,
            });
          };
          img.src = content;
        };
        reader.readAsDataURL(file);
      }
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private onPaste(event: ClipboardEvent): void {
    const target = event.target as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    const isFormField = (el: HTMLElement | null) => !!el && (
      el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('.url-input') !== null
    );

    // If focus is on an input/textarea/contentEditable (e.g., URL modal), do not intercept paste
    if (isFormField(target) || isFormField(active)) {
      return;
    }

    const text = event.clipboardData?.getData('text');
    if (text && this.isValidUrl(text)) {
      // Add iframe at center of viewport
      const sourceRef = this.deriveSourceRef(text);
      const newObject: CanvasObject = {
        id: this.generateId(),
        type: 'iframe',
        x: (window.innerWidth / 2 - this.viewportX()) / this.zoom(),
        y: (window.innerHeight / 2 - this.viewportY()) / this.zoom(),
        width: 600,
        height: 400,
        rotation: 0,
        content: text,
        sourceRef,
        originalAspectRatio: 400 / 600,
        safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(text),
        displayMode: 'image', // Default to image view (og:image preview)
      };
      
      this.addObject(newObject);
      
      // Fetch og:image metadata in the background
      this.fetchOgImage(text, newObject.id);
      
      event.preventDefault();
    }
  }

  // File picker (mobile upload)
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file || !file.type.startsWith('image/')) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const sourceRef = this.deriveSourceRef(content, file.name);

      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.naturalHeight / img.naturalWidth || 1;
        // place at current viewport center
        const centerX = (window.innerWidth / 2 - this.viewportX()) / this.zoom();
        const centerY = (window.innerHeight / 2 - this.viewportY()) / this.zoom();
        this.addObject({
          id: this.generateId(),
          type: 'image',
          x: centerX - this.baseSize / 2,
          y: centerY - (this.baseSize * aspectRatio) / 2,
          width: this.baseSize,
          height: this.baseSize * aspectRatio,
          rotation: 0,
          content,
          sourceRef,
          originalAspectRatio: aspectRatio,
        });
      };
      img.onerror = () => {
        const centerX = (window.innerWidth / 2 - this.viewportX()) / this.zoom();
        const centerY = (window.innerHeight / 2 - this.viewportY()) / this.zoom();
        this.addObject({
          id: this.generateId(),
          type: 'image',
          x: centerX - this.baseSize / 2,
          y: centerY - this.baseSize / 2,
          width: this.baseSize,
          height: this.baseSize,
          rotation: 0,
          content,
          sourceRef,
          originalAspectRatio: 1,
        });
      };
      img.src = content;
    };
    reader.readAsDataURL(file);
    // reset input value so same file can be picked again if desired
    input.value = '';
  }

  private isValidUrl(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  private async fetchOgImage(url: string, objectId: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const host = window.location.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

    // Gradim Wall: derive og:image directly, skip API entirely
    const gradimOg = this.getGradimWallOgImage(url);
    if (gradimOg) {
      this.updateObjectOgImage(objectId, gradimOg);
      return;
    }

    if (!isLocalHost) {
      this.trySetDevelopmentOgImage(url, objectId);
      return;
    }
    
    let ogImageFetched = false;
    
    // Only try server-side endpoint - client-side CORS fetch fails for most sites
    // and generates noisy console errors that confuse users
    try {
      const apiUrl = `/api/url-metadata?url=${encodeURIComponent(url)}`;
      const response = await fetch(apiUrl);
      
      // Check if we got a valid JSON response (not HTML 404)
      const contentType = response.headers.get('content-type');
      
      if (response.ok && contentType?.includes('application/json')) {
        const data = await response.json();
        if (data.ogImage) {
          this.updateObjectOgImage(objectId, data.ogImage);
          ogImageFetched = true;
        }
      }
    } catch (error) {
      // API endpoint not available (dev mode) or failed
    }
    
    // If og:image wasn't fetched from API, try development fallback
    if (!ogImageFetched) {
      this.trySetDevelopmentOgImage(url, objectId);
    }
  }

  private trySetDevelopmentOgImage(url: string, objectId: string): void {
    // In development mode, set known og:images for common domains to enable testing
    // NOTE: This is only a fallback when the API endpoint (/api/url-metadata) is not available.
    // To fetch og:image for arbitrary URLs, run: npm run dev:sample
    // (This starts both the SSR server on port 4000 and the dev server on port 4201)
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Map of common domains to their og:image URLs (for development testing only)
      const devOgImages: Record<string, string> = {
        'github.com': 'https://github.githubassets.com/images/modules/site/social-cards/github-social.png',
        'www.github.com': 'https://github.githubassets.com/images/modules/site/social-cards/github-social.png',
        'youtube.com': 'https://www.youtube.com/img/desktop/yt_1200.png',
        'www.youtube.com': 'https://www.youtube.com/img/desktop/yt_1200.png',
      };

      let ogImage: string | undefined = devOgImages[hostname];

      // Gradim Wall heuristic (mirrors server-side extraction)
      if (!ogImage && hostname === 'gradim-wall.netlify.app') {
        ogImage = this.getGradimWallOgImage(urlObj.toString()) || undefined;
      }

      if (ogImage) {
        // Set after a short delay to simulate API fetch
        setTimeout(() => {
          this.updateObjectOgImage(objectId, ogImage as string);
        }, 500);
      }
    } catch (error) {
      // Invalid URL or other error - silently ignore
    }
  }

  private getGradimWallOgImage(url: string): string | null {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.toLowerCase() !== 'gradim-wall.netlify.app') return null;
      const segments = urlObj.pathname.split('/').filter(Boolean);
      const id = decodeURIComponent(segments[segments.length - 1] || '');
      if (id && /^[A-Za-z0-9_\-]+$/.test(id)) {
        return `https://gradim.fh-potsdam.de/omeka-s/files/large/${id}.jpg`;
      }
    } catch {}
    return null;
  }

  private extractOgImage(html: string): string | null {
    // Extract og:image using regex
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                         html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*>/i);
    
    return ogImageMatch ? ogImageMatch[1] : null;
  }

  private updateObjectOgImage(objectId: string, ogImage: string): void {
    // Load the image to get its dimensions
    const img = new Image();
    img.onload = () => {
      const aspectRatio = img.naturalHeight / img.naturalWidth || 1;
      const newWidth = 600; // Keep a reasonable default width
      const newHeight = newWidth * aspectRatio;
      
      this.objects.update(objects =>
        objects.map(obj =>
          obj.id === objectId
            ? { 
                ...obj, 
                ogImage,
                width: newWidth,
                height: newHeight,
                originalAspectRatio: aspectRatio,
                // Ensure the preview mode is image before centering
                displayMode: 'image'
              }
            : obj
        )
      );
      this.scheduleHashUpdate();
      // After image dimensions are known, cancel any pending fallback to avoid double-fitting
      if (this.pendingInitialFitTimeout !== null) {
        window.clearTimeout(this.pendingInitialFitTimeout);
        this.pendingInitialFitTimeout = null;
      }
      // Trigger fit now that dimensions are known (works reliably across all browsers)
      if (this.pendingFitAfterImageLoad) {
        this.pendingFitAfterImageLoad = false;
        this.animateFitToContent();
      }
    };
    img.onerror = () => {
      // If image fails to load, just set the og:image without resizing
      this.objects.update(objects =>
        objects.map(obj =>
          obj.id === objectId
            ? { ...obj, ogImage }
            : obj
        )
      );
    };
    img.src = ogImage;
  }

  protected toggleDisplayMode(objectId: string): void {
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj || obj.type !== 'iframe' || !obj.ogImage) return;
    
    const newMode = obj.displayMode === 'iframe' ? 'image' : 'iframe';
    
    this.objects.update(objects =>
      objects.map(o =>
        o.id === objectId
          ? { ...o, displayMode: newMode }
          : o
      )
    );
    this.scheduleHashUpdate();
  }

  // Development helper: manually set og:image for testing (only available in dev builds)
  // Usage: Enable Angular DevTools, then in console: ng.getComponent($0).setOgImageForTesting('url')
  // Or inject via Angular debug: const comp = document.querySelector('app-canvas'); ng.getComponent(comp).setOgImageForTesting('url')
  public setOgImageForTesting(ogImageUrl: string): void {
    // Validate URL format
    if (!this.isValidUrl(ogImageUrl)) {
      console.error('Invalid URL format:', ogImageUrl);
      return;
    }
    
    const selectedId = this.selectedObjectId();
    if (!selectedId) {
      console.warn('No object selected. Please select an iframe object first.');
      return;
    }
    
    const obj = this.objects().find(o => o.id === selectedId);
    if (!obj || obj.type !== 'iframe') {
      console.warn('Selected object is not an iframe.');
      return;
    }
    
    this.updateObjectOgImage(selectedId, ogImageUrl);
    console.log('og:image set to:', ogImageUrl, '- toggle buttons should now be visible');
  }

  private addObject(obj: CanvasObject): void {
    this.objects.update(objects => [...objects, obj]);
    this.selectedObjectId.set(obj.id);
    this.scheduleHashUpdate();
  }
 
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Backspace') return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    const selectedId = this.selectedObjectId();
    if (!selectedId) return;
    event.preventDefault();
    
    // Find and clean up the object from localStorage before deleting
    const objectToDelete = this.objects().find(o => o.id === selectedId);
    if (objectToDelete) {
      this.cleanupObjectStorage(objectToDelete);
    }
    
    // Update objects signal - this will trigger effect and scheduleHashUpdate
    this.objects.update(objects => objects.filter(o => o.id !== selectedId));
    this.selectedObjectId.set(null);
  }

  protected onObjectClick(event: MouseEvent, objectId: string): void {
    event.stopPropagation();
    this.selectedObjectId.set(objectId);
    
    // Reset interactive iframe when clicking on a different object
    const clickedObj = this.objects().find(o => o.id === objectId);
    if (clickedObj?.type !== 'iframe' || this.interactiveIframeId() !== objectId) {
      this.interactiveIframeId.set(null);
      
      // Update iframe scroll state for same-origin iframes
      this.updateAllIframeScrollStates();
    }
  }
          // this.scheduleHashUpdate(); // Removed scheduleHashUpdate in mousemove
  protected onCanvasClick(event: MouseEvent): void {
    // Deselect if clicking on canvas background (not on objects)
    const target = event.target as HTMLElement;
    const isBackgroundClick = target === event.currentTarget || 
                             target.classList.contains('dot-grid') || 
                             target.classList.contains('canvas-objects');
        if (this.hashDirty) {
          this.scheduleHashUpdate(); // Schedule hash update if dirty
        }
    
    if (isBackgroundClick) {
      this.selectedObjectId.set(null);
      // Reset interactive iframe when clicking outside
      this.interactiveIframeId.set(null);
      
      // Update iframe scroll state for same-origin iframes
      this.updateAllIframeScrollStates();
    }
  }

  protected onCanvasMouseDown(event: MouseEvent): void {
    // Only pan if clicking on canvas background (not on objects)
    if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains('dot-grid')) {
      this.suppressHash = true;
      this.selectedObjectId.set(null);
      this.isPanningCanvas = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.panStartViewportX = this.viewportX();
      this.panStartViewportY = this.viewportY();

      const onMouseMove = (e: MouseEvent) => {
        if (!this.isPanningCanvas) return;
        
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        
        this.viewportX.set(this.panStartViewportX + dx);
        this.viewportY.set(this.panStartViewportY + dy);
      };

      const onMouseUp = () => {
        this.isPanningCanvas = false;
        this.suppressHash = false;
        if (this.hashDirty) {
          this.scheduleHashUpdate();
        }
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  }
  
  protected onCanvasTouchStart(event: TouchEvent): void {
    // Only handle two-finger pan on canvas background
    if (event.touches.length === 2) {
      const target = event.target as HTMLElement;
      const isBackgroundTouch = target === event.currentTarget || 
                                 (target?.classList && (target.classList.contains('dot-grid') ||
                                  target.classList.contains('canvas-objects')));
      
      if (isBackgroundTouch) {
        event.preventDefault();
        this.suppressHash = true;
        this.selectedObjectId.set(null);
        this.isPanningCanvas = true;
        
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const midX = (touch1.clientX + touch2.clientX) / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2;
        
        this.dragStartX = midX;
        this.dragStartY = midY;
        this.panStartViewportX = this.viewportX();
        this.panStartViewportY = this.viewportY();

        const onTouchMove = (e: TouchEvent) => {
          if (!this.isPanningCanvas || e.touches.length !== 2) return;
          
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const currentMidX = (t1.clientX + t2.clientX) / 2;
          const currentMidY = (t1.clientY + t2.clientY) / 2;
          
          const dx = currentMidX - this.dragStartX;
          const dy = currentMidY - this.dragStartY;
          
          this.viewportX.set(this.panStartViewportX + dx);
          this.viewportY.set(this.panStartViewportY + dy);
        };

        const onTouchEnd = () => {
          this.isPanningCanvas = false;
          this.suppressHash = false;
          if (this.hashDirty) {
            this.scheduleHashUpdate();
          }
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };

        window.addEventListener('touchmove', onTouchMove);
        window.addEventListener('touchend', onTouchEnd);
      }
    }
  }

  protected onObjectMouseMove(event: MouseEvent, objectId: string): void {
    // Cursor affordances are handled by CSS, no need for JavaScript
  }

  protected onObjectMouseLeave(event: MouseEvent): void {
    // Cursor affordances are handled by CSS, no need for JavaScript
  }

  private updateAllIframeScrollStates(): void {
    // Update scroll state for all iframes based on their interactive state
    setTimeout(() => {
      const iframeElements = document.querySelectorAll('iframe.object-content');
      iframeElements.forEach((iframe: Element) => {
        const iframeEl = iframe as HTMLIFrameElement;
        const updateFn = this.iframeScrollUpdateMap.get(iframeEl);
        if (updateFn) {
          updateFn();
        }
      });
    }, 0);
  }

  private clearHoverTimeout(): void {
    if (this.hoverTimeoutHandle) {
      clearTimeout(this.hoverTimeoutHandle);
      this.hoverTimeoutHandle = null;
    }
  }

  protected onIframeMouseEnter(objectId: string): void {
    // Clear any existing timeout
    this.clearHoverTimeout();
    
    // Set timeout to dim after 500ms
    this.hoverTimeoutHandle = setTimeout(() => {
      // Only dim if this iframe is not already in interactive mode
      if (this.interactiveIframeId() !== objectId) {
        this.hoveredIframeId.set(objectId);
      }
    }, 500);
  }

  protected onIframeMouseLeave(objectId: string): void {
    // Clear the hover timeout
    this.clearHoverTimeout();
    
    // Clear hover state
    if (this.hoveredIframeId() === objectId) {
      this.hoveredIframeId.set(null);
    }
  }

  protected onIframeOverlayClick(event: MouseEvent, objectId: string): void {
    event.stopPropagation();
    
    // Enable interaction for this iframe
    this.interactiveIframeId.set(objectId);
    this.hoveredIframeId.set(null);
    
    // Clear any hover timeout
    this.clearHoverTimeout();
    
    // Update iframe scroll state for same-origin iframes
    this.updateAllIframeScrollStates();
  }

  private updateGridScale(zoom: number): void {
    // Find the best grid scale for current zoom level
    // Goal: keep apparent grid size between minVisibleGridSize and maxVisibleGridSize
    let bestScale = this.gridScaleLevels[0];
    let bestDiff = Infinity;
    
    for (const scale of this.gridScaleLevels) {
      const apparentSize = this.baseGridSize * scale * zoom;
      const targetSize = (this.minVisibleGridSize + this.maxVisibleGridSize) / 2;
      const diff = Math.abs(apparentSize - targetSize);
      
      if (diff < bestDiff) {
        bestDiff = diff;
        bestScale = scale;
      }
    }
    
    this.gridScale.set(bestScale);
  }

  private computeFitToViewTargets(): { zoom: number; viewportX: number; viewportY: number } {
    const objs = this.objects();
    if (objs.length === 0) {
      return { zoom: 1, viewportX: 0, viewportY: 0 };
    }

    const bounds = this.calculateCompositionBounds();
    if (!bounds) {
      return { zoom: 1, viewportX: 0, viewportY: 0 };
    }

    // Use smaller padding on mobile for better space utilization
    const isMobileDevice = this.isMobile();
    const padding = isMobileDevice ? 20 : 40;
    const { width: vw, height: vh, centerX: vcx, centerY: vcy } = this.getVisibleViewportMetrics();
    const availableWidth = Math.max(0, vw - 2 * padding);
    const availableHeight = Math.max(0, vh - 2 * padding);

    const zoomX = availableWidth / bounds.width;
    const zoomY = availableHeight / bounds.height;
    const newZoom = Math.min(zoomX, zoomY, this.maxZoom);

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const viewportCenterX = vcx;
    const viewportCenterY = vcy;

    const viewportX = viewportCenterX - centerX * newZoom;
    const viewportY = viewportCenterY - centerY * newZoom;

    return { zoom: newZoom, viewportX, viewportY };
  }

  protected fitToView(): void {
    const { zoom, viewportX, viewportY } = this.computeFitToViewTargets();
    this.zoom.set(zoom);
    this.viewportX.set(viewportX);
    this.viewportY.set(viewportY);
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    // Suppress hash during rapid wheel zoom; flush after debounce
    this.suppressHash = true;
    
    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom() * zoomFactor));
    
    // Zoom towards mouse position
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
    // Calculate the point in canvas coordinates before zoom
    const canvasX = (mouseX - this.viewportX()) / this.zoom();
    const canvasY = (mouseY - this.viewportY()) / this.zoom();
    
    // Update zoom
    this.zoom.set(newZoom);
    
    // Adjust viewport to keep the point under the mouse
    this.viewportX.set(mouseX - canvasX * newZoom);
    this.viewportY.set(mouseY - canvasY * newZoom);
    // Debounce flush after wheel ends
    if (this.wheelFlushHandle) {
      window.clearTimeout(this.wheelFlushHandle);
    }
    this.wheelFlushHandle = window.setTimeout(() => {
      this.suppressHash = false;
      if (this.hashDirty) {
        this.scheduleHashUpdate();
      }
      this.wheelFlushHandle = null;
    }, 300); // Increased from 150ms for more robust handling
  }

  // Share (mobile)
  protected async onShareClick(): Promise<void> {
    try {
      await this.shareComposition();
    } catch (error) {
      console.error('Failed to share composition:', error);
    }
  }
  
  // Add menu helpers (mobile)
  protected toggleAddMenu(): void {
    this.addMenuOpen.update(v => !v);
    if (this.addMenuOpen()) {
      this.shareMenuOpen.set(false);
    }
  }
  protected onAddImageClick(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fileInput?.click();
    this.addMenuOpen.set(false);
  }
  protected onAddUrlClick(): void {
    this.addMenuOpen.set(false);
    // Show custom modal instead of prompt
    this.urlInputValue.set('');
    this.showUrlModal.set(true);
    // Focus input after a short delay to ensure modal is rendered
    setTimeout(() => {
      const input = document.querySelector('.url-input') as HTMLInputElement;
      input?.focus();
    }, 100);
  }
  
  protected submitUrlModal(): void {
    const url = this.urlInputValue().trim();
    this.showUrlModal.set(false);
    
    if (!url) {
      return;
    }
    this.addIframeFromUrl(url);
  }
  
  protected cancelUrlModal(): void {
    this.showUrlModal.set(false);
    this.urlInputValue.set('');
  }

  private addIframeFromUrl(url: string): void {
    if (!this.isValidUrl(url)) {
      console.warn('Invalid URL:', url);
      return;
    }
    const sourceRef = this.deriveSourceRef(url);
    const gradimOg = this.getGradimWallOgImage(url);
    const newObject: CanvasObject = {
      id: this.generateId(),
      type: 'iframe',
      x: (window.innerWidth / 2 - this.viewportX()) / this.zoom(),
      y: (window.innerHeight / 2 - this.viewportY()) / this.zoom(),
      width: 600,
      height: 400,
      rotation: 0,
      content: url,
      sourceRef,
      originalAspectRatio: 400 / 600,
      safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
      displayMode: gradimOg ? 'image' : 'image',
      ogImage: gradimOg ?? undefined,
    };
    this.addObject(newObject);
    // If Gradim Wall, we already set og; skip API
    if (!gradimOg) {
      this.fetchOgImage(url, newObject.id);
    }
  }
  
  // Touch event handlers
  private onTouchStart(event: TouchEvent): void {
    this.activeTouches = event.touches.length;
    
    if (event.touches.length === 2) {
      // Two-finger pinch to zoom
      event.preventDefault();
      this.isTouchPinching = true;
      this.suppressHash = true;
      
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.touchStartDistance = this.getTouchDistance(touch1, touch2);
      this.touchStartZoom = this.zoom();
    } else if (event.touches.length === 1) {
      // Single touch - could be panning or object interaction
      // Let the individual handlers deal with it
    }
  }
  
  private onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2 && this.isTouchPinching) {
      // Pinch to zoom
      event.preventDefault();
      
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = this.getTouchDistance(touch1, touch2);
      
      if (this.touchStartDistance > 0) {
        const scale = currentDistance / this.touchStartDistance;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.touchStartZoom * scale));
        
        // Zoom towards midpoint between fingers
        const midX = (touch1.clientX + touch2.clientX) / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2;
        
        const canvasX = (midX - this.viewportX()) / this.zoom();
        const canvasY = (midY - this.viewportY()) / this.zoom();
        
        this.zoom.set(newZoom);
        this.viewportX.set(midX - canvasX * newZoom);
        this.viewportY.set(midY - canvasY * newZoom);
      }
    }
  }
  
  private onTouchEnd(event: TouchEvent): void {
    this.activeTouches = event.touches.length;
    
    if (event.touches.length < 2) {
      this.isTouchPinching = false;
      this.touchStartDistance = 0;
      
      if (event.touches.length === 0) {
        // All touches ended
        this.suppressHash = false;
        if (this.hashDirty) {
          this.scheduleHashUpdate();
        }
      }
    }
  }
  
  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  protected onObjectMouseDown(event: MouseEvent, objectId: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj) return;
    
    this.isDragging = true;
    this.suppressHash = true; // Suppress hash writes during drag; flush on mouseup
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.originalObject = { ...obj };
    this.selectedObjectId.set(objectId);

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.originalObject) return;
      
      const dx = (e.clientX - this.dragStartX) / this.zoom();
      const dy = (e.clientY - this.dragStartY) / this.zoom();
      
      this.objects.update(objects =>
        objects.map(o =>
          o.id === objectId
            ? { ...o, x: this.originalObject!.x + dx, y: this.originalObject!.y + dy }
            : o
        )
      );
    };

    const onMouseUp = () => {
      this.isDragging = false;
      this.originalObject = null;
      this.suppressHash = false;
      if (this.hashDirty) {
        this.scheduleHashUpdate(); // Flush once after drag ends
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  protected onHandleMouseDown(event: MouseEvent, objectId: string, handleType: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj) return;
    
    this.isTransforming = true;
    this.suppressHash = true; // Suppress during transform
    this.transformStartX = event.clientX;
    this.transformStartY = event.clientY;
    this.transformHandle = handleType;
    this.originalObject = { ...obj };
    this.rotateStartRotation = obj.rotation;
    this.rotateStartAngle = this.getPointerAngle(obj, event.clientX, event.clientY);

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isTransforming || !this.originalObject) return;
      
      const dx = (e.clientX - this.transformStartX) / this.zoom();
      const dy = (e.clientY - this.transformStartY) / this.zoom();
      
      if (this.transformHandle?.startsWith('rotate-')) {
        this.handleRotate(objectId, e.clientX, e.clientY);
      } else if (this.transformHandle === 'rotate') {
        this.handleRotate(objectId, e.clientX, e.clientY);
      } else if (this.transformHandle?.startsWith('scale-')) {
        this.handleScale(objectId, dx, dy, this.transformHandle);
      }
        // this.scheduleHashUpdate(); // Removed continuous hash updates during transform
    };

    const onMouseUp = () => {
      this.isTransforming = false;
      this.originalObject = null;
      this.transformHandle = null;
      this.suppressHash = false; // Re-enable hash writes
      if (this.hashDirty) {
        this.scheduleHashUpdate(); // Flush once on mouseup
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
  
  // Touch handlers for object dragging
  protected onObjectTouchStart(event: TouchEvent, objectId: string): void {
    if (event.touches.length !== 1) return; // Only handle single touch
    
    event.preventDefault();
    event.stopPropagation();
    
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj) return;
    
    const touch = event.touches[0];
    this.isDragging = true;
    this.suppressHash = true;
    this.dragStartX = touch.clientX;
    this.dragStartY = touch.clientY;
    this.originalObject = { ...obj };
    this.selectedObjectId.set(objectId);

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDragging || !this.originalObject || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const dx = (touch.clientX - this.dragStartX) / this.zoom();
      const dy = (touch.clientY - this.dragStartY) / this.zoom();
      
      this.objects.update(objects =>
        objects.map(o =>
          o.id === objectId
            ? { ...o, x: this.originalObject!.x + dx, y: this.originalObject!.y + dy }
            : o
        )
      );
    };

    const onTouchEnd = () => {
      this.isDragging = false;
      this.originalObject = null;
      this.suppressHash = false;
      if (this.hashDirty) {
        this.scheduleHashUpdate();
      }
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };

    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
  }
  
  // Touch handlers for transform handles
  protected onHandleTouchStart(event: TouchEvent, objectId: string, handleType: string): void {
    if (event.touches.length !== 1) return; // Only handle single touch
    
    event.preventDefault();
    event.stopPropagation();
    
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj) return;
    
    const touch = event.touches[0];
    this.isTransforming = true;
    this.suppressHash = true;
    this.transformStartX = touch.clientX;
    this.transformStartY = touch.clientY;
    this.transformHandle = handleType;
    this.originalObject = { ...obj };
    this.rotateStartRotation = obj.rotation;
    this.rotateStartAngle = this.getPointerAngle(obj, touch.clientX, touch.clientY);

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isTransforming || !this.originalObject || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const dx = (touch.clientX - this.transformStartX) / this.zoom();
      const dy = (touch.clientY - this.transformStartY) / this.zoom();
      
      if (this.transformHandle?.startsWith('rotate-')) {
        this.handleRotate(objectId, touch.clientX, touch.clientY);
      } else if (this.transformHandle === 'rotate') {
        this.handleRotate(objectId, touch.clientX, touch.clientY);
      } else if (this.transformHandle?.startsWith('scale-')) {
        this.handleScale(objectId, dx, dy, this.transformHandle);
      }
    };

    const onTouchEnd = () => {
      this.isTransforming = false;
      this.originalObject = null;
      this.transformHandle = null;
      this.suppressHash = false;
      if (this.hashDirty) {
        this.scheduleHashUpdate();
      }
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };

    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
  }

  private handleScale(objectId: string, dx: number, dy: number, handle: string): void {
    if (!this.originalObject) return;
    
    let newWidth = this.originalObject.width;
    let newHeight = this.originalObject.height;
    let xOffset = 0;
    let yOffset = 0;
    
    // Corner handles - scale proportionally (maintain aspect ratio)
    if (handle === 'scale-nw') {
      const scaleDelta = (-dx - dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = newWidth * this.originalObject.originalAspectRatio;
      xOffset = this.originalObject.width - newWidth;
      yOffset = this.originalObject.height - newHeight;
    } else if (handle === 'scale-ne') {
      const scaleDelta = (dx - dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = newWidth * this.originalObject.originalAspectRatio;
      yOffset = this.originalObject.height - newHeight;
    } else if (handle === 'scale-sw') {
      const scaleDelta = (-dx + dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = newWidth * this.originalObject.originalAspectRatio;
      xOffset = this.originalObject.width - newWidth;
    } else if (handle === 'scale-se') {
      const scaleDelta = (dx + dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = newWidth * this.originalObject.originalAspectRatio;
    }
    // Edge handles - scale only one dimension
    else if (handle === 'scale-w') {
      newWidth = Math.max(50, this.originalObject.width - dx);
      newHeight = this.originalObject.type === 'image'
        ? newWidth * this.originalObject.originalAspectRatio
        : this.originalObject.height;
      xOffset = this.originalObject.width - newWidth;
      if (this.originalObject.type === 'image') {
        yOffset = (this.originalObject.height - newHeight) / 2;
      }
    } else if (handle === 'scale-e') {
      newWidth = Math.max(50, this.originalObject.width + dx);
      newHeight = this.originalObject.type === 'image'
        ? newWidth * this.originalObject.originalAspectRatio
        : this.originalObject.height;
      if (this.originalObject.type === 'image') {
        yOffset = (this.originalObject.height - newHeight) / 2;
      }
    } else if (handle === 'scale-n') {
      newHeight = Math.max(50, this.originalObject.height - dy);
      newWidth = this.originalObject.type === 'image'
        ? newHeight / this.originalObject.originalAspectRatio
        : this.originalObject.width;
      yOffset = this.originalObject.height - newHeight;
      if (this.originalObject.type === 'image') {
        xOffset = (this.originalObject.width - newWidth) / 2;
      }
    } else if (handle === 'scale-s') {
      newHeight = Math.max(50, this.originalObject.height + dy);
      newWidth = this.originalObject.type === 'image'
        ? newHeight / this.originalObject.originalAspectRatio
        : this.originalObject.width;
      if (this.originalObject.type === 'image') {
        xOffset = (this.originalObject.width - newWidth) / 2;
      }
    }

    this.objects.update(objects =>
      objects.map(o =>
        o.id === objectId
          ? {
              ...o,
              width: newWidth,
              height: newHeight,
              x: this.originalObject!.x + xOffset,
              y: this.originalObject!.y + yOffset,
            }
          : o
      )
    );
  }

  private handleRotate(objectId: string, clientX: number, clientY: number): void {
    if (!this.originalObject) return;
    
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj) return;

    const currentAngle = this.getPointerAngle(obj, clientX, clientY);
    const delta = currentAngle - this.rotateStartAngle;
    const degrees = this.rotateStartRotation + delta;
    const snapped = this.snapAngleWithin(degrees, 45, 2);

    this.objects.update(objects =>
      objects.map(o =>
        o.id === objectId ? { ...o, rotation: snapped } : o
      )
    );
  }

  private getPointerAngle(obj: CanvasObject, clientX: number, clientY: number): number {
    const centerX = (obj.x + obj.width / 2) * this.zoom() + this.viewportX();
    const centerY = (obj.y + obj.height / 2) * this.zoom() + this.viewportY();
    return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
  }

  protected getObjectStyle(obj: CanvasObject): { [key: string]: string } {
    return {
      left: `${obj.x}px`,
      top: `${obj.y}px`,
      width: `${obj.width}px`,
      height: `${obj.height}px`,
      transform: `rotate(${obj.rotation}deg)`,
    };
  }

  private snapAngle(angle: number, step: number = 45): number {
    return Math.round(angle / step) * step;
  }

  // Snap only when within a small threshold of the nearest step
  private snapAngleWithin(angle: number, step: number = 45, thresholdDeg: number = 2): number {
    const nearest = Math.round(angle / step) * step;
    return Math.abs(angle - nearest) <= thresholdDeg ? nearest : angle;
  }

  protected getHandlePosition(obj: CanvasObject, handle: TransformHandle): { [key: string]: string } {
    const positions: { [key: string]: { [key: string]: string } } = {
      'scale-nw': { top: '-5px', left: '-5px' },
      'scale-ne': { top: '-5px', right: '-5px' },
      'scale-sw': { bottom: '-5px', left: '-5px' },
      'scale-se': { bottom: '-5px', right: '-5px' },
      'rotate': { top: '-30px', left: '50%', transform: 'translateX(-50%)' },
    };
    
    return positions[handle.type] || {};
  }

  protected getCanvasObjectsStyle(): { [key: string]: string } {
    return {
      transform: `translate(${this.viewportX()}px, ${this.viewportY()}px) scale(${this.zoom()})`,
      'transform-origin': '0 0',
    };
  }

  protected getDotGridStyle(): { [key: string]: string } {
    const size = this.gridSize();
    const scaledSize = size * this.zoom();
    const offsetX = this.viewportX() % scaledSize;
    const offsetY = this.viewportY() % scaledSize;
    return {
      'background-size': `${scaledSize}px ${scaledSize}px`,
      'background-position': `${offsetX}px ${offsetY}px`,
      'opacity': this.gridOpacity().toString(),
    };
  }

  protected getInverseScaleStyle(obj: CanvasObject): { [key: string]: string } {
    const inverseScale = 1 / this.zoom();
    return {
      transform: `scale(${inverseScale})`,
      '--inverse-scale': inverseScale.toString(),
    };
  }

  protected getSelectionBorderStyle(): { [key: string]: string } {
    const inverseScale = 1 / this.zoom();
    return {
      '--inverse-scale': inverseScale.toString(),
    };
  }

  // Attempt to hide scrollbars inside same-origin iframes by injecting CSS
  // When iframe is interactive, scrolling will be enabled
  protected onOgImageLoad(event: Event, objectId: string): void {
    // Called when the og:image in the DOM has fully loaded
    if (this.pendingFitAfterImageLoad) {
      this.pendingFitAfterImageLoad = false;
      // Image is already loaded and rendered, trigger simple fit (no appear)
      this.animateFitToContent(true);
    }
  }

  protected onUserImageLoad(event: Event, objectId: string): void {
    // Called when a user-uploaded image has loaded
    // Animate to fit all layers
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => this.animateFitToContent(true));
    });
  }

  protected onIframeLoad(event: Event, objectId: string): void {
    const iframe = event.target as HTMLIFrameElement | null;
    if (!iframe) return;
    
    // Store reference for potential style updates when interactive state changes
    const updateIframeScroll = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document || null;
        if (!doc) return;
        
        const isInteractive = this.interactiveIframeId() === objectId;
        const overflowValue = isInteractive ? 'auto' : 'hidden';
        
        if (doc.documentElement) {
          (doc.documentElement as HTMLElement).style.overflow = overflowValue;
        }
        if (doc.body) {
          doc.body.style.overflow = overflowValue;
        }
        
        // Remove old style if exists
        const existingStyle = doc.head?.querySelector('style[data-iframe-scroll]');
        if (existingStyle) {
          existingStyle.remove();
        }
        
        // Only hide scrollbars when not interactive
        if (!isInteractive) {
          const style = doc.createElement('style');
          style.setAttribute('data-iframe-scroll', 'true');
          style.textContent = '::-webkit-scrollbar{display:none} html,body{overflow:hidden!important}';
          doc.head?.appendChild(style);
        }
      } catch {
        // Cross-origin: cannot access; rely on outer CSS and scrolling attribute
      }
    };
    
    // Initial update
    updateIframeScroll();
    
    // Store the update function in WeakMap for later use
    this.iframeScrollUpdateMap.set(iframe, updateIframeScroll);
  }

  // ---- Cursor helpers ----

  private normalizeAngle180(deg: number): number {
    let a = deg % 180;
    if (a < 0) a += 180;
    return a;
  }

  protected getCursorForHandle(obj: CanvasObject, handle: string): string {
    const a = this.normalizeAngle180(obj.rotation);
    const isVertical = a >= 45 && a <= 135;
    const isNWSE = a < 45 || a > 135;

    if (handle.startsWith('scale-')) {
      switch (handle) {
        case 'scale-nw':
        case 'scale-se':
          return isNWSE ? 'nwse-resize' : 'nesw-resize';
        case 'scale-ne':
        case 'scale-sw':
          return isNWSE ? 'nesw-resize' : 'nwse-resize';
        case 'scale-w':
        case 'scale-e':
          // Left/right edges: width scaling; cursor flips with rotation
          return isVertical ? 'ns-resize' : 'ew-resize';
        case 'scale-n':
        case 'scale-s':
          // Top/bottom edges: height scaling; complementary to width
          return isVertical ? 'ew-resize' : 'ns-resize';
      }
    }
    return 'move';
  }

  private buildRotateCursorSvg(deg: number): string {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g transform="rotate(${deg} 12 12)">
<g clip-path="url(#clip0_325_17)">
<g filter="url(#filter0_d_325_17)">
<path d="M11 6C11.9193 6 12.8295 6.18106 13.6788 6.53284C14.5281 6.88463 15.2997 7.40024 15.9497 8.05025C16.5998 8.70026 17.1154 9.47194 17.4672 10.3212C17.8189 11.1705 18 12.0807 18 13V16H22L16 22L10 16H14V13C14 12.606 13.9224 12.2159 13.7716 11.8519C13.6209 11.488 13.3999 11.1573 13.1213 10.8787C12.8427 10.6001 12.512 10.3791 12.1481 10.2284C11.7841 10.0776 11.394 10 11 10H8V14L2 8L8 2V6H11Z" fill="white"/>
<path d="M11 9H7V11.5L3.5 8L7 4.5L7 7H11C11.7879 7 12.5682 7.15519 13.2961 7.45672C14.0241 7.75825 14.6855 8.20021 15.2426 8.75736C15.7998 9.31451 16.2418 9.97594 16.5433 10.7039C16.8448 11.4319 17 12.2121 17 13V17L19.5 17L16 20.5L12.5 17H15V13C15 12.4747 14.8965 11.9546 14.6955 11.4693C14.4945 10.984 14.1999 10.543 13.8284 10.1716C13.457 9.80014 13.016 9.5055 12.5307 9.30448C12.0454 9.10346 11.5253 9 11 9Z" fill="black"/>
</g>
</g>
<defs>
<filter id="filter0_d_325_17" x="0.2" y="1.2" width="23.6" height="23.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="1"/>
<feGaussianBlur stdDeviation="0.9"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.65 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_325_17"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_325_17" result="shape"/>
</filter>
<clipPath id="clip0_325_17">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>
</g>
</svg>`;
    const encoded = encodeURIComponent(svg)
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
    // Hotspot at center (12,12)
    return `url("data:image/svg+xml;utf8,${encoded}") 12 12, auto`;
  }

  protected getRotateCursor(obj: CanvasObject, corner: 'ne' | 'nw' | 'sw' | 'se'): string {
    // Corrected corner base angles: NW and SE swapped
    const baseDegMap: Record<'ne' | 'nw' | 'sw' | 'se', number> = {
      ne: 0,
      nw: 270,
      sw: 180,
      se: 90,
    };
    const deg = baseDegMap[corner] + obj.rotation;
    return this.buildRotateCursorSvg(deg);
  }

  // ---- Hash sync (inflect) ----

  private scheduleHashUpdate(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.skipNextHashWrite) {
      this.skipNextHashWrite = false;
      this.hashDirty = false;
      return;
    }
    // If not yet ready (initial restore), just mark dirty and bail
    if (!this.readyForHashWrites) {
      this.hashDirty = true;
      return;
    }
    // If we're suppressing writes (during interaction), mark dirty and skip
    if (this.suppressHash) {
      this.hashDirty = true;
      return;
    }
    if (this.hashUpdateHandle) {
      window.clearTimeout(this.hashUpdateHandle);
    }

    this.hashUpdateHandle = window.setTimeout(() => {
      const hash = this.serializeStateToHash();
      const prefixedHash = hash ? `#${hash}` : '';
      
      // Only write if changed from what we last wrote (not from current URL hash)
      // This prevents echo writes but allows all legitimate state changes
      if (prefixedHash !== this.lastSerializedHash) {
        window.location.hash = prefixedHash;
        this.lastSerializedHash = prefixedHash;
        try {
          sessionStorage.setItem('canvasLastHash', prefixedHash);
        } catch {}
      }
      this.hashDirty = false;
      this.hashUpdateHandle = null;
    }, this.hashThrottleMs);
  }

  private serializeStateToHash(): string {
    const parts: string[] = [];
    parts.push(this.serializeCanvasSegment());
    for (const obj of this.objects()) {
      // Skip frame-app-only objects so app 1/other apps don't restore them
      if (obj.isFrameObject) continue;
      // Skip empty frames - they should not be persisted in the hash
      if (obj.isEmptyFrame) continue;
      parts.push(this.serializeObjectSegment(obj));
    }
    return parts.join('#');
  }

  private serializeCanvasSegment(): string {
    const x = this.roundNumber(this.viewportX());
    const y = this.roundNumber(this.viewportY());
    const zoom = this.roundNumber(this.zoom());
    return `canvas/${x},${y},${zoom}`;
  }

  private serializeObjectSegment(obj: CanvasObject): string {
    const x = this.roundNumber(obj.x);
    const y = this.roundNumber(obj.y);
    const scale = this.roundNumber(obj.width / this.baseSize);
    const rotation = this.roundNumber(obj.rotation);
    const ratio = obj.width === 0 ? 1 : obj.height / obj.width;
    const flags = [`type:${obj.type}`, `ratio:${this.roundNumber(ratio)}`];
    
    // Add displayMode and ogImage to flags if present
    if (obj.displayMode) {
      flags.push(`mode:${obj.displayMode}`);
    }
    if (obj.ogImage) {
      flags.push(`og:${encodeURIComponent(obj.ogImage)}`);
    }
    
    const ref = encodeURIComponent(obj.sourceRef);
    return `${ref}/${x},${y},${scale},${rotation}/${flags.join(',')}`;
  }

  private applyHashState(hash: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!hash || hash.length <= 1) return;

    const segments = hash.substring(1).split('#').filter(Boolean);
    if (segments.length === 0) return;

    const nextObjects: CanvasObject[] = [];
    const seenSegments = new Set<string>();
    let nextViewportX = this.viewportX();
    let nextViewportY = this.viewportY();
    let nextZoom = this.zoom();

    for (const segment of segments) {
      // Find the two delimiter slashes that wrap the numeric transform part.
      // Transform is always four comma-separated numbers, so we search from the end
      // for the last pair of slashes that encloses such a numeric block. This is
      // resilient to extra '/' characters in both the ref (unencoded URLs) and flags
      // (e.g., og:https://.../image.jpg).
      const slashIndexes: number[] = [];
      for (let i = 0; i < segment.length; i++) {
        if (segment[i] === '/') slashIndexes.push(i);
      }
      if (slashIndexes.length < 2) continue;

      let flagsPart = '';
      let transformPart = '';
      let encodedRef = '';

      // Walk from the end to find a transform part that looks like numbers
      for (let i = slashIndexes.length - 2; i >= 0; i--) {
        const firstSlash = slashIndexes[i];
        const secondSlash = slashIndexes[i + 1];
        transformPart = segment.substring(firstSlash + 1, secondSlash);
        const parts = transformPart.split(',');
        if (parts.length === 4 && parts.every(p => !Number.isNaN(parseFloat(p)))) {
          encodedRef = segment.substring(0, firstSlash);
          flagsPart = segment.substring(secondSlash + 1);
          break;
        }
      }

      if (!encodedRef) {
        continue; // Could not find a valid numeric transform block
      }
      if (!encodedRef || !transformPart) continue;

      // Deduplicate identical segment entries in the hash to prevent repeated objects
      const segmentKey = `${encodedRef}|${transformPart}|${flagsPart ?? ''}`;
      if (seenSegments.has(segmentKey)) {
        continue;
      }
      seenSegments.add(segmentKey);

      const ref = decodeURIComponent(encodedRef);
      if (ref === 'canvas') {
        const [vx, vy, vz] = transformPart.split(',').map(parseFloat);
        if (!Number.isNaN(vx)) nextViewportX = vx;
        if (!Number.isNaN(vy)) nextViewportY = vy;
        if (!Number.isNaN(vz)) nextZoom = Math.max(this.minZoom, Math.min(this.maxZoom, vz));
        continue;
      }

      const [tx, ty, ts, tr] = transformPart.split(',').map(parseFloat);
      if ([tx, ty, ts, tr].some(v => Number.isNaN(v))) continue;

      const flagMap = this.parseFlags(flagsPart);
      const ratioValue = flagMap.get('ratio') ?? 1;
      const ratio = typeof ratioValue === 'number' ? ratioValue : parseFloat(String(ratioValue));
      const safeRatio = Number.isNaN(ratio) ? 1 : ratio;
      const type = (flagMap.get('type') as CanvasObject['type'] | undefined) ?? 'image';
      const displayMode = (flagMap.get('mode') as 'iframe' | 'image' | undefined) ?? 'image';
      const ogImage = flagMap.get('og') ? decodeURIComponent(String(flagMap.get('og'))) : undefined;
      const width = this.baseSize * ts;
      const height = width * safeRatio;
      let content = this.resolveContent(ref, type);
      if (!content) {
        // Keep image objects present with a transparent placeholder; skip invalid iframes
        if (type === 'image') {
          content = this.transparentPixel;
        } else {
          continue;
        }
      }

      nextObjects.push({
        id: this.generateId(),
        type,
        x: tx,
        y: ty,
        width,
        height,
        rotation: tr,
        content,
        sourceRef: ref,
        originalAspectRatio: safeRatio,
        safeUrl: type === 'iframe' && this.isValidUrl(content)
          ? this.sanitizer.bypassSecurityTrustResourceUrl(content)
          : undefined,
        ogImage,
        displayMode,
      });
    }

    this.viewportX.set(nextViewportX);
    this.viewportY.set(nextViewportY);
    this.zoom.set(nextZoom);
    this.objects.set(nextObjects);
    this.selectedObjectId.set(null);
    this.lastSerializedHash = hash.startsWith('#') ? hash : `#${hash}`;
    try {
      sessionStorage.setItem('canvasLastHash', this.lastSerializedHash);
    } catch {}
    // Only auto-fit if we didn't restore from hash (hash already provides a viewport)
    if (!this.restoredFromHash && nextObjects.length > 0) {
      this.fitOnceAfterLoad();
    }
    
    // Refetch og:image for iframe objects missing it
    for (const obj of nextObjects) {
      if (obj.type === 'iframe' && !obj.ogImage && this.isValidUrl(obj.content)) {
        this.fetchOgImage(obj.content, obj.id);
      }
    }
  }

  private resolveContent(ref: string, type: CanvasObject['type']): string | null {
    // Handle token-based data URLs
    if (ref.startsWith('token:')) {
      const token = ref.substring('token:'.length);
      const stored = this.readDataToken(token);
      return stored ?? null;
    }

    // Try to load file-based content (dropped images)
    const fileStored = this.readFileContent(ref);
    if (fileStored) return fileStored;

    // For iframes, check if ref is a valid URL
    if (type === 'iframe') {
      if (this.isValidUrl(ref)) {
        return ref;
      }
      // Invalid iframe URL - don't restore
      return null;
    }

    // For images:
    // - If ref looks like a filename (from dropped file), we can't restore it without localStorage
    // - If ref is a URL (http/https), we can use it
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      return ref;
    }

    // Filename without localStorage data - can't resolve
    return null;
  }

  private parseFlags(flags?: string): Map<string, number | string> {
    const map = new Map<string, number | string>();
    if (!flags) return map;
    for (const entry of flags.split(',')) {
      const sep = entry.indexOf(':');
      if (sep <= 0) continue; // no key or no separator
      const k = entry.substring(0, sep);
      const v = entry.substring(sep + 1);
      if (!k || v === undefined) continue;
      const num = parseFloat(v);
      map.set(k, Number.isNaN(num) ? v : num);
    }
    return map;
  }

  private deriveSourceRef(content: string, filename?: string): string {
    if (!isPlatformBrowser(this.platformId)) return content;
    if (content.startsWith('data:')) {
      if (filename) {
        // Store under a stable file-key and reference by filename in hash
        const key = this.makeFileKey(filename);
        try {
          localStorage.setItem(key, content);
          return filename;
        } catch {
          // If storage fails, fall back to token storage
        }
      }
      const tokenized = this.createDataToken(content);
      return tokenized;
    }
    return filename ?? content;
  }

  private roundNumber(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private createDataToken(dataUrl: string): string {
    const token = `${this.dataTokenPrefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      localStorage.setItem(token, dataUrl);
    } catch {
      // Fallback: store only in-memory; do NOT leak data URL into hash
      this.ephemeralTokens.set(token, dataUrl);
    }
    return `token:${token}`;
  }

  private readDataToken(token: string): string | null {
    try {
      const value = localStorage.getItem(token);
      if (value) return value;
    } catch {
      // ignore and try memory fallback
    }
    return this.ephemeralTokens.get(token) ?? null;
  }

  private makeFileKey(filename: string): string {
    return `${this.dataFilePrefix}${filename}`;
  }

  private readFileContent(filename: string): string | null {
    const key = this.makeFileKey(filename);
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private generateId(): string {
    return 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  private cleanupObjectStorage(obj: CanvasObject): void {
    // Handle file-based references (from dropped images)
    if (obj.sourceRef && !obj.sourceRef.startsWith('token:') && !obj.sourceRef.startsWith('http')) {
      // This is a filename reference
      const key = this.makeFileKey(obj.sourceRef);
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    }
    // Handle token-based references
    else if (obj.sourceRef?.startsWith('token:')) {
      const tokenId = obj.sourceRef.substring('token:'.length);
      try {
        localStorage.removeItem(tokenId);
      } catch {
        // Ignore errors
      }
      this.ephemeralTokens.delete(tokenId);
    }
  }

  private cleanupOrphanedStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    try {
      // Collect all sourceRefs currently in use
      const activeRefs = new Set<string>();
      for (const obj of this.objects()) {
        activeRefs.add(obj.sourceRef);
      }
      
      // Scan localStorage for our prefixed keys
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        // Check if it's one of our keys
        if (key.startsWith(this.dataTokenPrefix)) {
          // Token-based entry: check if 'token:KEY' is referenced
          const ref = `token:${key}`;
          if (!activeRefs.has(ref)) {
            keysToRemove.push(key);
          }
        } else if (key.startsWith(this.dataFilePrefix)) {
          // File-based entry: extract filename and check if referenced
          const filename = key.substring(this.dataFilePrefix.length);
          if (!activeRefs.has(filename)) {
            keysToRemove.push(key);
          }
        }
      }
      
      // Remove orphaned entries
      if (keysToRemove.length > 0) {
        for (const key of keysToRemove) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      // Silently ignore errors
    }
  }

  private async renderCompositionToBlob(): Promise<Blob | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (this.objects().length === 0) return null;

    try {
      // Calculate bounding box of all objects
      const bounds = this.calculateCompositionBounds();
      if (!bounds) return null;

      // Create a canvas for rendering
      const outputSize = 1080;
      const padding = 8;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Leave background transparent (no fill)
      // The canvas will have a transparent background for PNG export

      // Calculate scale to fit composition within canvas with padding
      const availableSize = outputSize - 2 * padding;
      const scaleX = availableSize / bounds.width;
      const scaleY = availableSize / bounds.height;
      const scale = Math.min(scaleX, scaleY);

      // Calculate offset to center the composition
      const scaledWidth = bounds.width * scale;
      const scaledHeight = bounds.height * scale;
      const offsetX = (outputSize - scaledWidth) / 2;
      const offsetY = (outputSize - scaledHeight) / 2;

      // Render all objects
      await this.renderObjectsToCanvas(ctx, bounds, scale, offsetX, offsetY);

      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      return blob;
    } catch (error) {
      console.error('Error rendering composition:', error);
      return null;
    }
  }

  protected async shareComposition(): Promise<void> {
    try {
      const blob = await this.renderCompositionToBlob();
      if (!blob) return;

      // Try to use Web Share API if available and capable of file share
      const canShareFiles = navigator.canShare?.({ files: [new File([], 'probe', { type: 'image/png' })] }) ?? false;
      if (navigator.share && canShareFiles) {
        console.log('[Canvas] Share API available & canShare files, creating file...');
        const file = new File([blob], 'composition.png', { type: 'image/png' });
        
        // iOS Safari limitation: when sharing files, can't include url/text
        // Share just the image file to enable "Save Image" option
        const shareData: ShareData = {
          files: [file],
        };

        console.log('[Canvas] Attempting to share with data:', shareData);
        try {
          await navigator.share(shareData);
          console.log('[Canvas] Share successful');
          this.shareMenuOpen.set(false);
          return;
        } catch (shareError) {
          // User cancelled or share failed - fall through to download
          const errorMsg = shareError instanceof Error ? shareError.message : String(shareError);
          console.warn('[Canvas] Share failed, falling back:', errorMsg);
        }
      } else {
        console.log('[Canvas] Share API not available or cannot share files; falling back to download');
      }

      // Fallback: download the image if share is not available or was cancelled
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `composition-${timestamp}.png`;
      link.click();
      URL.revokeObjectURL(url);
      this.shareMenuOpen.set(false);
    } catch (error) {
      console.error('Error sharing composition:', error);
      this.shareMenuOpen.set(false);
    }
  }

  protected async downloadImage(): Promise<void> {
    try {
      const blob = await this.renderCompositionToBlob();
      if (!blob) return;

      // On mobile/iOS, prefer Web Share API to enable saving to photo library
      if (this.isMobile() && navigator.share) {
        const file = new File([blob], 'composition.png', { type: 'image/png' });
        const shareData: ShareData = {
          files: [file],
          title: 'Composition',
        };

        try {
          await navigator.share(shareData);
          return;
        } catch (shareError) {
          // User cancelled or share not supported - fall through to download
          console.log('Share cancelled or failed:', shareError);
        }
      }

      // Desktop: download the image
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `composition-${timestamp}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  }
  protected async shareImage(): Promise<void> {
    try {
      console.log('[Canvas] shareImage() called');
      const blob = await this.renderCompositionToBlob();
      if (!blob) {
        console.error('[Canvas] No blob generated');
        return;
      }

      console.log('[Canvas] Blob created, size:', blob.size);

      // Try Web Share API directly from canvas context
      const canShareFiles = navigator.canShare?.({ files: [new File([], 'probe', { type: 'image/png' })] }) ?? false;
      if (navigator.share && canShareFiles) {
        try {
          console.log('[Canvas] navigator.share available and canShare files, attempting to share blob directly');
          const file = new File([blob], 'composition.png', { type: 'image/png' });
          await navigator.share({
            files: [file],
            title: 'My Composition',
          });
          console.log('[Canvas] Share successful');
          return;
        } catch (err) {
          const error = err as Error;
          console.warn('[Canvas] Direct share failed (falling back):', error?.name, error?.message);
        }
      } else {
        console.log('[Canvas] navigator.share not available or cannot share files; falling back');
      }

      // iOS fallback: Use a blob URL that can be shared via custom UI
      const blobUrl = URL.createObjectURL(blob);
      console.log('[Canvas] Created blob URL:', blobUrl);

      // If in iframe, send to parent to handle share
      if (window.parent !== window) {
        console.log('[Canvas] In iframe, sending to parent for share handling');
        window.parent.postMessage({
          type: 'shareImage',
          blobUrl: blobUrl,
          filename: 'composition.png'
        }, '*');
      } else {
        // Direct download fallback
        console.log('[Canvas] Not in iframe, downloading directly');
        const link = document.createElement('a');
        link.href = blobUrl;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.download = `composition-${timestamp}.png`;
        link.click();
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('[Canvas] Error in shareImage:', error);
    }
  }

  private calculateCompositionBounds(): { x: number; y: number; width: number; height: number } | null {
    const objs = this.objects();
    if (objs.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of objs) {
      // Calculate the bounding box of the rotated object
      const corners = this.getObjectCorners(obj);
      for (const corner of corners) {
        minX = Math.min(minX, corner.x);
        minY = Math.min(minY, corner.y);
        maxX = Math.max(maxX, corner.x);
        maxY = Math.max(maxY, corner.y);
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private getObjectCorners(obj: CanvasObject): Array<{ x: number; y: number }> {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const corners = [
      { x: -obj.width / 2, y: -obj.height / 2 },
      { x: obj.width / 2, y: -obj.height / 2 },
      { x: obj.width / 2, y: obj.height / 2 },
      { x: -obj.width / 2, y: obj.height / 2 },
    ];

    return corners.map(corner => ({
      x: cx + corner.x * cos - corner.y * sin,
      y: cy + corner.x * sin + corner.y * cos,
    }));
  }

  private async renderObjectsToCanvas(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    scale: number,
    offsetX: number,
    offsetY: number
  ): Promise<void> {
    // Render objects in order
    for (const obj of this.objects()) {
      ctx.save();

      // Calculate position relative to bounds
      const relX = obj.x - bounds.x;
      const relY = obj.y - bounds.y;

      // Transform for position and rotation
      const centerX = offsetX + (relX + obj.width / 2) * scale;
      const centerY = offsetY + (relY + obj.height / 2) * scale;

      ctx.translate(centerX, centerY);
      ctx.rotate((obj.rotation * Math.PI) / 180);

      const scaledWidth = obj.width * scale;
      const scaledHeight = obj.height * scale;

      if (obj.type === 'image') {
        try {
          const img = await this.loadImage(obj.content);
          ctx.drawImage(
            img,
            -scaledWidth / 2,
            -scaledHeight / 2,
            scaledWidth,
            scaledHeight
          );
        } catch (error) {
          console.warn('Failed to load image:', error);
          // Draw placeholder
          ctx.fillStyle = '#ddd';
          ctx.fillRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
        }
      } else if (obj.type === 'iframe') {
        // Try to render og:image if available and not explicitly in iframe display mode
        // Default behavior: if ogImage exists and displayMode is not 'iframe', show the og:image
        if (obj.ogImage && obj.displayMode !== 'iframe') {
          try {
            const img = await this.loadImage(obj.ogImage);
            ctx.drawImage(
              img,
              -scaledWidth / 2,
              -scaledHeight / 2,
              scaledWidth,
              scaledHeight
            );
          } catch (error) {
            console.warn('Failed to load og:image:', error);
            // Fallback to placeholder
            ctx.fillStyle = '#ddd';
            ctx.fillRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
          }
        } else {
          // For iframes without og:image or explicitly in iframe mode, we can't render the actual content due to CORS
          // Draw a placeholder with the URL
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2;
          ctx.fillRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
          ctx.strokeRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);

          // Add text label
          ctx.fillStyle = '#333';
          ctx.font = `${Math.max(12, scaledHeight * 0.1)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Web Content', 0, 0);
        }
      }

      ctx.restore();
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only set crossOrigin for external URLs (not data URLs)
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }
}
