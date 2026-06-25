-- Migration: Bảng quản lý hashtag hệ thống hỗ trợ kỹ thuật
-- Nguồn: Bảng mô tả phân loại các lỗi theo hashtag_Hardware_v1_20260410
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ho_tro_hashtags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag         text NOT NULL,                    -- "#go168", "#nc", "hẹn", "mai báo lại"
  category    text NOT NULL,                    -- 'thiet_bi' | 'loi' | 'thoi_gian' | 'cap_nhat' | 'pm'
  meaning     text,                             -- Ý nghĩa ngắn
  purpose     text,                             -- Mục đích / cách dùng
  example     text,                             -- Ví dụ
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (tag)
);

CREATE INDEX IF NOT EXISTS idx_ho_tro_hashtags_category ON ho_tro_hashtags (category);
CREATE INDEX IF NOT EXISTS idx_ho_tro_hashtags_active   ON ho_tro_hashtags (is_active);

CREATE OR REPLACE FUNCTION update_ho_tro_hashtags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_ho_tro_hashtags_updated_at ON ho_tro_hashtags;
CREATE TRIGGER trg_ho_tro_hashtags_updated_at
  BEFORE UPDATE ON ho_tro_hashtags
  FOR EACH ROW EXECUTE FUNCTION update_ho_tro_hashtags_updated_at();

-- ── Seed data từ tài liệu ────────────────────────────────────────

INSERT INTO ho_tro_hashtags (tag, category, meaning, purpose, example, sort_order) VALUES

-- ── Tag thiết bị ──────────────────────────────────────────────────
('#hardware',    'thiet_bi', 'Phần cứng',              'Check lỗi phần cứng',                             '#hardware #nc #go168 #f shiro 1/1',       10),
('#go168',       'thiet_bi', 'Lỗi Go168',              'Lấy tbi lỗi là thiết bị Go168',                  '#hardware #nc #go168 #f shiro 1/1',       20),
('#gotrack',     'thiet_bi', 'Lỗi Gotrack',            'Lấy tbi lỗi là thiết bị S400',                   '#hardware #nc #gotrack #f shiro 1/1',     30),
('#mt99',        'thiet_bi', 'Lỗi MT99',               'Lấy tbi lỗi là thiết bị MT99',                   '#hardware #nc #mt99 #f shiro 1/1',        40),
('#vn88',        'thiet_bi', 'Lỗi VN88',               'Lấy tbi lỗi là thiết bị VN88',                   '#hardware #nc #vn88 #f shiro 1/1',        50),
('#vn88 4g',     'thiet_bi', 'Lỗi VN88 4G',           'Lấy tbi lỗi là thiết bị VN88 4G',                '#hardware #nc #vn88 4g #f shiro 1/1',     60),
('#vn88 4gh',    'thiet_bi', 'Lỗi VN88 4GH',          'Lấy tbi lỗi là thiết bị VN88 4GH',               '#hardware #nc #vn88 4gh #f shiro 1/1',    70),
('#dvr',         'thiet_bi', 'Lỗi DVR',                'Lấy tbi lỗi là thiết bị DVR',                    '#hardware #nc #dvr #f shiro 1/1',         80),
('#bw',          'thiet_bi', 'Lỗi BW',                 'Lấy tbi lỗi là thiết bị BW',                     '#hardware #nc #bw #f shiro 1/1',          90),
('#c43',         'thiet_bi', 'Lỗi C43',                'Lấy tbi lỗi là thiết bị C43',                    '#hardware #nc #c43 #f shiro 1/1',        100),
('#h5',          'thiet_bi', 'Lỗi H5',                 'Lấy tbi lỗi là thiết bị H5',                     '#hardware #nc #h5 #f shiro 1/1',         110),
('#sj',          'thiet_bi', 'Lỗi cây dầu Soji',       'Lấy tbi lỗi là cây dầu Soji',                    '#hardware #nc #sj #f shiro 1/1',         120),
('#fs',          'thiet_bi', 'Lỗi cây dầu FS100',      'Lấy tbi lỗi là cây dầu Đài Loan FS100',          '#hardware #nc #fs #f shiro 1/1',         130),
('#fuelsensor',  'thiet_bi', 'Check lục liên quan dầu','Check lục liên quan đến dầu',                     '#fuelsensor #sj #f shiro 1/1',           140),
('#pm',          'thiet_bi', 'Lỗi phần mềm',           'Lấy lỗi là phần mềm',                            '#hardware #nc #pm #f shiro 1/1',         150),

