-- 新增 updated_fields 欄位，記錄每次更新的欄位名稱
-- 在 Supabase Dashboard → SQL Editor 執行
ALTER TABLE equipment_cards
ADD COLUMN IF NOT EXISTS updated_fields TEXT[] DEFAULT '{}';
