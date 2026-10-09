-- Bảng lưu tổng hợp số lượng yêu cầu hỗ trợ kỹ thuật theo tuần
-- Mỗi hàng = 1 tuần ISO (ví dụ: week_key = '2026-W41')
-- Được rebuild tự động sau mỗi lần sync CRM

CREATE TABLE IF NOT EXISTS hotro_weekly_stats (
  week_key    TEXT PRIMARY KEY,        -- '2026-W01', '2026-W41', ...
  week_label  TEXT NOT NULL,           -- 'W01', 'W41'
  year        INTEGER NOT NULL,
  week_num    INTEGER NOT NULL,        -- 1..53
  total       INTEGER NOT NULL DEFAULT 0,
  -- Lỗi theo hashtag
  no_connect  INTEGER NOT NULL DEFAULT 0,
  rfid        INTEGER NOT NULL DEFAULT 0,
  acc         INTEGER NOT NULL DEFAULT 0,
  pw          INTEGER NOT NULL DEFAULT 0,
  support     INTEGER NOT NULL DEFAULT 0,
  gps         INTEGER NOT NULL DEFAULT 0,
  gsm         INTEGER NOT NULL DEFAULT 0,
  -- Metadata
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hotro_weekly_stats_year_idx ON hotro_weekly_stats (year, week_num);

COMMENT ON TABLE hotro_weekly_stats IS 'Cache tổng hợp YC hỗ trợ kỹ thuật theo tuần ISO — được rebuild sau mỗi lần sync CRM';
