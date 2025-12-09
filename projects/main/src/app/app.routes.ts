import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'sample-reflect',
    loadComponent: () => import('../../../sample-reflect/src/app/app').then(m => m.App)
  }
];
