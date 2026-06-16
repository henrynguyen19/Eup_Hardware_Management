-- ============================================================
-- Migration: 0002_update_photo_fields_cloudinary
-- Description: 照片儲存從 R2 改為 Cloudinary
--              main_photo 保留 URL；新增 main_photo_public_id
--              detail_photos 結構從純 URL 陣列改為物件陣列
-- ============================================================

-- 新增主照片 public_id 欄位
ALTER TABLE public.equipment_cards
    ADD COLUMN IF NOT EXISTS main_photo_public_id TEXT;

-- 更新欄位說明
COMMENT ON COLUMN public.equipment_cards.main_photo
    IS 'Cloudinary 主圖 secure_url';

COMMENT ON COLUMN public.equipment_cards.main_photo_public_id
    IS 'Cloudinary 主圖 public_id，刪除圖片時使用';

COMMENT ON COLUMN public.equipment_cards.detail_photos
    IS 'Cloudinary 子圖陣列，每筆為 {"public_id":"equipment-cards/xxx","url":"https://res.cloudinary.com/…"}';

-- detail_photos 新結構範例（不需 ALTER TYPE，JSONB 可直接存）：
-- [
--   { "public_id": "equipment-cards/1000003_name_2", "url": "https://res.cloudinary.com/…" },
--   { "public_id": "equipment-cards/1000003_name_整組", "url": "https://res.cloudinary.com/…" }
-- ]
