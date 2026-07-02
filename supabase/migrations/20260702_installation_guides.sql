-- Bảng quản lý các hướng dẫn lắp đặt thiết bị
CREATE TABLE IF NOT EXISTS installation_guides (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  device_model TEXT,               -- VD: "Streamax H5", "H8", "CA20S"
  file_name   TEXT NOT NULL,       -- VD: "huong-dan-adas-h5.html" (nằm trong /public/guides/)
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed bản đầu tiên
INSERT INTO installation_guides (title, description, device_model, file_name, sort_order)
VALUES (
  'Hướng Dẫn Lắp Đặt Streamax H5 ADAS CA20S',
  'Hướng dẫn đầy đủ từng bước lắp đặt và hiệu chỉnh camera ADAS CA20S cho thiết bị H5 — từ chuẩn bị dụng cụ đến kiểm tra cảnh báo trên đường thực tế.',
  'Streamax H5 + CA20S',
  'huong-dan-adas-h5.html',
  1
);

INSERT INTO installation_guides (title, description, device_model, file_name, sort_order)
VALUES (
  'Hướng Dẫn Lắp Đặt Streamax H5 AI DMS',
  'Hướng dẫn đầy đủ lắp đặt hệ thống giám sát tài xế DMS — đấu dây nguồn, lắp camera AV4, hiệu chỉnh AI và kiểm tra 10 chức năng cảnh báo.',
  'Streamax H5 DMS',
  'huong-dan-dms-h5.html',
  2
);
