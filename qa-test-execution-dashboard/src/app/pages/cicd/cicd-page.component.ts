import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface WebhookTelemetryItem {
  id: string;
  source: string;
  sourceOrigin: string;
  event: string;
  triggerType: string;
  payloadSummary: string;
  commitSha?: string;
  branch?: string;
  prNumber?: string;
  pipelineUrl?: string;
  repository?: string;
  triggerUser?: string;
  status: 'SUCCESS' | 'RUNNING' | 'FAILED';
  timestamp: string;
  durationMs: number;
  clientIp: string;
}

export interface ApiKeyItem {
  key: string;
  maskedKey: string;
  createdAt: string;
}

@Component({
  selector: 'app-cicd-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTableModule,
    MatChipsModule,
    MatTabsModule,
    MatTooltipModule
  ],
  templateUrl: './cicd-page.component.html',
  styleUrl: './cicd-page.component.scss'
})
export class CicdPageComponent implements OnInit {

  webhookForm: FormGroup;
  notificationForm: FormGroup;
  
  webhookHistory: WebhookTelemetryItem[] = [];
  filteredHistory: WebhookTelemetryItem[] = [];
  activeApiKeys: ApiKeyItem[] = [];
  
  selectedOriginFilter = 'ALL';
  isLoadingHistory = false;
  isTriggering = false;
  isSendingAlert = false;
  copyStatusMessage = '';

  readonly displayedColumns: string[] = [
    'id',
    'sourceOrigin',
    'gitContext',
    'payloadSummary',
    'status',
    'durationMs',
    'timestamp'
  ];

  constructor(
    private fb: FormBuilder,
    private http: HttpClient
  ) {
    this.webhookForm = this.fb.group({
      triggerType: ['TEST_EXECUTION', Validators.required],
      feature: ['features/login.feature'],
      tags: ['@smoke'],
      targetUrl: ['https://staging.app.internal'],
      environment: ['staging'],
      wcagStandard: ['WCAG2AA'],
      branch: ['main'],
      commitSha: ['a89c7d4'],
      prNumber: ['42']
    });

    this.notificationForm = this.fb.group({
      slackWebhookUrl: ['https://hooks.slack.com/services/T00/B00/XXXX']
    });
  }

  ngOnInit(): void {
    this.loadWebhookHistory();
    this.loadApiKeys();
  }

  loadWebhookHistory(): void {
    this.isLoadingHistory = true;
    this.http.get<{ success: boolean; history: WebhookTelemetryItem[] }>('http://localhost:3000/api/webhooks/history')
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.webhookHistory = res.history;
            this.applyOriginFilter();
          }
          this.isLoadingHistory = false;
        },
        error: () => {
          this.isLoadingHistory = false;
        }
      });
  }

  loadApiKeys(): void {
    this.http.get<{ success: boolean; activeKeys: ApiKeyItem[] }>('http://localhost:3000/api/v1/auth/keys')
      .subscribe({
        next: (res) => {
          if (res.success) this.activeApiKeys = res.activeKeys;
        },
        error: () => {
          this.activeApiKeys = [
            { key: 'qa_sec_default_token', maskedKey: 'qa_sec_def...oken', createdAt: '2026-08-01' }
          ];
        }
      });
  }

  generateNewApiKey(): void {
    this.http.post<{ success: boolean; apiKey: string }>('http://localhost:3000/api/v1/auth/keys', {})
      .subscribe({
        next: () => this.loadApiKeys(),
        error: () => {}
      });
  }

  applyOriginFilter(): void {
    if (this.selectedOriginFilter === 'ALL') {
      this.filteredHistory = [...this.webhookHistory];
    } else {
      this.filteredHistory = this.webhookHistory.filter(
        item => item.sourceOrigin?.toLowerCase() === this.selectedOriginFilter.toLowerCase()
      );
    }
  }

  onFilterChange(origin: string): void {
    this.selectedOriginFilter = origin;
    this.applyOriginFilter();
  }

  get generatedCurlCommand(): string {
    const val = this.webhookForm.value;
    if (val.triggerType === 'TEST_EXECUTION') {
      return `curl -X POST http://localhost:3000/api/webhooks/trigger-test \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: qa_sec_default_token" \\
  -d '{
    "feature": "${val.feature}",
    "tags": "${val.tags}",
    "environment": "${val.environment}",
    "branch": "${val.branch}",
    "commitSha": "${val.commitSha}"
  }'`;
    } else {
      return `curl -X POST http://localhost:3000/api/webhooks/trigger-scan \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: qa_sec_default_token" \\
  -d '{
    "url": "${val.targetUrl}",
    "standard": "${val.wcagStandard}",
    "branch": "${val.branch}"
  }'`;
    }
  }

  get generatedCliCommand(): string {
    const val = this.webhookForm.value;
    if (val.triggerType === 'TEST_EXECUTION') {
      return `npx qa-platform run --feature ${val.feature} --tags ${val.tags} --env ${val.environment} --key qa_sec_default_token`;
    } else {
      return `npx qa-platform scan --url ${val.targetUrl} --standard ${val.wcagStandard} --key qa_sec_default_token`;
    }
  }

  get generatedGithubActionsStep(): string {
    return `- name: Execute QA Telemetry Webhook
  run: |
    ${this.generatedCurlCommand}`;
  }

  executeWebhookNow(): void {
    const val = this.webhookForm.value;
    this.isTriggering = true;

    const endpoint = val.triggerType === 'TEST_EXECUTION'
      ? 'http://localhost:3000/api/webhooks/trigger-test'
      : 'http://localhost:3000/api/webhooks/trigger-scan';

    const body = val.triggerType === 'TEST_EXECUTION'
      ? {
          feature: val.feature,
          tags: val.tags,
          environment: val.environment,
          branch: val.branch,
          commitSha: val.commitSha,
          prNumber: val.prNumber,
          sourceOrigin: 'Dashboard UI'
        }
      : {
          url: val.targetUrl,
          standard: val.wcagStandard,
          branch: val.branch,
          commitSha: val.commitSha,
          sourceOrigin: 'Dashboard UI'
        };

    this.http.post(endpoint, body).subscribe({
      next: () => {
        this.isTriggering = false;
        this.loadWebhookHistory();
      },
      error: () => {
        this.isTriggering = false;
        this.loadWebhookHistory();
      }
    });
  }

  sendTestNotificationAlert(): void {
    this.isSendingAlert = true;
    this.http.post('http://localhost:3000/api/v1/notifications/test-alert', {}).subscribe({
      next: () => {
        this.isSendingAlert = false;
        this.copyStatusMessage = 'Slack / Teams Test Alert Sent!';
        setTimeout(() => this.copyStatusMessage = '', 3000);
      },
      error: () => { this.isSendingAlert = false; }
    });
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard.writeText(text);
    this.copyStatusMessage = `Copied ${label} to clipboard!`;
    setTimeout(() => this.copyStatusMessage = '', 3000);
  }
}
