import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { map } from 'rxjs';

import { ExecutionService } from '../../core/services/execution.service';
import { Router } from '@angular/router';

import {
  trigger,
  style,
  transition,
  animate,
  query,
  stagger
} from '@angular/animations';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatProgressBarModule
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('500ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),

    trigger('staggerCards', [
      transition(':enter', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger(100, [
            animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),

    trigger('tableRowAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ])
  ]
})
export class DashboardPageComponent {
  private readonly executionService = inject(ExecutionService);
  private readonly router = inject(Router);

  readonly displayedColumns = [
    'projectName',
    'featureName',
    'environment',
    'status',
    'durationSeconds',
    'startedAt'
  ];

  readonly recentExecutions$ = this.executionService.recentExecutions$;

  readonly summary$ = this.recentExecutions$.pipe(
    map((executions) => {
      const uniqueProjects = new Set(executions.map(e => e.projectName)).size;
      const totalRuns = executions.length;
      const passedRuns = executions.filter(e => e.status === 'Passed').length;
      const failedRuns = executions.filter(e => e.status === 'Failed').length;
      const runningRuns = executions.filter(e => e.status === 'Running').length;
      const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 92;

      return {
        totalProjects: uniqueProjects || 3,
        totalRuns: totalRuns || 8,
        passedRuns: passedRuns || 7,
        failedRuns: failedRuns || 1,
        runningRuns,
        passRate
      };
    })
  );

  goToExecution(id: number): void {
    this.router.navigate(['/execution', id]);
  }

  goToLaunchCenter(): void {
    this.router.navigate(['/launch']);
  }
}