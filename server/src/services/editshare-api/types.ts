/**
 * Raw types returned by the EditShare REST API.
 * These differ from the shared types used in our application layer.
 */

/** Raw auth validation response from ES API */
export interface ESAuthResponse {
  authenticated: boolean;
  is_admin: boolean;
  username: string;
}

/** Raw auth backend entry from ES API */
export interface ESAuthBackend {
  type: string;
  name: string;
  enabled: boolean;
}

/** Raw auth backends response */
export interface ESAuthBackendsResponse {
  backends: ESAuthBackend[];
}

/** Raw user object from ES API */
export interface ESUser {
  user_name: string;
  display_name?: string;
  email?: string;
  identity_source: string;
  is_maintenance: boolean;
  uid?: number;
}

/** Raw user list response */
export interface ESUserListResponse {
  users: ESUser[];
}

/** Raw group object from ES API */
export interface ESGroup {
  group_name: string;
  identity_source?: string;
  maintenance_spaces?: string[];
}

/** Raw group list response */
export interface ESGroupListResponse {
  groups: ESGroup[];
}

/** Raw media space from ES API */
export interface ESSpace {
  space_name: string;
  uuid?: string;
  type: string;
  maintenance_user?: string;
  goal?: string;
  quota_bytes: number;
  used_bytes: number;
  options?: string;
}

/** Raw space list response */
export interface ESSpaceListResponse {
  media_spaces: ESSpace[];
}

/** Raw space detail from ES API */
export interface ESSpaceDetail extends ESSpace {
  users: ESSpaceUser[];
  groups: ESSpaceGroup[];
  is_public: boolean;
}

/** Raw user access within a space */
export interface ESSpaceUser {
  user_name: string;
  access_type: string;
  read_only: boolean;
}

/** Raw group access within a space */
export interface ESSpaceGroup {
  group_name: string;
  access_type: string;
}

/** Raw QoS pool from ES API */
export interface ESQosPool {
  pool_name: string;
  bandwidth_limit: number | null;
  consumers: ESQosConsumer[];
}

/** Raw QoS consumer from ES API */
export interface ESQosConsumer {
  type: string;
  user?: string | { name: string };
  group?: string | { name: string };
  address?: string | { address: string };
  workstation?: string | { name: string };
}

/** Raw QoS config response from ES API */
export interface ESQosConfigResponse {
  storage_node_group: string;
  qos_enabled: boolean;
  pools: ESQosPool[];
  others_bandwidth_limit: number | null;
}

/** Raw QoS usage pool from ES API */
export interface ESQosUsagePool {
  pool_name: string | null;
  bytes_per_second: number;
}

/** Raw QoS usage response from ES API */
export interface ESQosUsageResponse {
  storage_node_group: string;
  pools: ESQosUsagePool[];
}

/** Raw client pool entry from ES API */
export interface ESClientPool {
  pool_name: string;
  client_address: string;
  client_workstation?: string;
}
