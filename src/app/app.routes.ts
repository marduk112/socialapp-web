import { Routes } from '@angular/router';
import { authGuard, redirectIfAuthenticatedGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'feed',
    pathMatch: 'full',
  },
  {
    path: 'feed',
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/user-profile/user-profile.component').then(
        m => m.UserProfileComponent
      ),
  },
  {
    path: 'tags/:tag',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/tag/tag-feed.component').then(m => m.TagFeedComponent),
  },
  {
    path: 'search',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/search/search.component').then(m => m.SearchComponent),
  },
  {
    path: 'posts/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/post/post-detail.component').then(m => m.PostDetailComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notifications.component').then(m => m.NotificationsComponent),
  },
  {
    path: 'bookmarks',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/bookmarks/bookmarks.component').then(m => m.BookmarksComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: '**',
    redirectTo: 'feed',
  },
];
