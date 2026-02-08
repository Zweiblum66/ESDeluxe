/** A storage goal definition from EFS */
export interface IStorageGoal {
  id: number;
  name: string;
  isUsed: boolean;
  writeable: boolean;
  definition: string;     // e.g., "1@default_group"
  storageEfficiency?: number;
  satisfiable?: boolean;
}

/** Goal information for a specific file/directory */
export interface IGoalInfo {
  path: string;
  currentGoal: string;
}

/** Request to set a storage goal */
export interface ISetGoalRequest {
  goalName: string;
  recursive?: boolean;
}
