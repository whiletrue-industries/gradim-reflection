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
  private dragStartX = 0;
  private dragStartY = 0;
  private transformStartX = 0;
  private transformStartY = 0;
  private transformHandle: string | null = null;
  private originalObject: CanvasObject | null = null;
  
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
    }
  }

  private setupEventListeners(): void {
    // Paste event for URLs
    window.addEventListener('paste', (e) => this.onPaste(e));
    
    // Prevent default drag behavior
    window.addEventListener('dragover', (e) => e.preventDefault());
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
          
          this.addObject({
            id: this.generateId(),
            type: 'image',
            x: x / this.zoom(),
            y: y / this.zoom(),
            width: 200,
            height: 200,
            rotation: 0,
            content: reader.result as string,
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
      this.addObject({
        id: this.generateId(),
        type: 'iframe',
        x: (window.innerWidth / 2 - this.viewportX()) / this.zoom(),
        y: (window.innerHeight / 2 - this.viewportY()) / this.zoom(),
        width: 600,
        height: 400,
        rotation: 0,
        content: text,
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
  }

  private generateId(): string {
    return 'obj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  protected onObjectClick(event: MouseEvent, objectId: string): void {
    event.stopPropagation();
    this.selectedObjectId.set(objectId);
  }

  protected onCanvasClick(event: MouseEvent): void {
    // Deselect if clicking on canvas background
    if (event.target === event.currentTarget) {
      this.selectedObjectId.set(null);
    }
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
}
