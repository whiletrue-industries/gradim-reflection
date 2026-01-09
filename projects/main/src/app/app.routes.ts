import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./url-wrapper/url-wrapper').then(m => m.UrlWrapper)
  },
  {
    path: 'sample-reflect',
    loadComponent: () => import('../../../sample-reflect/src/app/app').then(m => m.App)
  }
];
