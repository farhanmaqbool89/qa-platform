import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { BrowserOption, Project } from '../models/project.model';

type ProjectDraft = Omit<Project, 'id'>;

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private readonly baseUrl = 'http://localhost:3000/api/projects';
  private readonly projectsSubject = new BehaviorSubject<Project[]>([]);
  readonly projects$ = this.projectsSubject.asObservable();

  constructor(private readonly http: HttpClient) {
    this.loadProjects();
  }

  loadProjects(): void {
    this.http.get<{ success: boolean; projects: Project[] }>(this.baseUrl).subscribe({
      next: (res) => {
        if (res && res.success) {
          this.projectsSubject.next(res.projects || []);
        }
      },
      error: (err) => {
        console.error('Failed to load projects from backend', err);
      }
    });
  }

  getProjectSnapshot(): Project[] {
    return this.projectsSubject.value;
  }

  addProject(project: ProjectDraft): void {
    this.http.post<{ success: boolean; project: Project }>(this.baseUrl, project).subscribe({
      next: (res) => {
        if (res && res.success && res.project) {
          this.projectsSubject.next([...this.projectsSubject.value, res.project]);
        } else {
          this.loadProjects();
        }
      },
      error: (err) => {
        console.error('Failed to add project, applying fallback', err);
        const fallback: Project = {
          id: Date.now(),
          ...project
        };
        this.projectsSubject.next([...this.projectsSubject.value, fallback]);
      }
    });
  }

  updateProject(project: Project): void {
    this.http.put<{ success: boolean; project: Project }>(`${this.baseUrl}/${project.id}`, project).subscribe({
      next: (res) => {
        const target = res?.project ?? project;
        const nextProjects = this.projectsSubject.value.map((item) =>
          item.id === project.id ? target : item
        );
        this.projectsSubject.next(nextProjects);
      },
      error: (err) => {
        console.error('Failed to update project, applying fallback', err);
        const nextProjects = this.projectsSubject.value.map((item) =>
          item.id === project.id ? project : item
        );
        this.projectsSubject.next(nextProjects);
      }
    });
  }

  deleteProject(id: number): void {
    this.http.delete<{ success: boolean }>(`${this.baseUrl}/${id}`).subscribe({
      next: () => {
        const nextProjects = this.projectsSubject.value.filter((item) => item.id !== id);
        this.projectsSubject.next(nextProjects);
      },
      error: (err) => {
        console.error('Failed to delete project, applying fallback', err);
        const nextProjects = this.projectsSubject.value.filter((item) => item.id !== id);
        this.projectsSubject.next(nextProjects);
      }
    });
  }

  getBrowserOptions(): BrowserOption[] {
    return ['Chrome', 'Firefox', 'Edge'];
  }
}