-- ── Tag lỗi ───────────────────────────────────────────────────────
('#nc',          'loi', 'No connect',                  'Lấy tổng hợp lỗi no connect',                    '#hardware #nc #go168 #f shiro 1/1',       10),
('#gsm',         'loi', 'Lỗi tín hiệu mạng',          'Lỗi truyền bù, không nhận SIM',                  '#hardware #go168 #gsm #f shiro 1/1',      20),
('#gps',         'loi', 'Lỗi tín hiệu GPS',            'Lấy lỗi tín hiệu GPS',                           '#hardware #go168 #gps #f shiro 1/1',      30),
('#sd',          'loi', 'Lỗi thẻ nhớ',                'Lấy lỗi thẻ nhớ',                                '#hardware #go168 #sd #f shiro 1/1',       40),
('#roaming',     'loi', 'Lỗi roaming',                 'Kết nối với xe đi nước ngoài',                   '#hardware #go168 #roaming #f shiro 1/1',  50),
('#acc',         'loi', 'Lỗi tín hiệu bật tắt khóa',  'Lấy lỗi tín hiệu bật tắt khóa',                 '#hardware #go168 #acc #f shiro 1/1',      60),
('#rfid',        'loi', 'Lỗi thẻ quẹt lái xe',        'Cả do thiết bị và do thẻ',                       '#hardware #go168 #rfid #f shiro 1/1',     70),
('#pw',          'loi', 'Lỗi nguồn',                   'Lấy lỗi nguồn',                                  '#hardware #go168 #pw #f shiro 1/1',       80),
('#ss',          'loi', 'Lỗi cảm biến xung',           'Cảm biến xung (không phải cảm biến dầu)',        '#hardware #go168 #ss #f shiro 1/1',       90),
('#dms',         'loi', 'Lỗi hành vi lái xe',          'Lấy lỗi liên quan đến hành vi lái xe',           '#hardware #h5 #dms #f shiro 1/1',        100),
('#adas',        'loi', 'Lỗi cảm biến lệch làn',       'Lỗi cảm biến lệch làn, va chạm,...',             '#hardware #h5 #adas #f shiro 1/1',       110),
('#sp',          'loi', 'Hỗ trợ khách hàng',           'Giải thích, hỗ trợ khách hàng, trợ lý',         '#hardware #go168 #sp #f shiro 1/1',      120),
('#io',          'loi', 'Lỗi tín hiệu IO',             'Tín hiệu đóng mở cửa,...',                       '#hardware #go168 #io #f shiro 1/1',      130),

-- ── Tag thời gian ─────────────────────────────────────────────────
('#f',           'thoi_gian', 'Fast — dưới 5 phút',    'Tốc độ xử lý cá nhân dưới 5 phút',              '#hardware #go168 #sp #f shiro 1/1',       10),
('#n',           'thoi_gian', 'Normal — trên 5 phút',  'Tốc độ xử lý cá nhân trên 5 phút',              '#hardware #go168 #sp #n shiro 1/1',       20),
('#l',           'thoi_gian', 'Low — trên 30 phút',    'Tốc độ xử lý cá nhân trên 30 phút',             '#hardware #go168 #sp #l shiro 1/1',       30),
('hẹn',          'thoi_gian', 'Hẹn xử lý',             'Cần nhiều thời gian, phải hẹn khách',            '#hardware #go168 #sp #l shiro 1/1 hẹn',   40),
('mai báo lại',  'thoi_gian', 'Mai báo lại',            'Cần nhiều thời gian, hẹn báo lại hôm sau',      '#hardware #go168 #sp #l shiro 1/1 mai báo lại', 50),

-- ── Lục cần cập nhật ──────────────────────────────────────────────
('#update',      'cap_nhat', 'Update xử lý',            'Update thời gian xử lý xong lục đó',             '#hardware #go168 #sp #l shiro 1/1 mai báo lại\n#update 2/1 đã xử lý cho khg', 10),
('#dl',          'cap_nhat', 'Deadline',                 'Cập nhật hạn hoàn thành bug từ đội PM',          '#dl 2/1 đội pm xử lý xong',              20),

-- ── Tag dành riêng lỗi Phần mềm ──────────────────────────────────
('#video',       'pm', 'Lỗi video/ảnh',                 'Lọc lỗi Jira liên quan đến tín hiệu video, ảnh', '#hardware #pm #video #l shiro 1/1 hẹn',  10),
('#app',         'pm', 'Lỗi app FMS/eDriver',            'Lọc lỗi Jira liên quan đến app VN FMS, eDriver', '#hardware #pm #app #l shiro 1/1 hẹn',   20),
('#report',      'pm', 'Lỗi báo cáo (không dầu)',       'Lọc lỗi Jira về báo cáo trên FMS (không phải dầu)', '#hardware #pm #report #l shiro 1/1 hẹn', 30)

ON CONFLICT (tag) DO NOTHING;

-- ── Kiểm tra kết quả ─────────────────────────────────────────────
SELECT category, count(*) AS so_tag
FROM ho_tro_hashtags
GROUP BY category
ORDER BY category;
