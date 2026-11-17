import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CurrentUserService } from '../services/current-user.service';

/** Blocks protected routes for signed-out users (no session or no token) and sends them to /login. */
export const authGuard: CanActivateFn = () => {
  const currentUser = inject(CurrentUserService);
  const router = inject(Router);
  if (currentUser.user() && currentUser.token()) {
    return true;
  }
  return router.parseUrl('/login');
};

/** Redirects already-logged-in users away from /login and /create-profile. */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const currentUser = inject(CurrentUserService);
  const router = inject(Router);
  if (currentUser.user() && currentUser.token()) {
    return router.parseUrl('/feed');
  }
  return true;
};
