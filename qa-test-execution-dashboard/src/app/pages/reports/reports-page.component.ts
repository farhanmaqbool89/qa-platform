import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ExecutionReport } from '../../core/models/report.model';
import { ReportService } from '../../core/services/report.service';
import { ReportExporterService } from '../../core/services/report-exporter.service';
import { ReportDetailsDialogComponent } from './report-details-dialog.component';

import { map, Observable } from 'rxjs';

export interface SummaryMetrics {
  totalExecutions: number;
  passedExecutions: number;
  failedExecutions: number;
  passRate: number;
  avgDurationSeconds: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  totalAccessibilityScans: number;
  avgAccessibilityScore: number;
  criticalViolationsFound: number;
  topFailureReason: string;
}

export interface ExecutionTrendDay {
  date: string;
  dayName: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  avgDuration: number;
}

export interface FlakyTestItem {
  id: string;
  scenarioName: string;
  featureFile: string;
  flakinessScore: number;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  lastFailureReason: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  trend: string;
}

export interface AccessibilityTrendItem {
  scanId: string;
  scanTime: string;
  score: number;
  targetTitle: string;
  url: string;
  criticalCount: number;
  seriousCount: number;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatTableModule,
    MatTabsModule,
    MatChipsModule,
    MatTooltipModule
  ],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss'
})
export class ReportsPageComponent implements OnInit {

  readonly displayedColumns: string[] = [
    'projectName',
    'featureName',
    'environment',
    'status',
    'durationSeconds',
    'executedAt',
    'actions'
  ];

  readonly flakyColumns: string[] = [
    'scenarioName',
    'featureFile',
    'flakinessScore',
    'runs',
    'riskLevel',
    'lastFailureReason'
  ];

  readonly reports$: Observable<ExecutionReport[]>;

  summary: SummaryMetrics | null = null;
  trends: ExecutionTrendDay[] = [];
  flakyTests: FlakyTestItem[] = [];
  accessibilityTrends: AccessibilityTrendItem[] = [];

  isLoadingAnalytics = true;

  constructor(
    private readonly reportService: ReportService,
    private readonly exporterService: ReportExporterService,
    private readonly http: HttpClient,
    private readonly dialog: MatDialog
  ) {
    this.reports$ = this.reportService.reports$.pipe(
      map((reports) => reports ?? [])
    );
  }

  ngOnInit(): void {
    this.loadAnalyticsData();
  }

  loadAnalyticsData(): void {
    this.isLoadingAnalytics = true;

    // Fetch analytics endpoints in parallel
    this.http.get<{ success: boolean; summary: SummaryMetrics }>('http://localhost:3000/api/reports/summary')
      .subscribe({
        next: (res) => { if (res.success) this.summary = res.summary; },
        error: () => {
          // Fallback defaults if backend offline
          this.summary = {
            totalExecutions: 24,
            passedExecutions: 19,
            failedExecutions: 5,
            passRate: 79.2,
            avgDurationSeconds: 14.5,
            totalScenarios: 48,
            passedScenarios: 42,
            failedScenarios: 6,
            totalAccessibilityScans: 4,
            avgAccessibilityScore: 88,
            criticalViolationsFound: 2,
            topFailureReason: 'ElementNotFound (Timeout 5000ms)'
          };
        }
      });

    this.http.get<{ success: boolean; trends: ExecutionTrendDay[] }>('http://localhost:3000/api/reports/trends')
      .subscribe({
        next: (res) => { if (res.success) this.trends = res.trends; },
        error: () => {}
      });

    this.http.get<{ success: boolean; flakyTests: FlakyTestItem[] }>('http://localhost:3000/api/reports/flaky')
      .subscribe({
        next: (res) => { if (res.success) this.flakyTests = res.flakyTests; },
        error: () => {}
      });

    this.http.get<{ success: boolean; reports: AccessibilityTrendItem[] }>('http://localhost:3000/api/reports/accessibility-trends')
      .subscribe({
        next: (res) => {
          if (res.success) this.accessibilityTrends = res.reports;
          this.isLoadingAnalytics = false;
        },
        error: () => { this.isLoadingAnalytics = false; }
      });
  }

  exportPdf(): void {
    if (!this.summary) return;
    this.exporterService.exportExecutivePdf({
      summary: this.summary,
      trends: this.trends,
      flakyTests: this.flakyTests
    });
  }

  exportExecutionCsv(reports: ExecutionReport[]): void {
    const headers = ['Project', 'Feature', 'Environment', 'Status', 'Duration (s)', 'Executed At'];
    const rows = reports.map(r => [
      r.projectName,
      r.featureName,
      r.environment,
      r.status,
      r.durationSeconds,
      new Date(r.executedAt).toLocaleString()
    ]);
    this.exporterService.exportToCsv('Execution-Reports-History', headers, rows);
  }

  exportFlakyCsv(): void {
    const headers = ['Scenario Name', 'Feature File', 'Flakiness Rate (%)', 'Total Runs', 'Passed Runs', 'Failed Runs', 'Risk Level', 'Last Error'];
    const rows = this.flakyTests.map(f => [
      f.scenarioName,
      f.featureFile,
      f.flakinessScore,
      f.totalRuns,
      f.passedRuns,
      f.failedRuns,
      f.riskLevel,
      f.lastFailureReason
    ]);
    this.exporterService.exportToCsv('Flaky-Test-Matrix', headers, rows);
  }

  viewDetails(report: ExecutionReport): void {
    this.dialog.open(ReportDetailsDialogComponent, {
      width: '550px',
      data: report
    });
  }
}