-- ============================================================
-- Migration: feature_group_defs + feature_meta
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- Bảng nhóm tính năng (thay thế FEATURE_GROUPS hardcode)
create table if not exists public.feature_group_defs (
  label      text primary key,
  icon       text not null default '⚙️',
  color      text not null default 'gray',   -- amber | blue | orange | purple | teal | green | gray
  sort_order int  not null default 999
);

-- Bảng metadata của từng tính năng (key → nhóm, thứ tự)
create table if not exists public.feature_meta (
  feature_key text primary key,
  group_label text not null default 'Khác',
  sort_order  int  not null default 999
);

-- RLS: authenticated users đọc được, admin mới sửa được
alter table public.feature_group_defs enable row level security;
alter table public.feature_meta        enable row level security;

create policy "Authenticated read feature_group_defs"
  on public.feature_group_defs for select to authenticated using (true);
create policy "Admin manage feature_group_defs"
  on public.feature_group_defs for all to authenticated
  using (exists (
    select 1 from public.user_permissions_view
    where user_id = auth.uid() and 'admin:users' = any(permissions)
  ));

create policy "Authenticated read feature_meta"
  on public.feature_meta for select to authenticated using (true);
create policy "Admin manage feature_meta"
  on public.feature_meta for all to authenticated
  using (exists (
    select 1 from public.user_permissions_view
    where user_id = auth.uid() and 'admin:users' = any(permissions)
  ));

-- ── Seed: các nhóm mặc định ──────────────────────────────────
insert into public.feature_group_defs (label, icon, color, sort_order) values
  ('Tiêu chuẩn pháp lý', '📜', 'amber',  1),
  ('RFID & Tài xế',      '🪪', 'blue',   2),
  ('Cảnh báo tốc độ',    '⚡', 'orange', 3),
  ('Camera',             '📷', 'purple', 4),
  ('Cảm biến dầu',       '🛢️', 'teal',   5),
  ('Cảm biến & Mở rộng', '🔌', 'gray',   6),
  ('Khác',               '⚙️', 'gray',   99)
on conflict (label) do nothing;

-- ── Seed: mapping tính năng → nhóm ──────────────────────────
insert into public.feature_meta (feature_key, group_label, sort_order) values
  ('QCVN06',                       'Tiêu chuẩn pháp lý', 1),
  ('QCVN31',                       'Tiêu chuẩn pháp lý', 2),
  ('Nghị Định 10',                  'Tiêu chuẩn pháp lý', 3),
  ('Cảnh báo quẹt thẻ',            'RFID & Tài xế',      4),
  ('Quẹt Thẻ lái xe',              'RFID & Tài xế',      5),
  ('Tự động đăng xuất',             'RFID & Tài xế',      6),
  ('Cảnh báo Tốc độ theo cung đường','Cảnh báo tốc độ',  7),
  ('Cảnh báo quá tốc độ',          'Cảnh báo tốc độ',    8),
  ('Tích hợp cam',                  'Camera',             9),
  ('Cảm biến dầu Taiwan - Soji',   'Cảm biến dầu',       10),
  ('Cảm biến dầu đôi',             'Cảm biến dầu',       11),
  ('Cảm biến dầu chuyển đổi',      'Cảm biến dầu',       12),
  ('Cảm biến nhiệt độ',            'Cảm biến & Mở rộng', 13),
  ('Cảm biến bê tông',             'Cảm biến & Mở rộng', 14),
  ('Công tắc nâng hạ ben, cửa, điều hòa, Sos, Công tắc chở hàng', 'Cảm biến & Mở rộng', 15),
  ('Cảm biến va chạm',             'Cảm biến & Mở rộng', 16),
  ('Cảm biến rơmooc etag',         'Cảm biến & Mở rộng', 17)
on conflict (feature_key) do nothing;
