import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { PlatformAuthService } from '../services/platform-auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(PlatformAuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login screen with returnUrl
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
