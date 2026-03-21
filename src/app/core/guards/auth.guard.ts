import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CurrentUserService } from '../services/current-user.service';

/** Redirects already-logged-in users away from /login and /create-profile. */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const currentUser = inject(CurrentUserService);
  const router = inject(Router);
  if (currentUser.user()) {
    return router.parseUrl('/feed');
  }
  return true;
};
