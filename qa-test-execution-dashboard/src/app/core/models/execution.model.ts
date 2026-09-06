export type EnvironmentType = 'QA' | 'Staging' | 'Prod';

export type ExecutionStatus = 'Passed' | 'Failed' | 'Running' | 'Skipped' | 'Cancelled';

export interface AccessibilityViolationNode {
  target: string[];
  html: string;
  failureSummary?: string;
}

export interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AccessibilityViolationNode[];
}

export interface AccessibilitySummary {
  scanTime: string;
  url: string;
  passesCount: number;
  violationsCount: number;
  incompleteCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  violations: AccessibilityViolation[];
  reportUrl?: string;
}

export interface ExecutionArtifacts {
  screenshots: string[];
  videos: string[];
  traces: string[];
  accessibility?: AccessibilitySummary | null;
  htmlReport?: string;
}

export interface TestExecution {
  id: number;
  projectName: string;
  featureName: string;
  environment: EnvironmentType;
  status: ExecutionStatus;
  durationSeconds: number;
  startedAt: string;
  failureReason?: string;
  totalScenarios?: number;
  passedScenarios?: number;
  failedScenarios?: number;
  tags?: string;
  retryCount?: number;
  artifacts?: ExecutionArtifacts;
}

export type LogType =
  | 'info'
  | 'error'
  | 'end'
  | 'step'
  | 'scenario'
  | 'artifact';

export type StepStatus =
  | 'passed'
  | 'failed'
  | 'running'
  | 'skipped';

export type StepKeyword =
  | 'Given'
  | 'When'
  | 'Then'
  | 'And';

export interface ExecutionStep {
  keyword: StepKeyword;
  text: string;
  status: StepStatus;
}

export interface ExecutionScenario {
  id: number;
  title: string;
  status: 'Passed' | 'Failed' | 'Running';
  expanded: boolean;
  steps: ExecutionStep[];
}

export interface ExecutionLog {
  type: LogType;
  message: string;
  timestamp?: string;

  // step metadata
  keyword?: StepKeyword;
  status?: StepStatus;

  // tree metadata
  scenario?: string;
  scenarioId?: number;

  // artifact metadata
  artifactType?: 'screenshot' | 'video' | 'trace';
  url?: string;
}