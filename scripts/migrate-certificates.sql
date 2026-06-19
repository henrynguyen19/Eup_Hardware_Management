-- ============================================================
-- Migration: Bảng chứng nhận công ty (certificates)
-- Chạy trong Supabase SQL Editor
-- ============================================================

create table if not exists public.certificates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- Tên chứng nhận
  category      text not null default 'Khác',    -- Danh mục: ISO, TCVN, Giấy phép, ...
  description   text,                             -- Mô tả ngắn
  issuer        text,                             -- Cơ quan cấp
  issued_date   date,                             -- Ngày cấp
  expires_date  date,                             -- Ngày hết hạn (null = không hết hạn)
  drive_file_id text not null,                   -- Google Drive file ID
  sort_order    int not null default 0,           -- Thứ tự hiển thị
  created_at    timestamptz default now()
);

-- RLS: mọi user đăng nhập đều xem được
alter table public.certificates enable row level security;

create policy "Authenticated users can view certificates"
  on public.certificates for select
  to authenticated
  using (true);

create policy "Admin can manage certificates"
  on public.certificates for all
  to authenticated
  using (
    exists (
      select 1 from public.user_permissions_view
      where user_id = auth.uid()
        and 'admin:users' = any(permissions)
    )
  );

-- ============================================================
-- Dữ liệu mẫu — thay drive_file_id bằng ID thực từ Google Drive
-- Lấy file ID: mở file trên Drive → URL có dạng
--   drive.google.com/file/d/<FILE_ID>/view
-- ============================================================

-- insert into public.certificates (name, category, description, issuer, issued_date, expires_date, drive_file_id, sort_order)
-- values
--   ('ISO 9001:2015', 'ISO', 'Chứng nhận hệ thống quản lý chất lượng', 'Bureau Veritas', '2024-01-15', '2027-01-14', 'DRIVE_FILE_ID_HERE', 1),
--   ('Giấy phép kinh doanh', 'Giấy phép', 'Giấy chứng nhận đăng ký doanh nghiệp', 'Sở KH&ĐT TP.HCM', '2020-03-10', null, 'DRIVE_FILE_ID_HERE', 2);
