-- ═══════════════════════════════════════════════════════════════
-- Migration: Combo, Recipient, extend don_hang & don_items
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Device combos (gói thiết bị) ─────────────────────────────
CREATE TABLE IF NOT EXISTS device_combos (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_combo_items (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id   UUID    NOT NULL REFERENCES device_combos(id) ON DELETE CASCADE,
  device_name TEXT   NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  notes      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON device_combo_items(combo_id);

-- RLS
ALTER TABLE device_combos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combos_select"       ON device_combos;
CREATE POLICY "combos_select"       ON device_combos      FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "combos_write"        ON device_combos;
CREATE POLICY "combos_write"        ON device_combos      FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "combo_items_select"  ON device_combo_items;
CREATE POLICY "combo_items_select"  ON device_combo_items FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "combo_items_write"   ON device_combo_items;
CREATE POLICY "combo_items_write"   ON device_combo_items FOR ALL    USING (true) WITH CHECK (true);

-- ── 2. Recipients (sổ địa chỉ người nhận) ───────────────────────
CREATE TABLE IF NOT EXISTS giao_hang_recipients (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL,          -- "VP Hà Nội", "KT Nguyễn A"
  type         TEXT    NOT NULL DEFAULT 'office',  -- 'office' | 'person'
  office       TEXT,                      -- VP abbreviation e.g. "HN"
  address      TEXT,
  phone        TEXT,
  contact_name TEXT,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipients_type   ON giao_hang_recipients(type);
CREATE INDEX IF NOT EXISTS idx_recipients_office ON giao_hang_recipients(office);

ALTER TABLE giao_hang_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recipients_select" ON giao_hang_recipients;
CREATE POLICY "recipients_select" ON giao_hang_recipients FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "recipients_write"  ON giao_hang_recipients;
CREATE POLICY "recipients_write"  ON giao_hang_recipients FOR ALL    USING (true) WITH CHECK (true);

-- ── 3. Extend giao_hang_don_hang ────────────────────────────────
ALTER TABLE giao_hang_don_hang
  ADD COLUMN IF NOT EXISTS expected_ship_date TEXT,
  ADD COLUMN IF NOT EXISTS recipient_id       UUID REFERENCES giao_hang_recipients(id) ON DELETE SET NULL;

-- ── 4. Extend giao_hang_don_items ───────────────────────────────
ALTER TABLE giao_hang_don_items
  ADD COLUMN IF NOT EXISTS customer_codes    TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expected_receipt  TEXT;   -- TG dự kiến nhận (per item)
