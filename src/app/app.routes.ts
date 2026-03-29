import { Routes } from '@angular/router';
import { redirectIfAuthenticatedGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'feed',
    pathMatch: 'full',
  },
  {
    path: 'feed',
    loadComponent: () =>
      import('./features/feed/feed.component').then(m => m.FeedComponent),
  },
  {
    path: 'login',
    canActivate: [redirectIfAuthenticatedGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'create-profile',
    canActivate: [redirectIfAuthenticatedGuard],
    loadComponent: () =>
      import('./features/auth/create-profile.component').then(m => m.CreateProfileComponent),
  },
  {
    path: 'users/:profileId',
    loadComponent: () =>
      import('./features/user-profile/user-profile.component').then(
        m => m.UserProfileComponent
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: '**',
    redirectTo: 'feed',
  },
];
