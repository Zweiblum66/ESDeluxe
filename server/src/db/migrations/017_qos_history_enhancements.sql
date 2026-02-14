-- QoS History Enhancements
-- Add composite index for efficient time-range queries per storage node group / pool

CREATE INDEX IF NOT EXISTS idx_bw_sng_pool_ts
  ON bandwidth_history(storage_node_group, pool_name, timestamp);
