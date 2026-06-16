-- Step 22 補丁：為 issues 表新增 sort_order 欄位，支援看板同欄拖曳排序
ALTER TABLE issues ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 為現有資料依照 (status, created_at DESC) 賦予初始 sort_order
-- 確保每欄的既有卡片有確定順序
UPDATE issues
SET sort_order = sub.rn * 1000
FROM (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at DESC) AS rn
  FROM issues
) sub
WHERE issues.id = sub.id;
