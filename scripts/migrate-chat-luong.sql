-- Migration: Bảng cache dữ liệu Quản lý chất lượng từ Google Sheets
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.quality_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Định danh nguồn
  region            TEXT        NOT NULL,  -- 'HN','HP','DN','HCM','BD'

  -- Thời gian
  sort_key          TEXT        NOT NULL,  -- 'YYYY-MM-DD' từ ngay_dieu_phoi
  tuan              TEXT,                  -- 'W09'
  thang             INTEGER,

  -- Kết quả kiểm tra chất lượng ← KEY FIELD
  tinh_trang        TEXT,                  -- '' = chưa KT | 'OK' = đạt | 'NG' = lỗi
  loai_loi          TEXT,                  -- Chi tiết lỗi (khi NG)

  -- Phân loại công việc
  nguyen_nhan       TEXT,                  -- Nguyên nhân điều phối: Bảo trì / Lắp đặt / ...
  ly_do             TEXT,                  -- Lý do bảo trì (chi tiết)

  -- Thông tin điều phối
  ngay_dieu_phoi    TEXT,                  -- '2025-02-24'
  nguoi_dieu_phoi   TEXT,

  -- Thông tin khách hàng
  ma_khach          TEXT,
  ten_khach         TEXT,
  nv_kinh_doanh     TEXT,

  -- Thiết bị & kỹ thuật
  loai_san_pham     TEXT,
  ky_thuat_vien     TEXT,
  so_xe             TEXT,                  -- 'BKS(Loại lỗi)'

  -- Tiến độ
  ngay_hen          TEXT,
  ngay_hoan_thanh   TEXT,
  phi               TEXT,
  ly_do_vo_hieu     TEXT,
  ghi_chu           TEXT,

  -- Thông tin liên hệ
  ten_lien_he       TEXT,
  so_dien_thoai     TEXT,
  dia_chi           TEXT,

  -- Cache metadata
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: mỗi xe trong mỗi ngày của khu vực chỉ xuất hiện 1 lần
  CONSTRAINT quality_records_unique UNIQUE (region, ngay_dieu_phoi, so_xe)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quality_region_sortkey
  ON public.quality_records (region, sort_key);

CREATE INDEX IF NOT EXISTS idx_quality_tinh_trang
  ON public.quality_records (tinh_trang);

CREATE INDEX IF NOT EXISTS idx_quality_tuan
  ON public.quality_records (region, tuan);

-- RLS
ALTER TABLE public.quality_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON public.quality_records
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Gán permission chat_luong:read cho role cụ thể
-- Thay 'ten-role' bằng role_id hoặc dùng cách bên dưới
-- ============================================================
-- Cách gán qua Admin UI: Vào /admin/users → chọn user → sửa role → thêm permission chat_luong:read
--
-- Hoặc gán thẳng cho 1 role bằng SQL (thay role_id thực tế):
-- INSERT INTO role_permissions (role_id, permission)
-- SELECT id, 'chat_luong:read' FROM roles WHERE name = 'ten-role-cua-ban'
-- ON CONFLICT DO NOTHING;
