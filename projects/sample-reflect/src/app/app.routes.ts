import { Routes } from '@angular/router';
import { Canvas } from './canvas/canvas';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: Canvas
  }
];
