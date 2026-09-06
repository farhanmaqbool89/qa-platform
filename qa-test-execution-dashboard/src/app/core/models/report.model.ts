import { ExecutionStatus } from './execution.model';

export interface ExecutionReport {
  id: number;
  projectName: string;
  featureName: string;
  environment: string;
  status: ExecutionStatus;
  durationSeconds: number;
  executedAt: string;
  details: string;
}
