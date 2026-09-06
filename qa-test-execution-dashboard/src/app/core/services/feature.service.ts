import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { FeatureFile } from '../models/feature.model';

export interface FeatureDraft {
  id?: number;
  projectId: number;
  name: string;
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeatureService {
  private readonly baseUrl = 'http://localhost:3000/api/features';
  private readonly featuresSubject = new BehaviorSubject<FeatureFile[]>([]);
  readonly features$ = this.featuresSubject.asObservable();

  constructor(private readonly http: HttpClient) {
    this.loadFeatures();
  }

  loadFeatures(): void {
    this.http.get<{ success: boolean; features: FeatureFile[] }>(this.baseUrl).subscribe({
      next: (res) => {
        if (res && res.success) {
          this.featuresSubject.next(res.features || []);
        }
      },
      error: (err) => {
        console.error('Failed to load features from backend', err);
      }
    });
  }

  getFeatureSnapshot(): FeatureFile[] {
    return this.featuresSubject.value;
  }

  saveFeature(draft: FeatureDraft): Observable<{ success: boolean; feature: FeatureFile }> {
    return this.http.post<{ success: boolean; feature: FeatureFile }>(this.baseUrl, draft).pipe(
      tap((res) => {
        if (res && res.success) {
          // If editing an existing item, replace it in the subject
          const exists = this.featuresSubject.value.some(f => f.id === res.feature.id);
          if (exists) {
            const nextFeatures = this.featuresSubject.value.map(f => f.id === res.feature.id ? res.feature : f);
            this.featuresSubject.next(nextFeatures);
          } else {
            this.featuresSubject.next([res.feature, ...this.featuresSubject.value]);
          }
        }
      })
    );
  }

  deleteFeature(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${id}`).pipe(
      tap((res) => {
        if (res && res.success) {
          const nextFeatures = this.featuresSubject.value.filter(f => f.id !== id);
          this.featuresSubject.next(nextFeatures);
        }
      })
    );
  }
}
