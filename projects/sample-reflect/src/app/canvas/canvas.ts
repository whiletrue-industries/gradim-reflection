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
  safeUrl?: SafeResourceUrl; // Sanitized URL for iframes
}

interface TransformHandle {
  type: 'move' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'scale-se' | 'rotate';
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
  
  protected objects = signal<CanvasObject[]>([]);
  protected selectedObjectId = signal<string | null>(null);
  protected selectedObject = computed(() => {
    const id = this.selectedObjectId();
    return id ? this.objects().find(obj => obj.id === id) : null;
  });
  
  protected viewportX = signal(0);
  protected viewportY = signal(0);
  protected zoom = signal(1);
  
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
  
  protected readonly transformHandles: TransformHandle[] = [
    { type: 'scale-nw', cursor: 'nw-resize' },
    { type: 'scale-ne', cursor: 'ne-resize' },
    { type: 'scale-sw', cursor: 'sw-resize' },
    { type: 'scale-se', cursor: 'se-resize' },
    { type: 'rotate', cursor: 'grab' },
  ];

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.setupEventListeners();
      this.applyHashState(window.location.hash);
      window.addEventListener('hashchange', this.onHashChange);
      effect(() => {
        // Track canvas view and objects; schedule hash sync when they change.
        this.viewportX();
        this.viewportY();
        this.zoom();
        this.objects();
        this.scheduleHashUpdate();
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
          });
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

  private generateId(): string {
    return 'obj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  protected onObjectClick(event: MouseEvent, objectId: string): void {
    event.stopPropagation();
    this.selectedObjectId.set(objectId);
  }

  protected onCanvasClick(event: MouseEvent): void {
    // Deselect if clicking on canvas background (not on objects)
    const target = event.target as HTMLElement;
    const isBackgroundClick = target === event.currentTarget || 
                             target.classList.contains('dot-grid') || 
                             target.classList.contains('canvas-objects');
    
    if (isBackgroundClick) {
      this.selectedObjectId.set(null);
    }
  }

  protected onCanvasMouseDown(event: MouseEvent): void {
    // Only pan if clicking on canvas background (not on objects)
    if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains('dot-grid')) {
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
        this.scheduleHashUpdate();
      };

      const onMouseUp = () => {
        this.isPanningCanvas = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    
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
    this.scheduleHashUpdate();
  }

  protected onObjectMouseDown(event: MouseEvent, objectId: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    const obj = this.objects().find(o => o.id === objectId);
    if (!obj) return;
    
    this.isDragging = true;
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
        this.scheduleHashUpdate();
    };

    const onMouseUp = () => {
      this.isDragging = false;
      this.originalObject = null;
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
    this.transformStartX = event.clientX;
    this.transformStartY = event.clientY;
    this.transformHandle = handleType;
    this.originalObject = { ...obj };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isTransforming || !this.originalObject) return;
      
      const dx = (e.clientX - this.transformStartX) / this.zoom();
      const dy = (e.clientY - this.transformStartY) / this.zoom();
      
      if (this.transformHandle === 'rotate') {
        this.handleRotate(objectId, e.clientX, e.clientY);
      } else if (this.transformHandle?.startsWith('scale-')) {
        this.handleScale(objectId, dx, dy, this.transformHandle);
      }
        this.scheduleHashUpdate();
    };

    const onMouseUp = () => {
      this.isTransforming = false;
      this.originalObject = null;
      this.transformHandle = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  private handleScale(objectId: string, dx: number, dy: number, handle: string): void {
    if (!this.originalObject) return;
    
    const scaleFactorX = handle.includes('e') ? 1 : -1;
    const scaleFactorY = handle.includes('s') ? 1 : -1;
    
    const newWidth = Math.max(50, this.originalObject.width + dx * scaleFactorX);
    const newHeight = Math.max(50, this.originalObject.height + dy * scaleFactorY);
    
    const xOffset = handle.includes('w') ? this.originalObject.width - newWidth : 0;
    const yOffset = handle.includes('n') ? this.originalObject.height - newHeight : 0;
    
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
    
    // Get center of object
    const centerX = (obj.x + obj.width / 2) * this.zoom() + this.viewportX();
    const centerY = (obj.y + obj.height / 2) * this.zoom() + this.viewportY();
    
    // Calculate angle
    const angle = Math.atan2(clientY - centerY, clientX - centerX);
    const degrees = angle * (180 / Math.PI);
    
    this.objects.update(objects =>
      objects.map(o =>
        o.id === objectId ? { ...o, rotation: degrees } : o
      )
    );
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

  // ---- Hash sync (inflect) ----

  private scheduleHashUpdate(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.hashUpdateHandle) {
      window.clearTimeout(this.hashUpdateHandle);
    }

    this.hashUpdateHandle = window.setTimeout(() => {
      const hash = this.serializeStateToHash();
      const prefixedHash = `#${hash}`;
      this.lastSerializedHash = prefixedHash;
      window.location.hash = prefixedHash;
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
      const content = this.resolveContent(ref, type);
      if (!content) continue;

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
    if (ref.startsWith('token:')) {
      const token = ref.substring('token:'.length);
      const stored = this.readDataToken(token);
      return stored ?? null;
    }

    const fileStored = this.readFileContent(ref);
    if (fileStored) return fileStored;

    if (type === 'iframe' && !this.isValidUrl(ref)) {
      return null;
    }

    return ref;
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
        const key = this.makeFileKey(filename);
        try {
          localStorage.setItem(key, content);
          return filename;
        } catch {
          // If storage fails, fall back to token
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
      // Ignore storage failures; hash will carry full data URL instead
      return dataUrl;
    }
    return `token:${token}`;
  }

  private readDataToken(token: string): string | null {
    try {
      const value = localStorage.getItem(token);
      return value ?? null;
    } catch {
      return null;
    }
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
}
