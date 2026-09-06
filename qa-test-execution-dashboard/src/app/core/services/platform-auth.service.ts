import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, tap, catchError, map } from 'rxjs';
import { PlatformUser, AuthResponse } from '../models/user.model';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class PlatformAuthService {
  private readonly baseUrl = 'http://localhost:3000/api/auth';
  private currentUserSubject = new BehaviorSubject<PlatformUser | null>(this.getStoredUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  public get currentUserValue(): PlatformUser | null {
    return this.currentUserSubject.value;
  }

  public get accessToken(): string | null {
    return localStorage.getItem('qa_access_token');
  }

  public get refreshToken(): string | null {
    return localStorage.getItem('qa_refresh_token');
  }

  public isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  register(payload: { email: string; password: string; name?: string; organizationName?: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/register`, payload).pipe(
      tap((res) => {
        if (res.success && res.accessToken && res.user) {
          this.storeTokens(res.accessToken, res.refreshToken || '', res.user);
        }
      })
    );
  }

  login(payload: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, payload).pipe(
      tap((res) => {
        if (res.success && res.accessToken && res.user) {
          this.storeTokens(res.accessToken, res.refreshToken || '', res.user);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem('qa_access_token');
    localStorage.removeItem('qa_refresh_token');
    localStorage.removeItem('qa_user_profile');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  refreshTokenCall(): Observable<AuthResponse> {
    const refresh = this.refreshToken;
    if (!refresh) return of({ success: false, message: 'No refresh token available' });

    return this.http.post<AuthResponse>(`${this.baseUrl}/refresh-token`, { refreshToken: refresh }).pipe(
      tap((res) => {
        if (res.success && res.accessToken) {
          localStorage.setItem('qa_access_token', res.accessToken);
          if (res.refreshToken) {
            localStorage.setItem('qa_refresh_token', res.refreshToken);
          }
        }
      })
    );
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/forgot-password`, { email });
  }

  resetPassword(payload: { token: string; newPassword: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/reset-password`, payload);
  }

  getMe(): Observable<PlatformUser | null> {
    return this.http.get<{ success: boolean; user: PlatformUser }>(`${this.baseUrl}/me`).pipe(
      map((res) => res.user),
      tap((user) => {
        if (user) {
          localStorage.setItem('qa_user_profile', JSON.stringify(user));
          this.currentUserSubject.next(user);
        }
      }),
      catchError(() => of(null))
    );
  }

  private storeTokens(access: string, refresh: string, user: PlatformUser): void {
    localStorage.setItem('qa_access_token', access);
    if (refresh) localStorage.setItem('qa_refresh_token', refresh);
    localStorage.setItem('qa_user_profile', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private getStoredUser(): PlatformUser | null {
    try {
      const raw = localStorage.getItem('qa_user_profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
