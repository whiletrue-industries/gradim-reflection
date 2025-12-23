import { Component, signal, computed, ChangeDetectionStrategy, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
}

interface TransformHandle {
  type: 'move' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'scale-se' | 'scale-w' | 'scale-e' | 'scale-n' | 'scale-s' | 'rotate';
  cursor: string;
}

@Component({
  selector: 'app-canvas',
  imports: [CommonModule],
  templateUrl: './canvas.html',
  styleUrl: './canvas.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Canvas {
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);

  private readonly baseSize = 200;
  private readonly dataTokenPrefix = 'data-token-';
  private readonly dataFilePrefix = 'file-data-';
  private hashUpdateHandle: number | null = null;
  private readonly hashThrottleMs = 80;
  private lastSerializedHash = '';
  private suppressHash = false; // suppress hash writes during interactions
  private hashDirty = false;    // track pending changes while suppressed
  private wheelFlushHandle: number | null = null; // debounce wheel flush
  private ephemeralTokens = new Map<string, string>(); // in-memory fallback for tokens
  // 1x1 transparent PNG to keep image objects alive when content can't resolve yet
  private readonly transparentPixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/hsrLxkAAAAASUVORK5CYII=';
  
  protected objects = signal<CanvasObject[]>([]);
  protected selectedObjectId = signal<string | null>(null);
  protected selectedObject = computed(() => {
    const id = this.selectedObjectId();
    return id ? this.objects().find(obj => obj.id === id) : null;
  });
  
  protected viewportX = signal(0);
  protected viewportY = signal(0);
  protected zoom = signal(1);
  
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
      this.applyHashState(window.location.hash);
      window.addEventListener('hashchange', this.onHashChange);
      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      effect(() => {
        // Track canvas view and objects; schedule hash sync when they change.
        this.viewportX();
        this.viewportY();
        this.zoom();
        this.objects();
        this.scheduleHashUpdate();
      });
      effect(() => {
        // Update grid scale when zoom changes
        const currentZoom = this.zoom();
        this.updateGridScale(currentZoom);
      });
    }
  }

  private onHashChange = (): void => {
    if (!isPlatformBrowser(this.platformId)) return;
    if (window.location.hash === this.lastSerializedHash) return;
    this.applyHashState(window.location.hash);
    this.lastSerializedHash = window.location.hash;
  };

  private setupEventListeners(): void {
    // Paste event for URLs
    window.addEventListener('paste', (e) => this.onPaste(e));
    
    // Prevent default drag behavior
    window.addEventListener('dragover', (e) => e.preventDefault());
    
    // Wheel event for zooming
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
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
    const text = event.clipboardData?.getData('text');
    if (text && this.isValidUrl(text)) {
      // Add iframe at center of viewport
      const sourceRef = this.deriveSourceRef(text);
      this.addObject({
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
      });
      event.preventDefault();
    }
  }

  private isValidUrl(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
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
      this.suppressHash = true; // Suppress hash during object drag
    const objectToDelete = this.objects().find(o => o.id === selectedId);
    if (objectToDelete) {
      this.cleanupObjectStorage(objectToDelete);
    }
    
    this.objects.update(objects => objects.filter(o => o.id !== selectedId));
    this.selectedObjectId.set(null);
    this.scheduleHashUpdate();
  }

  protected onObjectClick(event: MouseEvent, objectId: string): void {
    event.stopPropagation();
    this.selectedObjectId.set(objectId);
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

  protected onObjectMouseMove(event: MouseEvent, objectId: string): void {
    // Cursor affordances are handled by CSS, no need for JavaScript
  }

  protected onObjectMouseLeave(event: MouseEvent): void {
    // Cursor affordances are handled by CSS, no need for JavaScript
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

  protected resetZoom(): void {
    this.zoom.set(1);
    this.viewportX.set(0);
    this.viewportY.set(0);
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    // Suppress hash during rapid wheel zoom; flush after debounce
    this.suppressHash = true;
    
    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, this.zoom() * zoomFactor));
    
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
    }, 150);
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

  private handleScale(objectId: string, dx: number, dy: number, handle: string): void {
    if (!this.originalObject) return;
    
    let newWidth = this.originalObject.width;
    let newHeight = this.originalObject.height;
    let xOffset = 0;
    let yOffset = 0;
    
    // Corner handles - scale both dimensions
    if (handle === 'scale-nw') {
      const scaleDelta = (-dx - dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = this.originalObject.type === 'image' 
        ? newWidth * this.originalObject.originalAspectRatio
        : Math.max(50, this.originalObject.height + scaleDelta);
      xOffset = this.originalObject.width - newWidth;
      yOffset = this.originalObject.height - newHeight;
    } else if (handle === 'scale-ne') {
      const scaleDelta = (dx - dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = this.originalObject.type === 'image' 
        ? newWidth * this.originalObject.originalAspectRatio
        : Math.max(50, this.originalObject.height + scaleDelta);
      yOffset = this.originalObject.height - newHeight;
    } else if (handle === 'scale-sw') {
      const scaleDelta = (-dx + dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = this.originalObject.type === 'image' 
        ? newWidth * this.originalObject.originalAspectRatio
        : Math.max(50, this.originalObject.height + scaleDelta);
      xOffset = this.originalObject.width - newWidth;
    } else if (handle === 'scale-se') {
      const scaleDelta = (dx + dy) / 2;
      newWidth = Math.max(50, this.originalObject.width + scaleDelta);
      newHeight = this.originalObject.type === 'image' 
        ? newWidth * this.originalObject.originalAspectRatio
        : Math.max(50, this.originalObject.height + scaleDelta);
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
  protected onIframeLoad(event: Event, objectId: string): void {
    const iframe = event.target as HTMLIFrameElement | null;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document || null;
      if (!doc) return;
      if (doc.documentElement) {
        (doc.documentElement as HTMLElement).style.overflow = 'hidden';
      }
      if (doc.body) {
        doc.body.style.overflow = 'hidden';
      }
      const style = doc.createElement('style');
      style.textContent = '::-webkit-scrollbar{display:none} html,body{overflow:hidden!important}';
      doc.head?.appendChild(style);
    } catch {
      // Cross-origin: cannot access; rely on outer CSS and scrolling="no"
    }
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
      // Only write if changed to avoid unnecessary hashchange events
      if (prefixedHash !== this.lastSerializedHash) {
        window.location.hash = prefixedHash;
        this.lastSerializedHash = prefixedHash;
      }
      this.hashDirty = false;
      this.hashUpdateHandle = null;
    }, this.hashThrottleMs);
  }

  private serializeStateToHash(): string {
    const parts: string[] = [];
    parts.push(this.serializeCanvasSegment());
    for (const obj of this.objects()) {
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
    const ref = encodeURIComponent(obj.sourceRef);
    return `${ref}/${x},${y},${scale},${rotation}/${flags.join(',')}`;
  }

  private applyHashState(hash: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!hash || hash.length <= 1) return;

    const segments = hash.substring(1).split('#').filter(Boolean);
    if (segments.length === 0) return;

    const nextObjects: CanvasObject[] = [];
    let nextViewportX = this.viewportX();
    let nextViewportY = this.viewportY();
    let nextZoom = this.zoom();

    for (const segment of segments) {
      const [encodedRef, transformPart, flagsPart] = segment.split('/');
      if (!encodedRef || !transformPart) continue;

      const ref = decodeURIComponent(encodedRef);
      if (ref === 'canvas') {
        const [vx, vy, vz] = transformPart.split(',').map(parseFloat);
        if (!Number.isNaN(vx)) nextViewportX = vx;
        if (!Number.isNaN(vy)) nextViewportY = vy;
        if (!Number.isNaN(vz)) nextZoom = Math.max(0.1, Math.min(5, vz));
        continue;
      }

      const [tx, ty, ts, tr] = transformPart.split(',').map(parseFloat);
      if ([tx, ty, ts, tr].some(v => Number.isNaN(v))) continue;

      const flagMap = this.parseFlags(flagsPart);
      const ratioValue = flagMap.get('ratio') ?? 1;
      const ratio = typeof ratioValue === 'number' ? ratioValue : parseFloat(String(ratioValue));
      const safeRatio = Number.isNaN(ratio) ? 1 : ratio;
      const type = (flagMap.get('type') as CanvasObject['type'] | undefined) ?? 'image';
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
      });
    }

    this.viewportX.set(nextViewportX);
    this.viewportY.set(nextViewportY);
    this.zoom.set(nextZoom);
    this.objects.set(nextObjects);
    this.selectedObjectId.set(null);
    this.lastSerializedHash = hash.startsWith('#') ? hash : `#${hash}`;
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
      const [k, v] = entry.split(':');
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
}
