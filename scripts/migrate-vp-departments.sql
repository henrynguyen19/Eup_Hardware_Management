-- Migration: Tạo các phòng ban Văn phòng khu vực (VP)
-- Mục đích: Mỗi trợ lý kinh doanh được assign vào 1 VP,
--           parser sheets sẽ dùng colN (assistant) → VP → khu vực để thống kê địa điểm.
--
-- Chạy trong Supabase SQL Editor

INSERT INTO departments (name)
SELECT name FROM (VALUES
  ('VP Hà Nội'),
  ('VP Hồ Chí Minh'),
  ('VP Hải Phòng'),
  ('VP Bình Dương'),
  ('VP Đà Nẵng')
) AS t(name)
WHERE NOT EXISTS (
  SELECT 1 FROM departments WHERE departments.name = t.name
);

-- Kiểm tra kết quả:
SELECT id, name FROM departments WHERE name LIKE 'VP %' ORDER BY name;
