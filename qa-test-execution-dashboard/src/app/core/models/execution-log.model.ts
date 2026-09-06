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

/**
 * ==========================
 * STEP MODEL
 * ==========================
 */
export interface ExecutionStep {
  keyword: StepKeyword;
  text: string;
  status: StepStatus;
}

/**
 * ==========================
 * SCENARIO MODEL (TREE NODE)
 * ==========================
 */
export interface ExecutionScenario {
  id: number;
  title: string;
  status: 'Passed' | 'Failed' | 'Running';
  steps: ExecutionStep[];
}

/**
 * ==========================
 * LOG MODEL (STREAM EVENTS)
 * ==========================
 */
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