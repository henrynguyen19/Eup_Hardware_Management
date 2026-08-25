-- Migration: bảng lưu trạng thái hội thoại Zalo
-- Mỗi user Zalo có 1 row, cập nhật theo state machine

CREATE TABLE IF NOT EXISTS zalo_sessions (
  id              bigserial PRIMARY KEY,
  zalo_user_id    text        NOT NULL UNIQUE,   -- ID user Zalo (sender.id)
  state           text        NOT NULL DEFAULT 'idle',
  -- 'idle'                  — không có hành động đang chờ
  -- 'waiting_ticket_detail' — đang chờ user nhập mô tả chi tiết
  -- 'waiting_confirm'       — đang chờ user xác nhận tạo ticket
  pending_detail  text,                          -- nội dung tạm khi state = waiting_confirm
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_zalo_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zalo_sessions_updated_at ON zalo_sessions;
CREATE TRIGGER trg_zalo_sessions_updated_at
  BEFORE UPDATE ON zalo_sessions
  FOR EACH ROW EXECUTE FUNCTION update_zalo_sessions_updated_at();

-- RLS: chỉ service role được đọc/ghi
ALTER TABLE zalo_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON zalo_sessions
  USING (auth.role() = 'service_role');

-- Index cho lookup theo zalo_user_id
CREATE INDEX IF NOT EXISTS idx_zalo_sessions_user_id ON zalo_sessions (zalo_user_id);

-- Dọn session cũ hơn 7 ngày (chạy thủ công hoặc cron)
-- DELETE FROM zalo_sessions WHERE updated_at < now() - interval '7 days';
