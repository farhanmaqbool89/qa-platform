import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TestExecution } from '../models/execution.model';
import { ExecutionReport } from '../models/report.model';

const INITIAL_REPORTS: ExecutionReport[] = [
  {
    id: 1,
    projectName: 'Customer Portal',
    featureName: 'login.feature',
    environment: 'QA',
    status: 'Passed',
    durationSeconds: 94,
    executedAt: '2026-04-16T08:40:00.000Z',
    details: 'Smoke login scenario passed for Customer Portal in QA.'
  },
  {
    id: 2,
    projectName: 'Admin Console',
    featureName: 'role-management.feature',
    environment: 'Staging',
    status: 'Failed',
    durationSeconds: 132,
    executedAt: '2026-04-16T10:10:00.000Z',
    details: 'Role creation validation failed due to missing expected toaster message.'
  },
  {
    id: 3,
    projectName: 'Payments API UI',
    featureName: 'refund.feature',
    environment: 'QA',
    status: 'Passed',
    durationSeconds: 118,
    executedAt: '2026-04-15T16:00:00.000Z',
    details: 'Refund scenario completed with successful assertions.'
  }
];

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly reportsSubject = new BehaviorSubject<ExecutionReport[]>(INITIAL_REPORTS);
  readonly reports$ = this.reportsSubject.asObservable();

  addExecutionReport(execution: TestExecution): void {
    const nextReport: ExecutionReport = {
      id: this.generateId(),
      projectName: execution.projectName,
      featureName: execution.featureName,
      environment: execution.environment,
      status: execution.status,
      durationSeconds: execution.durationSeconds,
      executedAt: execution.startedAt,
      details: `${execution.featureName} executed on ${execution.environment} environment with ${execution.status} status.`
    };

    this.reportsSubject.next([nextReport, ...this.reportsSubject.value].slice(0, 25));
  }

  getReportSnapshot(): ExecutionReport[] {
    return this.reportsSubject.value;
  }

  private generateId(): number {
    return Math.max(0, ...this.reportsSubject.value.map((item) => item.id)) + 1;
  }
}
