import type { SpaceType } from './space';

export type TieringCondition = 'last_access' | 'last_modified' | 'file_size' | 'file_extension';
export type TieringOperator = 'older_than_hours' | 'older_than_days' | 'older_than_weeks' | 'older_than_months' | 'larger_than_bytes' | 'matches' | 'not_matches';
export type TieringRuleStatus = 'active' | 'paused' | 'error';
export type TieringTargetType = 'goal_change' | 'archive';

/** How spaces are selected for a tiering rule */
export type SpaceSelectorMode = 'explicit' | 'by_type' | 'pattern' | 'all';

export interface ISpaceSelectorExplicit {
  mode: 'explicit';
  spaceNames: string[];
}

export interface ISpaceSelectorByType {
  mode: 'by_type';
  spaceTypes: SpaceType[];
}

export interface ISpaceSelectorPattern {
  mode: 'pattern';
  namePattern: string;
}

export interface ISpaceSelectorAll {
  mode: 'all';
}

export type ISpaceSelector =
  | ISpaceSelectorExplicit
  | ISpaceSelectorByType
  | ISpaceSelectorPattern
  | ISpaceSelectorAll;

/** A tiering rule definition */
export interface ITieringRule {
  id: number;
  spaceSelector: ISpaceSelector;
  /** @deprecated Use spaceSelector. Populated for single-explicit rules for backward compat. */
  spaceName?: string;
  name: string;
  description?: string;
  targetType: TieringTargetType;
  sourceGoal?: string;
  targetGoal?: string;
  archiveLocationId?: number;
  archiveLocationName?: string;
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
  spaceSelector?: ISpaceSelector;
  /** @deprecated Use spaceSelector. Fallback: converted to { mode: 'explicit', spaceNames: [spaceName] } */
  spaceName?: string;
  name: string;
  description?: string;
  targetType?: TieringTargetType;
  sourceGoal?: string;
  targetGoal?: string;
  archiveLocationId?: number;
  condition: TieringCondition;
  operator: TieringOperator;
  value: string;
  recursive?: boolean;
  pathPattern?: string;
}

/** Request to update a tiering rule */
export interface IUpdateTieringRuleRequest {
  spaceSelector?: ISpaceSelector;
  name?: string;
  description?: string;
  targetType?: TieringTargetType;
  sourceGoal?: string;
  targetGoal?: string;
  archiveLocationId?: number;
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
