import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface CodeLocation {
  file: string;
  line: number;
  method: string;
}

export interface CategorizedRecommendations {
  developerActions: string[];
  qaActions: string[];
  infrastructureActions: string[];
}

export interface EvidenceBreakdown {
  available: string[];
  missing: string[];
  justification: string;
}

export interface FailureAnalysisReport {
  executionId: number;
  status: string;
  analysisSource: string;
  schemaVersion: string;
  ruleEngineVersion: string;
  createdAt: string;
  durationMs: number;
  confidence: number;
  evidenceStrengthScore: number;
  failureCategory: string;
  issueOrigin: 'APPLICATION_BUG' | 'TEST_SCRIPT_ISSUE' | 'ENVIRONMENT_ISSUE' | 'NETWORK_ISSUE' | 'CONFIGURATION_ISSUE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  matchedRuleId: string;
  affectedStep: string;
  scenarioName?: string;
  featureFile?: string;
  exceptionType?: string;
  codeLocation: CodeLocation;
  rootCauseSummary: string;
  observedFailure?: string;
  isRootCauseConfirmed?: boolean;
  causeLabel?: string;
  failedLocator?: string | null;
  failedAssertion?: string | null;
  evidenceBreakdown?: EvidenceBreakdown;
  observedFacts: string[];
  technicalInference: string;
  possibleCauses: string[];
  categorizedRecommendations: CategorizedRecommendations;
  timingMetrics?: {
    evidenceCollectionMs?: number;
    ruleExecutionMs?: number;
    totalDurationMs?: number;
  };
}

@Component({
  selector: 'app-ai-failure-card',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule
  ],
  templateUrl: './ai-failure-card.component.html',
  styleUrl: './ai-failure-card.component.scss'
})
export class AiFailureCardComponent implements OnInit {

  @Input({ required: true }) executionId!: string | number;
  @Input() failureLogs: any[] = [];
  @Input() failureReason = '';

  analysis: FailureAnalysisReport | null = null;
  isAnalyzing = false;
  copyToastMessage = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.executionId) {
      this.loadAnalysis();
    }
  }

  loadAnalysis(force = false): void {
    this.isAnalyzing = true;

    if (!force) {
      this.http.get<{ success: boolean; analysis: FailureAnalysisReport }>(
        `http://localhost:3000/api/executions/${this.executionId}/analysis`
      ).subscribe({
        next: (res) => {
          if (res.success && res.analysis) {
            this.analysis = res.analysis;
            this.isAnalyzing = false;
          } else {
            this.requestFreshAnalysis();
          }
        },
        error: () => this.requestFreshAnalysis()
      });
    } else {
      this.requestFreshAnalysis(true);
    }
  }

  private requestFreshAnalysis(force = false): void {
    const url = `http://localhost:3000/api/executions/${this.executionId}/analyze${force ? '?force=true' : ''}`;
    this.http.post<{ success: boolean; analysis: FailureAnalysisReport }>(url, {
      logs: this.failureLogs,
      failureReason: this.failureReason
    }).subscribe({
      next: (res) => {
        if (res.success && res.analysis) {
          this.analysis = res.analysis;
        }
        this.isAnalyzing = false;
      },
      error: () => {
        this.isAnalyzing = false;
      }
    });
  }

  reanalyzeWithAi(): void {
    this.loadAnalysis(true);
  }

  copyMarkdownAnalysis(): void {
    if (!this.analysis) return;
    const causeHeader = this.analysis.causeLabel || (this.analysis.isRootCauseConfirmed ? 'Confirmed Root Cause' : 'Observed Failure');
    const causeText = this.analysis.observedFailure || this.analysis.rootCauseSummary;
    const scenarioSnippet = this.analysis.scenarioName ? `\n**Scenario**: ${this.analysis.scenarioName}` : '';
    const exceptionSnippet = this.analysis.exceptionType ? `\n**Exception**: \`${this.analysis.exceptionType}\`` : '';
    const locatorSnippet = this.analysis.failedLocator ? `\n**Target Locator**: \`${this.analysis.failedLocator}\`` : '';
    const assertionSnippet = this.analysis.failedAssertion ? `\n**Failed Assertion**: \`${this.analysis.failedAssertion}\`` : '';

    const md = `### 🤖 Evidence-Based Failure Diagnosis (Execution #${this.analysis.executionId})
**Confidence**: ${this.analysis.confidence}% | **Evidence Strength**: ${this.analysis.evidenceStrengthScore}/100
**Origin**: ${this.analysis.issueOrigin} | **Rule ID**: ${this.analysis.matchedRuleId}${scenarioSnippet}${exceptionSnippet}
**Code Location**: ${this.analysis.codeLocation.file}:${this.analysis.codeLocation.line} (${this.analysis.codeLocation.method})${locatorSnippet}${assertionSnippet}

#### ${causeHeader}
> ${causeText}

#### 📋 Observed Facts
${this.analysis.observedFacts.map(f => `- ${f}`).join('\n')}

#### 💡 Technical Inference
${this.analysis.technicalInference}

#### 🛠️ Developer Recommendations
${(this.analysis.categorizedRecommendations?.developerActions || []).map(a => `- ${a}`).join('\n')}

#### 🧪 QA Recommendations
${(this.analysis.categorizedRecommendations?.qaActions || []).map(a => `- ${a}`).join('\n')}
`;
    navigator.clipboard.writeText(md);
    this.copyToastMessage = 'Copied Diagnosis Markdown!';
    setTimeout(() => this.copyToastMessage = '', 3000);
  }
}
