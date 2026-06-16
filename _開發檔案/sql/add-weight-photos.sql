-- Step 16 Phase 2：新增 weight_photos 欄位，支援多張淨重照片
-- 執行前請確認 Supabase 版本，在 Supabase Dashboard → SQL Editor 執行

-- 新增欄位（若已存在則跳過）
ALTER TABLE equipment_cards
ADD COLUMN IF NOT EXISTS weight_photos JSONB DEFAULT '[]';

-- 將現有 weight_photo（單張）遷移至 weight_photos 陣列
-- 只遷移尚未遷移的資料（weight_photos 為空且 weight_photo 有值）
UPDATE equipment_cards
SET weight_photos = jsonb_build_array(
  jsonb_build_object(
    'public_id', weight_photo_public_id,
    'url', weight_photo
  )
)
WHERE weight_photo IS NOT NULL
  AND weight_photo_public_id IS NOT NULL
  AND (weight_photos = '[]'::jsonb OR weight_photos IS NULL);
