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
    id: 'centered',
    label: 'Center',
    render: (objects: CanvasObject[]): CanvasObject[] => {
      // App 1: Center the first image/content
      // Just return objects as-is; canvas will handle centering based on app
      return objects;
    },
  },
  {
    id: 'frame',
    label: 'Frame',
    render: (objects: CanvasObject[]): CanvasObject[] => {
      // App 2: Place an empty frame next to the image
      // The canvas will handle creating and positioning the frame
      return objects;
    },
  },
  {
    id: 'app3',
    label: 'App 3',
    render: (objects: CanvasObject[]): CanvasObject[] => {
      // Placeholder for future apps
      return objects;
    },
  },
];
