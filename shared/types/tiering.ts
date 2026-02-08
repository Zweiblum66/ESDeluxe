export type TieringCondition = 'last_access' | 'last_modified' | 'file_size' | 'file_extension';
export type TieringOperator = 'older_than_days' | 'larger_than_bytes' | 'matches' | 'not_matches';
export type TieringRuleStatus = 'active' | 'paused' | 'error';

/** A tiering rule definition */
export interface ITieringRule {
  id: number;
  spaceName: string;
  name: string;
  description?: string;
  sourceGoal: string;
  targetGoal: string;
  condition: TieringCondition;
  operator: TieringOperator;
  value: string;
  recursive: boolean;
  pathPattern?: string;
  status: TieringRuleStatus;
  lastRunAt?: number;
  lastRunFiles?: number;
  lastRunErrors?: number;
  nextRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Request to create a tiering rule */
export interface ICreateTieringRuleRequest {
  spaceName: string;
  name: string;
  description?: string;
  sourceGoal: string;
  targetGoal: string;
  condition: TieringCondition;
  operator: TieringOperator;
  value: string;
  recursive?: boolean;
  pathPattern?: string;
}

/** Request to update a tiering rule */
export interface IUpdateTieringRuleRequest {
  name?: string;
  description?: string;
  sourceGoal?: string;
  targetGoal?: string;
  condition?: TieringCondition;
  operator?: TieringOperator;
  value?: string;
  recursive?: boolean;
  pathPattern?: string;
  status?: TieringRuleStatus;
}

/** Log entry for a tiering rule execution */
export interface ITieringExecutionLog {
  id: number;
  ruleId: number;
  startedAt: number;
  completedAt?: number;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  bytesProcessed: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

/** Scheduler status information */
export interface ITieringSchedulerStatus {
  isRunning: boolean;
  intervalMinutes: number;
  activeRuleCount: number;
  lastCheckAt?: number;
  nextCheckAt?: number;
}
