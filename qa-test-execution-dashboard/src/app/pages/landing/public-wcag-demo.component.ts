import { environment } from '../../../environments/environment';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface ViolationNode {
  target?: string[];
  html?: string;
  failureSummary?: string;
}

export interface WcagViolationItem {
  id: string;
  impact?: string;
  help?: string;
  description?: string;
  helpUrl?: string;
  nodes?: ViolationNode[];
}

export interface PublicWcagReport {
  score: number;
  url: string;
  targetTitle?: string;
  scanTime?: string;
  summary?: {
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
    totalViolations: number;
    passedAuditsCount: number;
  };
  criticalIssues?: WcagViolationItem[];
  seriousIssues?: WcagViolationItem[];
  moderateIssues?: WcagViolationItem[];
  minorIssues?: WcagViolationItem[];
  allViolations?: WcagViolationItem[];
  violations?: WcagViolationItem[];
  passedAudits?: { id: string; help?: string; passedNodesCount?: number }[];
  complianceChecklist?: {
    standard: string;
    title: string;
    compliant: boolean;
    violationsCount: number;
  }[];
}

@Component({
  selector: 'app-public-wcag-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './public-wcag-demo.component.html',
  styleUrl: './public-wcag-demo.component.scss'
})
export class PublicWcagDemoComponent {
  targetUrl = '';
  isScanning = false;
  scanResult: PublicWcagReport | null = null;
  errorMessage = '';

  constructor(private http: HttpClient) {}

  setSampleUrl(url: string): void {
    this.targetUrl = url;
    this.errorMessage = '';
  }

  runPublicScan(): void {
    if (!this.targetUrl) return;
    this.isScanning = true;
    this.scanResult = null;
    this.errorMessage = '';

    this.http.post<any>(`${environment.apiUrl}/api/public/wcag-scan`, { url: this.targetUrl }).subscribe({
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
