import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'monadic-mockup',
    loadComponent: () => import('./monadic-mockup/monadic-mockup').then(m => m.MonadicMockup)
  },
  {
    path: 'sample-reflect',
    loadComponent: () => import('../../../sample-reflect/src/app/app').then(m => m.App)
  }
];
