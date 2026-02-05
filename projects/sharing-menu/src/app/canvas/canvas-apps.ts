/**
 * Canvas app definitions
 * Each app provides a different rendering or interaction mode
 */

export interface CanvasApp {
  id: string;
  label: string;
  render(objects: CanvasObject[]): CanvasObject[];
}

// Minimal re-export for type safety
interface CanvasObject {
  id: string;
  type: 'image' | 'iframe';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content: string;
  sourceRef: string;
  originalAspectRatio: number;
  safeUrl?: any;
  ogImage?: string | null;
  displayMode?: 'iframe' | 'image';
}

export const CANVAS_APPS: CanvasApp[] = [
  {
    id: 'image',
    label: 'Image',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'gallery',
    label: 'Gallery',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'merge',
    label: 'Merge',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'map',
    label: 'Map',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'draw',
    label: 'Draw',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'shape',
    label: 'Shape',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'crop',
    label: 'Crop',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
  {
    id: 'target',
    label: 'Target',
    render: (objects: CanvasObject[]): CanvasObject[] => objects,
  },
];
