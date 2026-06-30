-- Patch: thêm crm_repair_id để upsert từ CRM
ALTER TABLE repair_items
  ADD COLUMN IF NOT EXISTS crm_repair_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_items_crm_id
  ON repair_items(crm_repair_id)
  WHERE crm_repair_id IS NOT NULL;
