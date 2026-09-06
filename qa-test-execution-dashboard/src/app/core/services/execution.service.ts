import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { ReportService } from './report.service';
import { TestExecution, EnvironmentType, ExecutionArtifacts, ExecutionStatus, AccessibilitySummary } from '../models/execution.model';
import { ExecutionLog, ExecutionScenario } from '../models/execution-log.model';

export interface UploadedStepFile {
  name: string;
  content: string;
}

export interface RunTestRequest {
  projectName: string;
  featureName: string;
  featureNames?: string[];
  environment: EnvironmentType;
  mode?: 'workspace' | 'upload';
  featureFileName?: string;
  featureContent?: string;
  stepFileName?: string;
  stepContent?: string;
  stepFiles?: UploadedStepFile[];
  tags?: string;
  retryCount?: number;
  targetUrl?: string;
  browserMode?: 'headless' | 'interactive';
  sessionState?: string;
  enableAccessibilityScan?: boolean;
  enableScreenshots?: boolean;
  enableVideo?: boolean;
  enableTrace?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ExecutionService {

  private socket!: Socket;

  private readonly logsMap = new Map<number, ExecutionLog[]>();
  private readonly scenariosMap = new Map<number, ExecutionScenario[]>();
  private readonly artifactsMap = new Map<number, ExecutionArtifacts>();

  private readonly logsSubject =
    new BehaviorSubject<Map<number, ExecutionLog[]>>(this.logsMap);

  private readonly scenariosSubject =
    new BehaviorSubject<Map<number, ExecutionScenario[]>>(this.scenariosMap);

  private readonly artifactsSubject =
    new BehaviorSubject<Map<number, ExecutionArtifacts>>(this.artifactsMap);

  readonly logsByExecutionId$ = this.logsSubject.asObservable();
  readonly scenariosByExecutionId$ = this.scenariosSubject.asObservable();
  readonly artifactsByExecutionId$ = this.artifactsSubject.asObservable();

  private readonly executionsSubject =
    new BehaviorSubject<TestExecution[]>([]);

  readonly recentExecutions$ = this.executionsSubject.asObservable();

  private readonly liveLogsSubject =
    new BehaviorSubject<ExecutionLog[]>([]);

  readonly liveLogs$ = this.liveLogsSubject.asObservable();

  constructor(private readonly reportService: ReportService) {
    this.initSocketConnection();
  }

  // ================= SOCKET =================

  private initSocketConnection(): void {

    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    /**
     * 🚀 BACKEND EVENT LISTENER
     */

    this.socket.on('execution-event', (data: any) => {

      const executionId = data.executionId;
      if (!executionId) return;

      switch (data.type) {

        case 'feature':
        case 'info':
          this.addLog(executionId, {
            type: 'info',
            message: data.message
          });
          break;

        case 'scenario':
          this.addLog(executionId, {
            type: 'scenario',
            scenarioId: data.scenarioId,
            message: data.message,
            scenario: data.scenario,
          });
          break;

        case 'step':
          this.addLog(executionId, {
            type: 'step',
            scenarioId: data.scenarioId,
            keyword: data.step?.keyword || data.keyword,
            message: data.step?.text || data.message,
            status: data.step?.status || data.status
          });
          break;

        case 'error':
          this.addLog(executionId, {
            type: 'error',
            message: data.message
          });
          break;

        case 'artifact':
          this.addLog(executionId, {
            type: 'artifact',
            message: `Media Artifact generated (${data.artifactType}): ${data.name}`,
            artifactType: data.artifactType,
            url: data.url
          });
          this.addArtifactToExecution(executionId, data.artifactType, data.url);
          break;

        case 'accessibility-report':
          this.addLog(executionId, {
            type: 'info',
            message: `♿ WCAG Accessibility Scan Completed (${data.summary.violationsCount} violations, ${data.summary.passesCount} passed criteria)`
          });
          this.setAccessibilityToExecution(executionId, data.summary);
          break;

        case 'end':
          this.addLog(executionId, {
            type: 'end',
            message: data.message
          });
          const execution = this.executionsSubject.value.find(e => e.id === executionId);
          if (execution) {
            this.finishExecution(executionId, execution, data.status ?? 'Passed');
          }
          break;
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }

  // ================= RUN & CANCEL TEST =================

  runTest(request: RunTestRequest, executionId?: number): number {

    const finalExecutionId = executionId ?? this.generateId();

    const featureLabel = request.featureNames && request.featureNames.length > 0
      ? request.featureNames.join(', ')
      : (request.featureFileName || request.featureName || 'Test Suite');

    const execution: TestExecution = {
      id: finalExecutionId,
      projectName: request.projectName || 'Custom Suite',
      featureName: featureLabel,
      environment: request.environment,
      status: 'Running',
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      tags: request.tags,
      retryCount: request.retryCount || 0,
      artifacts: { screenshots: [], videos: [], traces: [], accessibility: null }
    };

    this.artifactsMap.set(finalExecutionId, { screenshots: [], videos: [], traces: [], accessibility: null });
    this.artifactsSubject.next(new Map(this.artifactsMap));

    this.executionsSubject.next([
      execution,
      ...this.executionsSubject.value
    ].slice(0, 10));

    console.log('[Angular Layer 2 - ExecutionService] Emitting start-execution socket event:', {
      executionId: finalExecutionId,
      browserMode: request.browserMode,
      projectName: request.projectName,
      environment: request.environment
    });

    // 🚀 Trigger backend
    this.socket.emit('start-execution', {
      executionId: finalExecutionId,
      ...request
    });

    return finalExecutionId;
  }

  cancelExecution(executionId: number): void {
    if (this.socket) {
      this.socket.emit('cancel-execution', { executionId });
    }
  }

  private addArtifactToExecution(executionId: number, type: 'screenshot' | 'video' | 'trace', url: string): void {
    const existing = this.artifactsMap.get(executionId) || { screenshots: [], videos: [], traces: [], accessibility: null };

    const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;

    if (type === 'screenshot' && !existing.screenshots.includes(fullUrl)) {
      existing.screenshots.push(fullUrl);
    } else if (type === 'video' && !existing.videos.includes(fullUrl)) {
      existing.videos.push(fullUrl);
    } else if (type === 'trace' && !existing.traces.includes(fullUrl)) {
      existing.traces.push(fullUrl);
    }

    this.artifactsMap.set(executionId, { ...existing });
    this.artifactsSubject.next(new Map(this.artifactsMap));
  }

  private setAccessibilityToExecution(executionId: number, summary: AccessibilitySummary): void {
    const existing = this.artifactsMap.get(executionId) || { screenshots: [], videos: [], traces: [], accessibility: null };
    const updatedArtifacts = {
      ...existing,
      accessibility: {
        ...summary,
        reportUrl: summary.reportUrl ? `http://localhost:3000${summary.reportUrl}` : undefined
      }
    };

    this.artifactsMap.set(executionId, updatedArtifacts);
    this.artifactsSubject.next(new Map(this.artifactsMap));
  }

  // ================= FINISH =================

  private finishExecution(
    executionId: number,
    execution: TestExecution,
    status: ExecutionStatus
  ): void {

    const updatedExecution: TestExecution = {
      ...execution,
      status,
      durationSeconds: Math.floor(Math.random() * 60) + 5
    };

    this.executionsSubject.next(
      this.executionsSubject.value.map(e =>
        e.id === executionId ? updatedExecution : e
      )
    );

    this.reportService.addExecutionReport(updatedExecution);
  }

  // ================= LOG SYSTEM =================

  addLog(executionId: number, log: ExecutionLog): void {

    const existingLogs = this.logsMap.get(executionId) || [];

    const updatedLogs: ExecutionLog[] = [
      ...existingLogs,
      {
        ...log,
        timestamp: log.timestamp || new Date().toLocaleTimeString()
      }
    ];

    this.logsMap.set(executionId, updatedLogs);

    this.logsSubject.next(new Map(this.logsMap));
  }

  // ================= UTIL =================

  clearLogs(): void {
    this.liveLogsSubject.next([]);
  }

  private generateId(): number {
    return Math.max(
      0,
      ...this.executionsSubject.value.map(e => e.id)
    ) + 1;
  }
}