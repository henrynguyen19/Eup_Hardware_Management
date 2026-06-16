-- ============================================================
-- Migration: 0001_create_equipment_cards
-- Description: 建立設備料卡主表、索引、RLS 政策、自動更新觸發器
-- ============================================================

-- 啟用 pgcrypto（uuid 工具，備用）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 主表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.equipment_cards (
    equipment_id  TEXT        PRIMARY KEY,                        -- 如 1000003
    name          TEXT        NOT NULL,
    category      TEXT,                                           -- 主機/天線/支架/螢幕…
    vendor        TEXT,
    status        TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'discontinued')),
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    notes         TEXT,
    main_photo    TEXT,                                           -- Cloudflare R2 URL
    detail_photos JSONB       NOT NULL DEFAULT '[]'::jsonb,      -- R2 URL 陣列
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.equipment_cards                IS '設備料卡主表';
COMMENT ON COLUMN public.equipment_cards.equipment_id   IS '設備 ID，對應照片檔名前綴';
COMMENT ON COLUMN public.equipment_cards.tags           IS '彈性標籤，如 {4G, 含RFID}';
COMMENT ON COLUMN public.equipment_cards.detail_photos  IS 'R2 子圖 URL 陣列，如 ["https://…_2.jpg","https://…_整組.jpg"]';

-- ============================================================
-- 索引
-- ============================================================
-- 全文搜尋（中英文模糊搜尋用 pg_trgm，優先於 to_tsvector）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_equipment_cards_name_trgm
    ON public.equipment_cards USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_equipment_cards_vendor_trgm
    ON public.equipment_cards USING GIN (vendor gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_equipment_cards_notes_trgm
    ON public.equipment_cards USING GIN (notes gin_trgm_ops);

-- 精確篩選
CREATE INDEX IF NOT EXISTS idx_equipment_cards_category
    ON public.equipment_cards (category);

CREATE INDEX IF NOT EXISTS idx_equipment_cards_status
    ON public.equipment_cards (status);

-- tags 陣列包含查詢
CREATE INDEX IF NOT EXISTS idx_equipment_cards_tags
    ON public.equipment_cards USING GIN (tags);

-- ============================================================
-- updated_at 自動更新觸發器
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_cards_updated_at ON public.equipment_cards;
CREATE TRIGGER trg_equipment_cards_updated_at
    BEFORE UPDATE ON public.equipment_cards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Row Level Security（RLS）
-- ============================================================
ALTER TABLE public.equipment_cards ENABLE ROW LEVEL SECURITY;

-- 政策 1：已登入使用者可讀取所有資料
CREATE POLICY "authenticated users can read"
    ON public.equipment_cards
    FOR SELECT
    TO authenticated
    USING (true);

-- 政策 2：已登入使用者可新增
CREATE POLICY "authenticated users can insert"
    ON public.equipment_cards
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 政策 3：已登入使用者可更新
CREATE POLICY "authenticated users can update"
    ON public.equipment_cards
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 政策 4：已登入使用者可刪除（如需限制只開放 admin role 再調整）
CREATE POLICY "authenticated users can delete"
    ON public.equipment_cards
    FOR DELETE
    TO authenticated
    USING (true);

-- 公開唯讀（如未來需要讓未登入用戶瀏覽，取消以下註解）
-- CREATE POLICY "anon read"
--     ON public.equipment_cards
--     FOR SELECT
--     TO anon
--     USING (status = 'active');
