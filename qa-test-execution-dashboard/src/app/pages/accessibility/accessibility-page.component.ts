import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';

import { Subscription } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface AccessibilityNode {
  target: string[];
  html: string;
  failureSummary?: string;
}

export interface AccessibilityRule {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  matchedStandards?: string[];
  nodes: AccessibilityNode[];
}

export interface PassedAudit {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  passedNodesCount: number;
}

export interface ComplianceItem {
  key: string;
  title: string;
  subtitle: string;
  compliant: boolean;
  violationsCount: number;
}

export interface DirectAccessibilityReport {
  scanId: string;
  url: string;
  targetTitle: string;
  scanTime: string;
  standard: string;
  score: number; // 0 - 100
  complianceChecklist?: ComplianceItem[];
  summary: {
    score: number;
    totalViolationsCount: number;
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
    passedAuditsCount: number;
    manualAuditsCount: number;
  };
  criticalIssues: AccessibilityRule[];
  seriousIssues: AccessibilityRule[];
  moderateIssues: AccessibilityRule[];
  minorIssues: AccessibilityRule[];
  passedAudits: PassedAudit[];
  manualAudits: AccessibilityRule[];
  allViolations: AccessibilityRule[];
  reportUrl: string;
}

export interface SavedReportSummary {
  scanId: string;
  url: string;
  targetTitle: string;
  scanTime: string;
  score: number;
  standard: string;
  summary: {
    score: number;
    totalViolationsCount: number;
    criticalCount: number;
    seriousCount: number;
    passedAuditsCount: number;
    manualAuditsCount: number;
  };
  reportUrl: string;
}

export interface WcagChecklistItem {
  principle: 'Perceivable' | 'Operable' | 'Understandable' | 'Robust';
  code: string;
  name: string;
  status: 'Pass' | 'Partial' | 'Fail';
  priority: 'Low' | 'Medium' | 'High';
  level: string;
}

export interface ExecutiveSummaryDetails {
  overallStatus: string;
  description: string;
  strengths: string[];
  priorityAreas: string[];
}

@Component({
  selector: 'app-accessibility-page',
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
    MatChipsModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatTabsModule,
    MatTooltipModule,
    MatTableModule
  ],
  templateUrl: './accessibility-page.component.html',
  styleUrl: './accessibility-page.component.scss'
})
export class AccessibilityPageComponent implements OnInit, OnDestroy {

  readonly form;
  private socket!: Socket;
  private readonly subscription = new Subscription();

  isScanning = false;
  scanProgressMessage = 'Initializing WCAG & Multi-Standard scanner...';
  scanProgressStep = 1;
  scanErrorMessage: string | null = null;

  showAuditEngine = true; // Show audit parameters form when opening page

  activeReport: DirectAccessibilityReport | null = null;
  savedReports: SavedReportSummary[] = [];

  filterSeverity: 'all' | 'critical' | 'serious' | 'moderate' | 'minor' = 'all';

  readonly displayedChecklistColumns = ['principle', 'codeAndName', 'status', 'priority'];

