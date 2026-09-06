import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { map, Observable, Subscription, tap } from 'rxjs';
import { ExecutionService } from '../../core/services/execution.service';
import { TestExecution } from '../../core/models/execution.model';
import { ExecutionLog } from '../../core/models/execution-log.model';
import { AiFailureCardComponent } from '../../shared/components/ai-failure-card/ai-failure-card.component';

export interface ArtifactsResponse {
  screenshots: string[];
  videos: string[];
  traces: string[];
  accessibility: any;
}

@Component({
  selector: 'app-execution-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    AiFailureCardComponent
  ],
  templateUrl: './execution-detail.component.html',
  styleUrl: './execution-detail.component.scss'
})
export class ExecutionDetailComponent implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('detailLogsContainer') detailLogsContainer?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private executionService = inject(ExecutionService);
  private http = inject(HttpClient);
  private readonly subscription = new Subscription();

  executionIdStr = '1';
  executionIdNum = 1;

  artifacts: ArtifactsResponse = {
    screenshots: [],
    videos: [],
    traces: [],
    accessibility: null
  };

  isCancelling = false;
  cancelMessage = '';
  private shouldAutoScroll = true;

  execution$!: Observable<TestExecution | undefined>;
  logs$!: Observable<ExecutionLog[]>;

  ngOnInit(): void {
    this.subscription.add(
      this.route.paramMap.subscribe(params => {
        const idStr = params.get('id');
        if (idStr) {
          this.executionIdStr = idStr;
          this.executionIdNum = Number(idStr);

          this.setupStreams();
          this.loadUnifiedArtifacts();
          this.subscribeToLiveArtifacts();
        }
      })
    );
  }

  private setupStreams(): void {
    this.execution$ = this.executionService.recentExecutions$.pipe(
      map(list => list.find(e => String(e.id) === this.executionIdStr || e.id === this.executionIdNum))
    );

    this.logs$ = this.executionService.logsByExecutionId$.pipe(
      map(map => map.get(this.executionIdNum) ?? []),
      tap(() => {
        this.shouldAutoScroll = true;
      })
    );
  }

  private subscribeToLiveArtifacts(): void {
    this.subscription.add(
      this.executionService.artifactsByExecutionId$.subscribe(map => {
        const liveArtifacts = map.get(this.executionIdNum);
        if (liveArtifacts) {
          this.artifacts = {
            screenshots: Array.from(new Set([...this.artifacts.screenshots, ...(liveArtifacts.screenshots || [])])),
            videos: Array.from(new Set([...this.artifacts.videos, ...(liveArtifacts.videos || [])])),
            traces: Array.from(new Set([...this.artifacts.traces, ...(liveArtifacts.traces || [])])),
            accessibility: liveArtifacts.accessibility || this.artifacts.accessibility
          };
        }
      })
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll && this.detailLogsContainer) {
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.detailLogsContainer) {
        const el = this.detailLogsContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    } catch (err) {}
  }

  onLogsScroll(): void {
    if (this.detailLogsContainer) {
      const el = this.detailLogsContainer.nativeElement;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      this.shouldAutoScroll = atBottom;
    }
  }

  loadUnifiedArtifacts(): void {
    this.http.get<{ success: boolean; artifacts: ArtifactsResponse }>(
      `http://localhost:3000/api/executions/${this.executionIdStr}/artifacts`
    ).subscribe({
      next: (res) => {
        if (res.success && res.artifacts) {
          this.artifacts = {
            screenshots: Array.from(new Set([...this.artifacts.screenshots, ...(res.artifacts.screenshots || [])])),
            videos: Array.from(new Set([...this.artifacts.videos, ...(res.artifacts.videos || [])])),
            traces: Array.from(new Set([...this.artifacts.traces, ...(res.artifacts.traces || [])])),
            accessibility: res.artifacts.accessibility || this.artifacts.accessibility
          };
        }
      },
      error: () => {
        // Fallback for non-existent historical artifacts
      }
    });
  }

  cancelExecution(): void {
    this.isCancelling = true;
    this.http.post(`http://localhost:3000/api/executions/${this.executionIdStr}/cancel`, {})
      .subscribe({
        next: () => {
          this.isCancelling = false;
          this.cancelMessage = 'Execution cancelled successfully.';
        },
        error: () => {
          this.isCancelling = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}