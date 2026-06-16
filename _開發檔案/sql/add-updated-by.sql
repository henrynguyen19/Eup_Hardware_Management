-- Step 10: 新增 updated_by 欄位 + 自動更新 updated_at Trigger
-- 在 Supabase Dashboard > SQL Editor 執行

-- 1. 新增 updated_by 欄位
ALTER TABLE equipment_cards ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- 2. 建立 updated_at 自動更新函式
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. 建立 Trigger（已存在則先刪除）
DROP TRIGGER IF EXISTS set_updated_at ON equipment_cards;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON equipment_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
