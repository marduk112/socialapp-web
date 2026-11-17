import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurrentUserService } from '../services/current-user.service';

/** Login/register legitimately return 401/4xx for bad input — must not trigger logout. */
function isPublicAuthCall(req: { url: string; method: string }): boolean {
  const path = req.url.substring(environment.apiUrl.length).split('?')[0];
  if (path === '/users/login') return true;
  return req.method === 'POST' && path === '/users';
}

/** Adds the Bearer token to API calls; logs out and redirects to /login on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const currentUser = inject(CurrentUserService);
  const router = inject(Router);

  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const token = currentUser.token();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isPublicAuthCall(req)) {
        currentUser.clearUser();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