  readonly quickUrls = [
    'https://www.expertflow.com/',
    'https://customer-portal.demo.local',
    'https://google.com'
  ];

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly http: HttpClient
  ) {
    this.form = this.formBuilder.group({
      url: ['https://www.expertflow.com/', [Validators.required, Validators.pattern(/https?:\/\/.+/)]],
      standard: ['wcag21aa', Validators.required],
      browserMode: ['headless', Validators.required],
      standards: this.formBuilder.group({
        wcag: [{ value: true, disabled: true }],
        ada: [true],
        eaa: [true],
        section508: [true],
        aoda: [true]
      })
    });
  }

  ngOnInit(): void {
    this.initSocket();
    this.loadSavedReports();
  }

  private initSocket(): void {
    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      console.log('Connected to backend socket for accessibility:', this.socket.id);
    });

    this.socket.on('a11y-event', (event: any) => {
      if (event.type === 'status') {
        this.isScanning = true;
        this.scanProgressMessage = event.message;
        if (event.step) this.scanProgressStep = event.step;
      } else if (event.type === 'complete') {
        this.isScanning = false;
        this.activeReport = event.report;
        this.loadSavedReports();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (event.type === 'error') {
        this.isScanning = false;
        let errMsg = event.message || 'Scan failed.';
        if (errMsg.includes('ERR_NAME_NOT_RESOLVED')) {
          errMsg = `Domain Resolution Error: Could not resolve target host "${this.form.value.url}" (net::ERR_NAME_NOT_RESOLVED). Please verify the URL spelling or network connection.`;
        } else if (errMsg.includes('ERR_CONNECTION_REFUSED')) {
          errMsg = `Connection Refused: Target server at "${this.form.value.url}" refused connection (net::ERR_CONNECTION_REFUSED).`;
        }
        this.scanErrorMessage = errMsg;
        console.error('Accessibility Scan Error:', event.message);
      }
    });
  }

  setQuickUrl(url: string): void {
    this.form.controls.url.setValue(url);
  }

  runAudit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { url, standard, browserMode } = this.form.getRawValue();
    const standardsValue = this.form.controls.standards.getRawValue();

    console.log('[Angular Layer 1 - WCAG Audit] Triggering audit with payload:', {
      url,
      standard,
      browserMode: browserMode || 'headless'
    });

    this.isScanning = true;
    this.scanProgressStep = 1;
    this.scanProgressMessage = '🚀 Launching browser instance...';
    this.activeReport = null;
    this.scanErrorMessage = null;

    this.socket.emit('start-accessibility-scan', {
      url,
      standard,
      browserMode: browserMode || 'headless',
      standards: {
        wcag: true,
        ada: !!standardsValue.ada,
        eaa: !!standardsValue.eaa,
        section508: !!standardsValue.section508,
        aoda: !!standardsValue.aoda
      },
      scanId: Date.now()
    });
  }

  toggleAuditEngine(): void {
    this.showAuditEngine = !this.showAuditEngine;
  }

  clearActiveReport(): void {
    this.activeReport = null;
    this.showAuditEngine = true;
  }

  loadSavedReports(): void {
    this.http.get<{ success: boolean; reports: SavedReportSummary[] }>('http://localhost:3000/api/accessibility/reports')
      .subscribe({
        next: (res) => {
          if (res.success && res.reports) {
            this.savedReports = res.reports || [];
            // Do NOT auto-load last audit report on page click as requested
          }
        },
        error: (err) => console.error('Failed to load saved reports:', err)
      });
  }

  viewSavedReport(scanId: string): void {
    this.http.get<{ success: boolean; report: DirectAccessibilityReport }>(`http://localhost:3000/api/accessibility/reports/${scanId}`)
      .subscribe({
        next: (res) => {
          if (res.success && res.report) {
            this.activeReport = res.report;
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        },
        error: (err) => console.error('Failed to view saved report:', err)
      });
  }

  setSeverityFilter(sev: 'all' | 'critical' | 'serious' | 'moderate' | 'minor'): void {
    this.filterSeverity = sev;
  }

  getFilteredViolations(): AccessibilityRule[] {
    if (!this.activeReport || !this.activeReport.allViolations) return [];
    if (this.filterSeverity === 'all') return this.activeReport.allViolations;
    return this.activeReport.allViolations.filter(v => v.impact === this.filterSeverity);
  }

  getScoreColorClass(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 50) return 'moderate';
    return 'poor';
  }

  getScoreDashOffset(score: number): number {
    const circumference = 2 * Math.PI * 56; // radius 56 => ~351.86
    return circumference - (score / 100) * circumference;
  }

  getStandardTitle(): string {
    if (!this.activeReport || !this.activeReport.standard) return 'WCAG 2.1 AA';
    const std = this.activeReport.standard.toLowerCase();
    if (std.includes('22')) return 'WCAG 2.2 AA';
    if (std.includes('20') || std === 'wcag2aa') return 'WCAG 2.0 AA';
    return 'WCAG 2.1 AA';
  }

  getStandardBadge(): string {
    if (!this.activeReport || !this.activeReport.standard) return '2.1';
    const std = this.activeReport.standard.toLowerCase();
    if (std.includes('22')) return '2.2';
    if (std.includes('20') || std === 'wcag2aa') return '2.0';
    return '2.1';
  }

  // 📝 EXECUTIVE SUMMARY GENERATOR
  getExecutiveSummary(): ExecutiveSummaryDetails {
    if (!this.activeReport) {
      return {
        overallStatus: 'Partially Compliant',
        description: `This report evaluates the target application against ${this.getStandardTitle()} standards across all four POUR principles — Perceivable, Operable, Understandable, and Robust.`,
        strengths: [],
        priorityAreas: []
      };
    }

    const score = this.activeReport.score;
    let status = 'Partially Compliant';
    if (score >= 90) status = 'Fully Compliant';
    else if (score < 50) status = 'Non-Compliant';

    const violations = this.activeReport.allViolations || [];
    const passedAudits = this.activeReport.passedAudits || [];

    // Dynamically calculate Priority Areas from violations
    const priorityAreas: string[] = [];
    if (violations.some(v => v.id.includes('label') || v.id.includes('input') || v.description.includes('label'))) {
      priorityAreas.push('Form labeling');
    }
    if (violations.some(v => v.id.includes('focus') || v.id.includes('tabindex') || v.id.includes('keyboard'))) {
      priorityAreas.push('Focus management');
    }
    if (violations.some(v => v.id.includes('alt') || v.id.includes('image'))) {
      priorityAreas.push('Alt text');
    }
    if (violations.some(v => v.id.includes('contrast') || v.id.includes('color'))) {
      priorityAreas.push('Contrast');
    }
    if (violations.some(v => v.id.includes('aria') || v.id.includes('role'))) {
      priorityAreas.push('ARIA attributes & roles');
    }

    // Dynamically calculate Strengths strictly from verified passedAudits
    const strengths: string[] = [];

    const hasPassedKeyboard = passedAudits.some(p => p.id.includes('keyboard') || p.id.includes('tabindex') || p.id.includes('focus'));
    const hasPassedAria = passedAudits.some(p => p.id.startsWith('aria-') || p.id.includes('role') || (p.help && p.help.toLowerCase().includes('aria')));
    const hasPassedLang = passedAudits.some(p => p.id.includes('lang') || p.id.includes('html-has-lang'));
    const hasPassedStructure = passedAudits.some(p => p.id.includes('landmark') || p.id.includes('heading') || p.id.includes('region'));
    const hasPassedContrast = passedAudits.some(p => p.id.includes('contrast') || p.id.includes('color'));
    const hasPassedTitle = passedAudits.some(p => p.id.includes('title') || p.id.includes('document-title'));
    const hasPassedViewport = passedAudits.some(p => p.id.includes('viewport') || p.id.includes('zoom'));

    if (hasPassedKeyboard) strengths.push('Keyboard navigation');
    if (hasPassedAria) strengths.push('ARIA implementation');
    if (hasPassedLang) strengths.push('Language & locale tagging');
    if (hasPassedStructure) strengths.push('Semantic HTML & Landmarks');
    if (hasPassedContrast) strengths.push('Color contrast standards');
    if (hasPassedTitle) strengths.push('Document title structure');
    if (hasPassedViewport) strengths.push('Responsive viewport zooming');

    // If specific categories above weren't matched, extract readable tags directly from top passedAudits rules
    if (strengths.length === 0 && passedAudits.length > 0) {
      passedAudits.slice(0, 4).forEach(p => {
        if (p.help) strengths.push(p.help);
      });
    }

    return {
      overallStatus: status,
      description: `This report evaluates ${this.activeReport.targetTitle || 'the application'} against ${this.getStandardTitle()} standards across all four POUR principles — Perceivable, Operable, Understandable, and Robust. The product demonstrates ${score >= 75 ? 'strong' : 'foundational'} accessibility with verified passed audits and identified remediation areas.`,
      strengths,
      priorityAreas
    };
  }

  // 📋 WCAG SUCCESS CRITERIA CHECKLIST DATA (100% DYNAMIC - ONLY SHOWS CHECKED CRITERIA)
  getWcagChecklist(): WcagChecklistItem[] {
    const violations = this.activeReport?.allViolations || [];
    const passedAudits = this.activeReport?.passedAudits || [];
    const manualAudits = this.activeReport?.manualAudits || [];

    const isEvaluated = (code: string, keywords: string[]): boolean => {
      const cleanCodeTag = 'wcag' + code.replace(/\./g, '');
      const checkInList = (list: any[]) => list.some(item => {
        const tags = item.tags || [];
        const id = item.id || '';
        const help = item.help || '';
        const desc = item.description || '';
        return tags.some((t: string) => t.toLowerCase() === cleanCodeTag || t.toLowerCase() === `wcag${code}`) ||
               keywords.some(kw => id.toLowerCase().includes(kw) || help.toLowerCase().includes(kw) || desc.toLowerCase().includes(kw));
      });

      return checkInList(violations) || checkInList(passedAudits) || checkInList(manualAudits);
    };

    const getCriterionState = (code: string, keywords: string[], defaultPriority: 'Low' | 'Medium' | 'High' = 'Low'): { status: 'Pass' | 'Partial' | 'Fail'; priority: 'Low' | 'Medium' | 'High' } => {
      const cleanCodeTag = 'wcag' + code.replace(/\./g, '');

      // Search for matching violation
      const matchedViolation = violations.find(v => {
        const tags = v.tags || [];
        const hasTag = tags.some(t => t.toLowerCase() === cleanCodeTag || t.toLowerCase() === `wcag${code}`);
        const hasKw = keywords.some(kw => v.id.toLowerCase().includes(kw) || v.description.toLowerCase().includes(kw));
        return hasTag || hasKw;
      });

      if (matchedViolation) {
        let status: 'Pass' | 'Partial' | 'Fail' = 'Partial';
        if (matchedViolation.impact === 'critical') status = 'Fail';

        let priority: 'Low' | 'Medium' | 'High' = defaultPriority;
        if (matchedViolation.impact === 'critical' || matchedViolation.impact === 'serious') {
          priority = 'High';
        } else if (matchedViolation.impact === 'moderate') {
          priority = 'Medium';
        }
        return { status, priority };
      }

      return { status: 'Pass', priority: 'Low' };
    };

    const allCriteriaConfig: { principle: 'Perceivable' | 'Operable' | 'Understandable' | 'Robust'; code: string; name: string; keywords: string[]; level: string }[] = [
      // Perceivable
      { principle: 'Perceivable', code: '1.1.1', name: 'Non-text Content', keywords: ['image', 'alt', 'area-alt'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.2.1', name: 'Audio-only / Video-only (Prerecorded)', keywords: ['audio', 'video'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.2.2', name: 'Captions (Prerecorded)', keywords: ['caption', 'video-caption'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.2.3', name: 'Audio Description or Media Alternative', keywords: ['audio-description'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.3.1', name: 'Info and Relationships', keywords: ['heading', 'structure', 'definition-list', 'dlitem', 'list', 'listitem'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.3.2', name: 'Meaningful Sequence', keywords: ['sequence', 'order'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.3.3', name: 'Sensory Characteristics', keywords: ['sensory', 'sound'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.4.1', name: 'Use of Color', keywords: ['color', 'link-in-text-block'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.4.2', name: 'Audio Control', keywords: ['audio-control'], level: 'Level A' },
      { principle: 'Perceivable', code: '1.4.3', name: 'Contrast (Minimum)', keywords: ['color-contrast', 'contrast'], level: 'Level AA' },
      { principle: 'Perceivable', code: '1.4.4', name: 'Resize Text', keywords: ['meta-viewport', 'zoom'], level: 'Level AA' },
      { principle: 'Perceivable', code: '1.4.5', name: 'Images of Text', keywords: ['image-of-text'], level: 'Level AA' },

      // Operable
      { principle: 'Operable', code: '2.1.1', name: 'Keyboard', keywords: ['keyboard', 'accesskeys', 'tabindex'], level: 'Level A' },
      { principle: 'Operable', code: '2.1.2', name: 'No Keyboard Trap', keywords: ['keyboard-trap', 'trap'], level: 'Level A' },
      { principle: 'Operable', code: '2.1.4', name: 'Character Key Shortcuts', keywords: ['shortcut', 'key'], level: 'Level A' },
      { principle: 'Operable', code: '2.2.1', name: 'Timing Adjustable', keywords: ['meta-refresh', 'timeout'], level: 'Level A' },
      { principle: 'Operable', code: '2.2.2', name: 'Pause, Stop, Hide', keywords: ['blink', 'marquee', 'pause'], level: 'Level A' },
      { principle: 'Operable', code: '2.3.1', name: 'Three Flashes or Below Threshold', keywords: ['flash', 'flicker'], level: 'Level A' },
      { principle: 'Operable', code: '2.4.1', name: 'Bypass Blocks', keywords: ['bypass', 'skip-link', 'frame-title', 'landmark'], level: 'Level A' },
      { principle: 'Operable', code: '2.4.2', name: 'Page Titled', keywords: ['document-title', 'title'], level: 'Level A' },
      { principle: 'Operable', code: '2.4.3', name: 'Focus Order', keywords: ['focus-order', 'tabindex'], level: 'Level A' },
      { principle: 'Operable', code: '2.4.4', name: 'Link Purpose (In Context)', keywords: ['link-name', 'link-purpose'], level: 'Level A' },
      { principle: 'Operable', code: '2.4.5', name: 'Multiple Ways', keywords: ['sitemap', 'search'], level: 'Level AA' },
      { principle: 'Operable', code: '2.4.6', name: 'Headings and Labels', keywords: ['heading-order', 'label'], level: 'Level AA' },
      { principle: 'Operable', code: '2.4.7', name: 'Focus Visible', keywords: ['focus-visible', 'outline'], level: 'Level AA' },

      // Understandable
      { principle: 'Understandable', code: '3.1.1', name: 'Language of Page', keywords: ['html-has-lang', 'html-lang-valid'], level: 'Level A' },
      { principle: 'Understandable', code: '3.1.2', name: 'Language of Parts', keywords: ['valid-lang'], level: 'Level AA' },
      { principle: 'Understandable', code: '3.2.1', name: 'On Focus', keywords: ['on-focus'], level: 'Level A' },
      { principle: 'Understandable', code: '3.2.2', name: 'On Input', keywords: ['on-input'], level: 'Level A' },
      { principle: 'Understandable', code: '3.2.3', name: 'Consistent Navigation', keywords: ['navigation'], level: 'Level AA' },
      { principle: 'Understandable', code: '3.2.4', name: 'Consistent Identification', keywords: ['identification'], level: 'Level AA' },
      { principle: 'Understandable', code: '3.3.1', name: 'Error Identification', keywords: ['error-id'], level: 'Level A' },
      { principle: 'Understandable', code: '3.3.2', name: 'Labels or Instructions', keywords: ['label', 'form-field-multiple-labels', 'input-button-name'], level: 'Level A' },
      { principle: 'Understandable', code: '3.3.3', name: 'Error Suggestion', keywords: ['error-suggestion'], level: 'Level AA' },
      { principle: 'Understandable', code: '3.3.4', name: 'Error Prevention (Legal, Financial, Data)', keywords: ['error-prevention'], level: 'Level AA' },

      // Robust
      { principle: 'Robust', code: '4.1.1', name: 'Parsing', keywords: ['duplicate-id', 'duplicate-id-active'], level: 'Level A' },
      { principle: 'Robust', code: '4.1.2', name: 'Name, Role, Value', keywords: ['aria-', 'button-name', 'name', 'role', 'svg-img-alt'], level: 'Level A' },
      { principle: 'Robust', code: '4.1.3', name: 'Status Messages', keywords: ['aria-live', 'status-messages'], level: 'Level AA' }
    ];

    // Filter ONLY items that were actually evaluated during the audit scan!
    const evaluatedConfigs = allCriteriaConfig.filter(c => isEvaluated(c.code, c.keywords));

    return evaluatedConfigs.map(c => ({
      principle: c.principle,
      code: c.code,
      name: c.name,
      level: c.level,
      ...getCriterionState(c.code, c.keywords)
    }));
  }

  // 📥 DOWNLOAD EXECUTIVE & CHECKLIST REPORT
  downloadExecutiveReport(): void {
    if (!this.activeReport) return;

    const summary = this.getExecutiveSummary();
    const checklist = this.getWcagChecklist();

    const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Executive WCAG 2.1 AA Compliance Report - ${this.activeReport.targetTitle}</title>
        <style>
          body { font-family: 'Inter', system-ui, sans-serif; color: #0f172a; line-height: 1.6; padding: 2rem; max-width: 900px; margin: 0 auto; }
          h1 { font-size: 2rem; color: #1e293b; margin-bottom: 0.25rem; }
          .subtitle { color: #64748b; font-size: 1rem; margin-bottom: 1.5rem; }
          .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 12px; margin-bottom: 2rem; }
          .badge { display: inline-block; padding: 0.3rem 0.8rem; border-radius: 99px; font-weight: 700; font-size: 0.85rem; }
          .badge.pass { background: #d1fae5; color: #065f46; }
          .badge.partial { background: #fef3c7; color: #92400e; }
          .box { padding: 1rem 1.25rem; border-radius: 10px; margin-bottom: 1rem; font-weight: 500; }
          .box.strength { background: #ecfdf5; border-left: 4px solid #10b981; color: #065f46; }
          .box.priority { background: #fffbeb; border-left: 4px solid #f59e0b; color: #92400e; }
          table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
          th { background: #f1f5f9; text-align: left; padding: 0.75rem 1rem; font-size: 0.8rem; text-transform: uppercase; }
          td { padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <h1>WCAG 2.1 Compliance Report</h1>
        <div class="subtitle">${this.activeReport.targetTitle} — ${this.activeReport.url}</div>
        
        <div class="meta-box">
          <div><b>Compliance Score:</b> ${this.activeReport.score}/100</div>
          <div><b>Overall Status:</b> <span class="badge partial">${summary.overallStatus}</span></div>
          <div><b>Audited Date:</b> ${new Date(this.activeReport.scanTime).toLocaleString()}</div>
        </div>

        <h2>Executive Summary</h2>
        <p>${summary.description}</p>
        
        <div class="box strength">
          ✓ <b>Strengths:</b> ${summary.strengths.join(' · ')}
        </div>
        
        ${summary.priorityAreas && summary.priorityAreas.length > 0 ? `
        <div class="box priority">
          ⚠ <b>Priority Areas:</b> ${summary.priorityAreas.join(' · ')}
        </div>
        ` : ''}

        <h2>WCAG 2.1 AA Success Criteria Checklist</h2>
        <table>
          <thead>
            <tr>
              <th>Principle</th>
              <th>Success Criteria</th>
              <th>Status</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            ${checklist.map(c => `
              <tr>
                <td><b>${c.principle}</b></td>
                <td><code>${c.code}</code> ${c.name}</td>
                <td>${c.status === 'Pass' ? '✓ Pass' : '⚠ Partial'}</td>
                <td>${c.priority}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WCAG-Executive-Report-${this.activeReport.scanId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
