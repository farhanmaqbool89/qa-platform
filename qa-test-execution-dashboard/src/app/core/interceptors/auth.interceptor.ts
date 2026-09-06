import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PlatformAuthService } from '../services/platform-auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(PlatformAuthService);
  const token = authService.accessToken;

  // Do not attach token to non-API external calls or if missing
  if (token && req.url.includes('/api/')) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
    return next(authReq);
  }

  return next(req);
};
