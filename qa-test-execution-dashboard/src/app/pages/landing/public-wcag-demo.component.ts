import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface ViolationNode {
  target?: string[];
  html?: string;
  failureSummary?: string;
}

export interface ViolationItem {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl?: string;
  tags?: string[];
  nodes?: ViolationNode[];
}

export interface ComplianceChecklistItem {
  key: string;
  title: string;
  subtitle: string;
  compliant: boolean;
  violationsCount: number;
}

export interface PassedAuditItem {
  id: string;
  description?: string;
  help?: string;
  helpUrl?: string;
  passedNodesCount?: number;
}

export interface PublicWcagReport {
  scanId?: string;
  url?: string;
  targetTitle?: string;
  scanTime?: string;
  score: number;
  summary?: {
    score?: number;
    totalViolationsCount?: number;
    criticalCount?: number;
    seriousCount?: number;
    moderateCount?: number;
    minorCount?: number;
    passedAuditsCount?: number;
  };
  complianceChecklist?: ComplianceChecklistItem[];
  allViolations?: ViolationItem[];
  violations?: ViolationItem[];
  criticalIssues?: ViolationItem[];
  seriousIssues?: ViolationItem[];
  moderateIssues?: ViolationItem[];
  minorIssues?: ViolationItem[];
  passedAudits?: PassedAuditItem[];
}

@Component({
  selector: 'app-public-wcag-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './public-wcag-demo.component.html',
  styleUrl: './public-wcag-demo.component.scss'
})
export class PublicWcagDemoComponent {
  targetUrl = 'https://expertflow.com';
  isScanning = false;
  scanResult: PublicWcagReport | null = null;
  errorMessage = '';

  constructor(private http: HttpClient) {}

  runPublicScan(): void {
    if (!this.targetUrl) return;
    this.isScanning = true;
    this.scanResult = null;
    this.errorMessage = '';

    this.http.post<any>('http://localhost:3000/api/public/wcag-scan', { url: this.targetUrl }).subscribe({
      next: (res) => {
        this.isScanning = false;
        if (res.success && res.report) {
          this.scanResult = res.report as PublicWcagReport;
        } else {
          this.errorMessage = res.message || 'Public accessibility scan failed.';
        }
      },
      error: (err) => {
        this.isScanning = false;
        this.errorMessage = err.error?.message || 'Failed to complete public scan. Please check the URL.';
      }
    });
  }
}
