-- Step 16: ESG 淨重照片標記 — 新增欄位
ALTER TABLE equipment_cards
  ADD COLUMN IF NOT EXISTS net_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_photo TEXT,
  ADD COLUMN IF NOT EXISTS weight_photo_public_id TEXT;
