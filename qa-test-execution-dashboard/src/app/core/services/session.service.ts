import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface SessionState {
  name: string;
  displayName: string;
  size?: number;
  modified?: string;
  role?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly apiUrl = 'http://localhost:3000/api/sessions';

  private readonly defaultSessions: SessionState[] = [
    { name: 'admin-storageState.json', displayName: 'Enterprise Admin State (admin@company.com)', role: 'Administrator' },
    { name: 'customer-portal-state.json', displayName: 'Customer User State (portal.user@qa.com)', role: 'Customer' },
    { name: 'executive-login.json', displayName: 'Executive Dashboard Session', role: 'Executive' }
  ];

  private readonly sessionsSubject = new BehaviorSubject<SessionState[]>(this.defaultSessions);
  readonly sessions$ = this.sessionsSubject.asObservable();

  constructor(private readonly http: HttpClient) {
    this.fetchSessions();
  }

  fetchSessions(): void {
    this.http.get<{ success: boolean; sessions: Array<{ name?: string; fileName?: string; size?: number; sizeBytes?: number; modified?: string; updatedAt?: string }> }>(this.apiUrl)
      .pipe(
        map(res => {
          if (res && res.success && Array.isArray(res.sessions) && res.sessions.length > 0) {
            return res.sessions.map(s => {
              const name = s.fileName || s.name || '';
              const size = s.sizeBytes != null ? s.sizeBytes : s.size;
              const modified = s.updatedAt || s.modified;
              return {
                name: name,
                displayName: name.replace(/\.json$/, '').replace(/[-_]/g, ' ').toUpperCase(),
                size: size,
                modified: modified,
                role: name.toLowerCase().includes('admin') ? 'Administrator' : 'User State'
              };
            });
          }
          return this.defaultSessions;
        }),
        catchError(() => of(this.defaultSessions))
      )
      .subscribe(sessions => {
        this.sessionsSubject.next(sessions);
      });
  }
}
