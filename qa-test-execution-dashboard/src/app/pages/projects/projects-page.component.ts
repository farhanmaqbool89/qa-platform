import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { filter, Observable } from 'rxjs';
import { Project } from '../../core/models/project.model';
import { ProjectService } from '../../core/services/project.service';
import { ProjectDialogComponent, ProjectDialogResult } from './project-dialog.component';
import { trigger, state, style, transition, animate, query, stagger } from '@angular/animations';

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, MatTableModule],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('600ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('tableRowAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('buttonHover', [
      state('idle', style({ transform: 'scale(1)' })),
      state('hover', style({ transform: 'scale(1.05)' })),
      transition('idle <=> hover', animate('200ms ease-in-out'))
    ])
  ]
})
export class ProjectsPageComponent {
  readonly displayedColumns = ['name', 'baseUrl', 'browser', 'username', 'actions'];
  readonly projects$!: Observable<Project[]>;

  constructor(
    private readonly projectService: ProjectService,
    private readonly dialog: MatDialog
  ) {
    this.projects$ = this.projectService.projects$;
  }

  openAddDialog(): void {
    this.dialog
      .open(ProjectDialogComponent, {
        width: '560px',
        data: null
      })
      .afterClosed()
      .pipe(filter((result): result is ProjectDialogResult => !!result))
      .subscribe((result) => this.projectService.addProject(result));
  }

  openEditDialog(project: Project): void {
    this.dialog
      .open(ProjectDialogComponent, {
        width: '560px',
        data: project
      })
      .afterClosed()
      .pipe(filter((result): result is ProjectDialogResult => !!result))
      .subscribe((result) =>
        this.projectService.updateProject({
          ...project,
          ...result
        })
      );
  }

  deleteProject(id: number): void {
    if (confirm('Are you sure you want to delete this project?')) {
      this.projectService.deleteProject(id);
    }
  }
}
